import 'dotenv/config'
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import helmet from 'helmet';
import connectDB from './src/config/db.js';
import { connectRedis, isRedisConnected } from './src/config/redis.js';
import { setRoomUserState, removeRoomUserState, cacheUserPosition, removeCachedUserPosition, getCachedNearbyUsers, setCachedNearbyUsers } from './src/services/redisService.js';

//Routers
import {router as profileRouter} from './src/routes/profileRoutes.js'
import {router as organizationRouter} from './src/routes/organizationRoutes.js'
import {router as activityRouter} from './src/routes/activityRoutes.js'

//Connect To DataBase & Redis (graceful fallback if Redis is offline)
connectDB();
connectRedis();

const app = express();
const server = http.createServer(app);

const io = new Server(server,{
    cors:
    {
        origin: process.env.CLIENT_URL || 'http://localhost:3000',
        credentials: true
    }
})

//Security MiddleWares
app.use(helmet());
app.use(express.json({limit: '10kb'})); //Body Parser Limit Against Payload Flooding

//CORS Policy
app.use(cors(
    {
        origin: process.env.CLIENT_URL || 'http://localhost:3000',
        credentials: true
    }
));

// Rate Limiting (Prevents Brute-Force Attacks on Auth APIs)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 Minutes
    max: 20, // Limit Each IP To 20 Requests Per Window
    message: { success: false, message: 'Too many login/registration attempts. Try again in 15 minutes.' }
});

//Routes
app.use('/api/profile',profileRouter)
app.use('/api/organizations',organizationRouter)
app.use('/api/activities/',activityRouter);

//Server Health Route
app.get("/health",(req,res) => (
    res.status(200).json({
        status: 'Server is running smoothly!',
        redis: isRedisConnected() ? 'connected' : 'standby/offline'
    })
))


import UserPosition from './src/models/UserPosition.js';

// In-memory Room State Tracker for Instant Multi-user Visibility
// Map: organizationId -> Map(socketId -> userData)
const roomUsers = new Map();

// Socket.io Server
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Join Room / Workspace
    socket.on('room:join', ({ organizationId, userId, user, x, y }) => {
        if (!organizationId) return;
        const orgRoom = String(organizationId);

        socket.join(orgRoom);

        if (!roomUsers.has(orgRoom)) {
            roomUsers.set(orgRoom, new Map());
        }
        const room = roomUsers.get(orgRoom);

        const safeX = typeof x === 'number' ? x : (typeof user?.x === 'number' ? user.x : 24);
        const safeY = typeof y === 'number' ? y : (typeof user?.y === 'number' ? user.y : 48);
        const resolvedUserId = String(userId || user?.uid || socket.id);

        const userData = {
            socketId: socket.id,
            userId: resolvedUserId,
            uid: resolvedUserId,
            name: user?.name || user?.displayName || 'Teammate',
            avatar: user?.avatar || user?.photoURL || '🧑🏻',
            x: safeX,
            y: safeY,
            status: user?.status || 'Available',
            isMuted: user?.isMuted ?? false,
            isSpeaking: user?.isSpeaking ?? false,
            joinedAt: Date.now()
        };

        const isNewJoin = !room.has(socket.id);
        room.set(socket.id, userData);

        // Cache user presence in Redis (non-blocking)
        setRoomUserState(orgRoom, socket.id, userData).catch(() => {});

        if (isNewJoin) {
            console.log(`User ${socket.id} (${userData.name}) joined room: ${orgRoom}`);
        }

        // 1. Send all existing peers in the room directly back to the joining user
        const existingPeers = Array.from(room.values()).filter(p => p.socketId !== socket.id);
        socket.emit('room:current-users', existingPeers);

        // 2. Broadcast to all other peers in the room that a new user joined
        socket.to(orgRoom).emit('room:user-joined', userData);

        // 3. Upsert 2D Geospatial location in MongoDB and perform initial $near query
        if (resolvedUserId && typeof safeX === 'number' && typeof safeY === 'number') {
            UserPosition.findOneAndUpdate(
                { organization_id: orgRoom, uid: resolvedUserId },
                {
                    organization_id: orgRoom,
                    uid: resolvedUserId,
                    socket_id: socket.id,
                    location: { type: 'Point', coordinates: [safeX, safeY] },
                    last_active: new Date()
                },
                { upsert: true, new: true }
            )
            .then(async () => {
                // MongoDB Geospatial $near query on join
                try {
                    const nearby = await UserPosition.find({
                        organization_id: orgRoom,
                        location: {
                            $near: {
                                $geometry: { type: 'Point', coordinates: [safeX, safeY] },
                                $maxDistance: 100
                            }
                        }
                    }).limit(30).lean();

                    socket.emit('proximity:nearby-users', {
                        organizationId: orgRoom,
                        nearby: nearby.map(pos => ({
                            userId: pos.uid,
                            socketId: pos.socket_id,
                            coordinates: pos.location?.coordinates
                        }))
                    });
                } catch (e) {
                    try {
                        const fallbackNearby = await UserPosition.find({
                            organization_id: orgRoom,
                            'location.coordinates': { $near: [safeX, safeY], $maxDistance: 100 }
                        }).limit(30).lean();

                        socket.emit('proximity:nearby-users', {
                            organizationId: orgRoom,
                            nearby: fallbackNearby.map(pos => ({
                                userId: pos.uid,
                                socketId: pos.socket_id,
                                coordinates: pos.location?.coordinates
                            }))
                        });
                    } catch {}
                }
            })
            .catch(() => {});
        }
    });

    // Leave Room / Workspace
    socket.on('room:leave', ({ organizationId, userId }) => {
        if (!organizationId) return;
        const orgRoom = String(organizationId);
        socket.leave(orgRoom);

        const room = roomUsers.get(orgRoom);
        if (room) {
            room.delete(socket.id);
            if (room.size === 0) roomUsers.delete(orgRoom);
        }

        // Remove user presence from Redis (non-blocking)
        removeRoomUserState(orgRoom, socket.id).catch(() => {});
            if (userId) removeCachedUserPosition(orgRoom, userId).catch(() => {});

        socket.to(orgRoom).emit('room:user-left', {
            socketId: socket.id,
            userId: userId || socket.id
        });
        console.log(`User ${socket.id} left room: ${orgRoom}`);
    });

    // Broadcast Avatar Position Updates + MongoDB Geospatial $near Query
    socket.on('user:move', ({ organizationId, userId, x, y, name, avatar }) => {
        if (!organizationId || x == null || y == null) return;
        const orgRoom = String(organizationId);
        const room = roomUsers.get(orgRoom);
        if (room && room.has(socket.id)) {
            const u = room.get(socket.id);
            u.x = x;
            u.y = y;
            if (name) u.name = name;
            if (avatar) u.avatar = avatar;

            // Update user in Redis (non-blocking)
            setRoomUserState(orgRoom, socket.id, u).catch(() => {});
        }

        socket.to(orgRoom).emit('user:moved', {
            socketId: socket.id,
            userId: userId || socket.id,
            x,
            y,
            name,
            avatar
        });

        // Cache user position in Redis & update MongoDB 2D geospatial coordinates
        if (userId) {
            cacheUserPosition(orgRoom, userId, { x, y, socketId: socket.id, name, avatar }).catch(() => {});

            UserPosition.updateOne(
                { organization_id: orgRoom, uid: String(userId) },
                {
                    $set: {
                        socket_id: socket.id,
                        location: { type: 'Point', coordinates: [x, y] },
                        last_active: new Date()
                    }
                },
                { upsert: true }
            )
            .then(async () => {
                // MongoDB Geospatial $near query to discover all users within proximity
                try {
                    const nearbyPositions = await UserPosition.find({
                        organization_id: orgRoom,
                        location: {
                            $near: {
                                $geometry: {
                                    type: 'Point',
                                    coordinates: [x, y]
                                },
                                $maxDistance: 100 // 100m proximity radius
                            }
                        }
                    }).limit(30).lean();

                    const formattedNearby = nearbyPositions.map(pos => ({
                        userId: pos.uid,
                        socketId: pos.socket_id,
                        coordinates: pos.location?.coordinates
                    }));
                    setCachedNearbyUsers(orgRoom, x, y, 100, formattedNearby, 3).catch(() => {});
                    socket.emit('proximity:nearby-users', {
                        organizationId: orgRoom,
                        nearby: formattedNearby
                    });
                } catch (geoErr) {
                    try {
                        const fallbackPositions = await UserPosition.find({
                            organization_id: orgRoom,
                            'location.coordinates': {
                                $near: [x, y],
                                $maxDistance: 100
                            }
                        }).limit(30).lean();

                        socket.emit('proximity:nearby-users', {
                            organizationId: orgRoom,
                            nearby: fallbackPositions.map(pos => ({
                                userId: pos.uid,
                                socketId: pos.socket_id,
                                coordinates: pos.location?.coordinates
                            }))
                        });
                    } catch (e) {}
                }
            })
            .catch(() => {});
        }
    });

    // Query Nearby Users via MongoDB Geospatial $near Query
    socket.on('query:nearby', async ({ organizationId, x, y, maxDistance }) => {
        if (!organizationId || x == null || y == null) return;
        const orgRoom = String(organizationId);
        const radius = typeof maxDistance === 'number' ? maxDistance : 100;

        try {
            const nearby = await UserPosition.find({
                organization_id: orgRoom,
                location: {
                    $near: {
                        $geometry: { type: 'Point', coordinates: [x, y] },
                        $maxDistance: radius
                    }
                }
            }).limit(30).lean();

            socket.emit('query:nearby-result', {
                organizationId: orgRoom,
                nearby: nearby.map(pos => ({
                    userId: pos.uid,
                    socketId: pos.socket_id,
                    coordinates: pos.location?.coordinates
                }))
            });
        } catch (err) {
            try {
                const fallback = await UserPosition.find({
                    organization_id: orgRoom,
                    'location.coordinates': { $near: [x, y], $maxDistance: radius }
                }).limit(30).lean();

                socket.emit('query:nearby-result', {
                    organizationId: orgRoom,
                    nearby: fallback.map(pos => ({
                        userId: pos.uid,
                        socketId: pos.socket_id,
                        coordinates: pos.location?.coordinates
                    }))
                });
            } catch (e) {
                socket.emit('query:nearby-result', { organizationId: orgRoom, nearby: [] });
            }
        }
    });

    // Broadcast User Chatting To All Peers Within The Room (including sender)
    socket.on('user:chat', ({ organizationId, sender, msg, zone, timestamp }) => {
        if (!organizationId || !msg) return;
        const orgRoom = String(organizationId);
        const chatPayload = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            socketId: socket.id,
            senderUid: sender?.uid || socket.id,
            senderName: sender?.name || "Teammate",
            text: msg,
            zone: zone || "Virtual Office",
            createdAt: timestamp || new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        };
        io.in(orgRoom).emit('user:chat', chatPayload);
    });

    // User Mute/Unmute Microphone Within The Room
    socket.on('mic-status', ({ organizationId, sender, isMuted, isSpeaking }) => {
        if (!organizationId) return;
        const orgRoom = String(organizationId);
        const room = roomUsers.get(orgRoom);
        if (room && room.has(socket.id)) {
            const u = room.get(socket.id);
            if (typeof isMuted === 'boolean') u.isMuted = isMuted;
            if (typeof isSpeaking === 'boolean') u.isSpeaking = isSpeaking;

            // Sync mic status in Redis (non-blocking)
            setRoomUserState(orgRoom, socket.id, u).catch(() => {});
        }

        socket.to(orgRoom).emit('mic-status', {
            socketId: socket.id,
            sender,
            isMuted,
            isSpeaking
        });
    });

    // Real-time Office Layout Synchronization
    socket.on('office:layout-update', ({ organizationId, officeLayout }) => {
        if (!organizationId) return;
        socket.to(String(organizationId)).emit('office:layout-updated', {
            organizationId,
            officeLayout
        });
    });

    // WebRTC Peer-to-Peer Audio Signaling Handshakes (Offers, Answers, ICE Candidates)
    socket.on('webrtc:offer', ({ to, offer, fromUser }) => {
        io.to(to).emit('webrtc:offer', { from: socket.id, offer, fromUser });
    });

    socket.on('webrtc:answer', ({ to, answer }) => {
        io.to(to).emit('webrtc:answer', { from: socket.id, answer });
    });

    socket.on('webrtc:ice-candidate', ({ to, candidate }) => {
        io.to(to).emit('webrtc:ice-candidate', { from: socket.id, candidate });
    });

    // Handle Disconnection
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        for (const [orgId, room] of roomUsers.entries()) {
            if (room.has(socket.id)) {
                const user = room.get(socket.id);
                room.delete(socket.id);

                // Remove user from Redis (non-blocking)
                removeRoomUserState(orgId, socket.id).catch(() => {});

                io.to(orgId).emit('room:user-left', {
                    socketId: socket.id,
                    userId: user?.userId || socket.id
                });
                if (room.size === 0) roomUsers.delete(orgId);
            }
        }
        io.emit('player:disconnected', { socketId: socket.id });
    });
});


//Run Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => 
{
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});
