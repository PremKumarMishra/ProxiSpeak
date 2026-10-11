const express = require('express')
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
app.use('/api/profile',authLimiter,require('./src/routes/profileRoutes'))
app.use('/api/organizations',require('./src/routes/organizationRoutes'))

//Server Helath Route
app.get("/health",(req,res) => (
    res.status(200).json({ status: 'Server is running smoothly!' })
))

//Run Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => 
{
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});






