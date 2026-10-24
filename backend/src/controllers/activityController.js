import User from "../models/User.js";

export const getUserActivites = async (req,res) =>
{
    try
    {
        const user = await User.findById(req.user._id);
        if(!user)
        {
            return res.status(404).json({ success: false, message: 'User record not found' });
        }
        res.status(200).json({
            success:true,
            user : {
                activities : user.activities
            }
        })
        
    }   

    catch (error) 
    {
        res.status(500).json({ success: false, message: error.message });
    }
}

export const addUserActivity = async (req,res) =>
{
    try
    {
        const user = await User.findById(req.user._id);
        console.log(req.body);
        
        if(!user)
        {
            return res.status(404).json({ success: false, message: 'User record not found' });
        }
        if (!req.body.title || !req.body.description)
        {
            return res.status(400).json({ success: false, message: 'Insufficient data provided' });
        }
        user.activities.push({title:req.body.title,description:req.body.description})
        await user.save()
        res.status(201).json({ success: true, message: 'User activities updated' })
    }
    catch (error)
    {
        res.status(500).json({ success: false, message: error.message });
    }
}