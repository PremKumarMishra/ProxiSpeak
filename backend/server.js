import 'dotenv/config'
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import helmet from 'helmet';
import connectDB from './src/config/db.js';

import {router as profileRouter} from './src/routes/profileRoutes.js'
import {router as organizationRouter} from './src/routes/organizationRoutes.js'

//Connect To DataBase
connectDB();

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
    process.env.CLIENT_URL,
    'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3000'
].filter(Boolean);

const corsOptions = {
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
            return callback(null, true);
        }
        return callback(null, true);
    },
    credentials: true
};

const io = new Server(server, {
    cors: corsOptions
});

//Security MiddleWares
app.use(helmet());
app.use(express.json({limit: '10kb'})); //Body Parser Limit Against Payload Flooding

//CORS Policy
app.use(cors(corsOptions));

// Rate Limiting (Prevents Brute-Force Attacks on Auth APIs)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 Minutes
    max: 20, // Limit Each IP To 20 Requests Per Window
    message: { success: false, message: 'Too many login/registration attempts. Try again in 15 minutes.' }
});

//Routes
app.use('/api/profile',profileRouter)
app.use('/api/organizations',organizationRouter)

import mongoose from 'mongoose';
import Organization from './src/models/Organization.js';

// Organization Layout Persistence Endpoint
const memoryLayouts = new Map();

app.put('/api/organizations/:id/layout', async (req, res) => {
    const { id } = req.params;
    const organizationId = req.body.organizationId || id;
    const officeLayout = req.body.officeLayout || req.body.layout;
    const rawLayout = req.body.layout || officeLayout;

    memoryLayouts.set(String(id), officeLayout);

    try {
        if (mongoose.Types.ObjectId.isValid(id)) {
            await Organization.findByIdAndUpdate(id, {
                officeLayout: officeLayout,
                'blueprint.obstacles': officeLayout
            }, { new: true });
        }
    } catch (err) {
        console.error('Failed to persist layout to MongoDB:', err.message);
    }

    // Broadcast layout update to all connected teammates in the office room
    try {
        io.to(String(id)).emit('office:layout-updated', {
            organizationId: id,
            officeLayout,
            layout: rawLayout
        });
    } catch (err) {
        console.error('Socket broadcast error:', err.message);
    }

    res.status(200).json({
        success: true,
        message: 'Organization layout saved and broadcast successfully',
        organizationId: id,
        officeLayout,
        layout: rawLayout
    });
});

app.get('/api/organizations/:id/layout', async (req, res) => {
    const { id } = req.params;
    let layout = memoryLayouts.get(String(id)) || null;

    if (!layout && mongoose.Types.ObjectId.isValid(id)) {
        try {
            const org = await Organization.findById(id).select('officeLayout blueprint');
            if (org) {
                layout = org.officeLayout || org.blueprint?.obstacles || null;
                if (layout) {
                    memoryLayouts.set(String(id), layout);
                }
            }
        } catch (err) {
            console.error('Failed to load layout from MongoDB:', err.message);
        }
    }

    const officeLayout = layout?.objects ? layout : (layout ? { version: 1, objects: [] } : null);

    res.status(200).json({
        success: true,
        organizationId: id,
        officeLayout,
        layout
    });
});

//Server Helath Route
app.get("/health",(req,res) => (
    res.status(200).json({ status: 'Server is running smoothly!' })
))


// Socket.io Server
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
    //Join Room / Workspace
    socket.on('room:join', ({ organizationId, userId, user: userData }) => {
        if (!organizationId) return;
        socket.join(organizationId);
        socket.organizationId = organizationId;
        socket.userId = userId;
        console.log(`User ${userId || socket.id} joined room: ${organizationId}`);

        socket.to(organizationId).emit('room:user-joined', {
            socketId: socket.id,
            userId,
            user: userData
        });
    });

    //Leave Room / Workspace
    socket.on('room:leave', ({ organizationId, userId }) => {
        const room = organizationId || socket.organizationId;
        const uid = userId || socket.userId;
        if (room) {
            socket.leave(room);
            socket.to(room).emit('user:left', {
                socketId: socket.id,
                userId: uid,
                organizationId: room
            });
            console.log(`User ${uid || socket.id} left room: ${room}`);
        }
    });

    //Broadcast Avatar Position Updates To Peers Within The Same Room
    socket.on('user:move', ({ organizationId, userId, x, y, name, avatar }) => {
        const room = organizationId || socket.organizationId;
        const uid = userId || socket.userId;
        if (!room) return;

        socket.to(room).emit('user:moved', {
            socketId: socket.id,
            userId: uid,
            organizationId: room,
            x,
            y,
            name,
            avatar
        });
    });

    //Broadcast User Chatting To Peers Within The Same Room
    socket.on('user:chat',({organizationId,sender,msg}) => {
        const room = organizationId || socket.organizationId;
        if (!room) return;
        socket.to(room).emit('user:chat', {
            socketId:socket.id,
            sender,
            msg
        });
    });

    //User Mute/Unmute Microphone Within The Room
    socket.on('mic-status',({organizationId,sender,isMuted}) => {
        const room = organizationId || socket.organizationId;
        if (!room) return;
        socket.to(room).emit('mic-status',{
            socketId:socket.id,
            sender,
            isMuted
        });
    });


    //WebRTC Peer-to-Peer Signaling Handshakes (Offers, Answers, ICE Candidates)
    socket.on('webrtc:offer', ({ to, offer }) => {
        io.to(to).emit('webrtc:offer', { from: socket.id, offer });
    });

    socket.on('webrtc:answer', ({ to, answer }) => {
        io.to(to).emit('webrtc:answer', { from: socket.id, answer });
    });

    socket.on('webrtc:ice-candidate', ({ to, candidate }) => {
        io.to(to).emit('webrtc:ice-candidate', { from: socket.id, candidate });
    });

    //Handle Disconnection
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        if (socket.organizationId) {
            socket.to(socket.organizationId).emit('user:left', {
                socketId: socket.id,
                userId: socket.userId,
                organizationId: socket.organizationId
            });
        }
        io.emit('player:disconnected', { socketId: socket.id, userId: socket.userId });
    });
});


//Run Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => 
{
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});
