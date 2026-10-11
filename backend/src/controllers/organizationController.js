const User = require('../models/User');
const Organization =  require('../models/Organization')

//POST api/organizations
exports.createOrganization = async (req, res) => {
    try 
    {
        let user = await User.findById(req.user._id).populate('organizations');
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
            organizations: user.organizations, 
            joined_at: user.joined_at
        }
        });
    } 
    catch (error) 
    {
        res.status(500).json({ success: false, message: error.message });
    }
};


//GET api/organizations
exports.getMyOrganizations = async (req,res) => 
{
    try
    {

    }
    catch (error)
    {
        res.status(500).json({ success: false, message: error.message });
    }
}