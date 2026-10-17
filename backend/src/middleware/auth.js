import {firebase_auth} from '../config/firebase.js'
import User from '../models/User.js'

export const protect = async (req, res, next) => {
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
        const decodedToken = await firebase_auth.verifyIdToken(token);
        const {uid,email,name,picture} = decodedToken;
        console.log(decodedToken,"??????");
        
        
        // Find User In MongoDB Using The Firebase UID
        req.user = await User.findOne({ firebase_uid: uid});

        if (!req.user) 
        {
            req.user = await User.create({
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
        console.log(err);
        
        return res.status(401).json({ success: false, message: 'Not authorized, invalid or expired token' });
    }
};
