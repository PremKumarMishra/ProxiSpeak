const express = require('express');
const http = require('http');
const {Server} = require('socket.io');
const rateLimit = require('express-rate-limit')
const cors = require('cors')
const helmet = require('helmet')
const dotenv = require('dotenv')
const connectDB = require('./src/config/db')


//Load ENV File
dotenv.config();

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
app.use('/api/profile',authLimiter,require('./src/routes/profileRoutes'))
app.use('/api/organizations',require('./src/routes/organizationRoutes'))

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
