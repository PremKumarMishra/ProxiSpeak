import User from '../models/User.js'
import Organization from '../models/Organization.js';

//POST api/profile
export const getUserProfile = async (req, res) => {
    try 
    {
        let user = await User.findById(req.user._id);
        if (!user) 
        {
            return res.status(404).json({ success: false, message: 'User record not found' });
        }

        //Count User-Joined Orgz Count And User-Owned Orgz Count
        const [orgJoined,orgOwns] = await Promise.all([
            Organization.countDocuments({owner_id:req.user._id}),
            Organization.countDocuments({'members.user_id':req.user._id,owner_id : {$ne:req.user._id}})
        ]);

        res.status(200).json(
        {
            success: true,
            user: {
                username: user.username,
                email: user.email,
                avatar_url: user.avatar_url,
                organizations_joined: orgJoined, 
                organizations_owns : orgOwns,
                joined_at: user.joined_at
            }
        });
    } 
    catch (error) 
    {
        res.status(500).json({ success: false, message: error.message });
    }
};


//PUT api/profile
export const updateUserProfile = async (req,res) => 
{
    try
    {
        const user = await User.findById(req.user._id);
        const new_username = req.body?.username || req.body?.name || req.body?.displayName || '';
        const new_avatar = req.body?.avatar_url || req.body?.photoURL || req.body?.avatar || '';

        if (!user)
        {
            return res.status(404).json({ success: false, message: 'User record not found' });
        }
        if (!new_username && !new_avatar)
        {   
            return res.status(400).json({ success: false, message: 'Insufficient/Invalid data provided' });
        }
        
        if (new_username) {
            user.username = new_username;
        }
        if (new_avatar) {
            user.avatar_url = new_avatar;
        }
        await user.save();
        res.status(200).json({
            success: true,
            message: 'New changes have been applied',
            user: {
                username: user.username,
                email: user.email,
                avatar_url: user.avatar_url
            }
        });
    }
    catch (error)
    {
        res.status(500).json({ success: false, message: error.message });
    }
}
