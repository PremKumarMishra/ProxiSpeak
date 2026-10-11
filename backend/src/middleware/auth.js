const admin = require('../config/firebase');
const User = require('../models/User');

const protect = async (req, res, next) => {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) 
    {
        token = req.headers.authorization.split(' ')[1];
    }
    if (!token) 
    {
        return res.status(401).json({ success: false, message: 'Not authorized, token missing' });
    }
    try 
    {
        // Verify Firebase ID Token
        const decodedToken = await admin.auth().verifyIdToken(token);
        const {uid,email,name,picture} = decodedToken;
        
        // Find User In MongoDB Using The Firebase UID
        req.user = await User.findOne({ firebase_uid: uid});

        if (!req.user) 
        {
            req.user = User.create({
                firebase_uid : uid,
                username: name || email.split('@')[0],
                email:email || `${uid}@placeholder.com`,
                avatar_url:picture || ''
            });
        }
        next();
    } 
    catch (err) 
    {
        return res.status(401).json({ success: false, message: 'Not authorized, invalid or expired token' });
    }
};

module.exports = { protect };