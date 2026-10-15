const User = require('../models/User');
const Organization =  require('../models/Organization');

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

//DELETE api/organizations/:id
exports.deleteOrganization = async (req,res) =>
{
    try
    {
        const organizationID = req.params.id;
        const organization = await Organization.findById(organizationID);
        if (!organization)
        {
            return res.status(404).json({ success: false, message: 'Organization not found' });
        }
        if (organization.owner_id.toString() !== req.user._id.toString())
        {
            return res.status(403).json({ success: false, message: 'Not authorized to delete this organization' });
        }

        // Remove This Organization ID From All Members' Organizations Arrays
        await User.updateMany(
            { organizations: organizationId },
            { $pull: { organizations: organizationId } }
        );
        
        //Remove All User's Position Related With The Organization
        await UserPosition.deleteMany({ organization_id: organizationId });

        //Delete The Organization Itself
        await organization.deleteOne();

        res.status(200).json({
            success: true,
            message: 'Organization and associated records deleted successfully'
        });

    }
    catch (error)
    {
        res.status(500).json({ success: false, message: error.message });
    }
}

//POST api/organizations/join/:id
exports.joinOrganization = async (req,res) => 
{
    try
    {
        const organizationID = req.params.id;
        const userID = req.user._id;
        const organization = Organization.findById(organizationID);
        
        if (!organization)
        {
            return res.status(404).json({ success: false, message: 'Organization not found' });
        }

        //Check If User Is Already A Member
        const isMember = Organization.members.some((member) => member.user_id.toString() === useId.toString());
        if (isMember)
        {
            return res.status(400).json({success : false,message:'User is already a member of this organization'});
        }

        //Add User To The Organization's Members Array With A 'member' Role
        organization.members.push({
            user_id: userID,
            role: 'member',
            joined_at: new Date()
        });
        await organization.save();

        //Add The Organization ID To The User's 'organizations' Array If Not Already Present
        if (!req.user.organizations.includes(organizationID)) 
        {
            req.user.organizations.push(organizationID);
            await req.user.save();
        }


        return res.status(200).json({
            success: true,
            message: 'Successfully joined the organization',
            organization: {
                id: organization._id,
                name: organization.name,
                members_count: organization.members.length
            }
        });


    }
    catch (error)
    {
        res.status(500).json({ success: false, message: error.message });
    }
}