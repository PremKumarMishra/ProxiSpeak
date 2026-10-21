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

//Server Helath Route
app.get("/health",(req,res) => (
    res.status(200).json({ status: 'Server is running smoothly!' })
))


// Socket.io Server
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
    //Join Room / Workspace
    socket.on('room:join', ({ organizationId }) => {
        socket.join(organizationId);
        console.log(`User ${socket.id} joined room: ${organizationId}`);
    });

    //Broadcast Avatar Position Updates To Peers Within The Same Room
    socket.on('user:move', ({ organizationId, x, y }) => {
        socket.to(organizationId).emit('user:moved', {
        socketId: socket.id,
        x,
        y
        });
    });

    //Broadcast User Chatting To Peers Within The Same Room
    socket.on('user:chat',({organizationId,sender,msg}) => {
        socket.to(organizationId).emit('user:chat', {
            socketId:socket.id,
            sender,
            msg
        });
    });

    //User Mute/Unmute Microphone Within The Room
    socket.on('mic-status',({organizationId,sender,isMuted}) => {
        socket.to(organizationId).emit('mic-status',{
            socketId:socket.id,
            sender,
            isMuted
        })
    })


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
        io.emit('player:disconnected', { socketId: socket.id });
    });
});


//Run Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => 
{
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});
