const User = require('../models/User');
const Organization =  require('../models/Organization')

//POST api/profile
exports.getUserProfile = async (req, res) => {
    try 
    {
        let user = await User.findById(req.user._id);
        if (!user) 
        {
            return res.status(404).json({ success: false, message: 'User record not found' });
        }
        res.status(200).json({
        success: true,
        user: {
            username: user.username,
            email: user.email,
            avatar_url: user.avatar_url,
            organizations_count: user.organizations.length, 
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
exports.updateUserProfile = async (req,res) => 
{
    try
    {
        console.log();
        
    }
    catch (error)
    {
        res.status(500).json({ success: false, message: error.message });
    }
}