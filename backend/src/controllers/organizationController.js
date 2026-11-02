import { cacheOfficeLayout, getCachedOfficeLayout, getCachedNearbyUsers, setCachedNearbyUsers } from '../services/redisService.js';
import User from '../models/User.js';
import Organization from '../models/Organization.js';
import UserPosition from '../models/UserPosition.js';

//POST api/organizations
export const createOrganization = async (req, res) => {
    try 
    {
        let user = await User.findById(req.user._id);
        if (!user) 
        {
            return res.status(404).json({ success: false, message: 'User record not found' });
        }
        
        if (!req.body.name || !req.body.type)
        {
            return res.status(400).json({ success: false, message: 'Insufficient data provided' });
        }
        console.log("Creating Organization");
        
        //Create Organization
        const organization = await Organization.create(
            {
                name : req.body.name,
                owner_id: user._id,
                members : [{
                    user_id: user._id,
                    role: 'owner'
                }],
            }
        )
        user.organizations.push(organization);
        await user.save()
        
        res.status(200).json({
        success: true,
        organization : {
            id: organization._id,
            name: organization.name,
            role: 'owner',
            member_count: organization.members.length, 
        }
        });
    } 
    catch (error) 
    {
        res.status(500).json({ success: false, message: error.message });
    }
};


//GET api/organizations
export const getMyOrganizations = async (req,res) => 
{
    try
    {
        const organizations = await Organization.aggregate([
            {
                $match : {'members.user_id' : req.user._id}
            },
            {
                $project : {
                    _id: 0,
                    id: '$_id',
                    name: 1,
                    office_layout: 1,
                    member_count : {$size: '$members'},
                    user_role: {
                        $let: {
                            vars: {
                                memberInfo : {
                                    $arrayElemAt : [
                                        {
                                            $filter : {
                                                input : '$members',
                                                as : 'm',
                                                cond: { $eq: ['$$m.user_id', req.user._id] }
                                            }
                                        }
                                        ,0
                                    ]
                                }
                            },
                            in: '$$memberInfo.role'
                        }
                    },
                    sortPriority : {$cond: [{ $eq: ['$owner_id', req.user._id] }, 0, 1]}
                }
            },
            {
                $sort : {sortPriority:1,created_at:-1}
            },
            {
                $project : {sortPriority:0}
            }
        ]);
        
        res.status(200).json({success:true,organizations})
        
    }
    catch (error)
    {
        res.status(500).json({ success: false, message: error.message });
    }
}

//GET api/organizations/:id
export const getOrganizationById = async (req, res) => {
    try {
        const organizationId = req.params.id;
        const organization = await Organization.findById(organizationId);
        if (!organization) {
            return res.status(404).json({ success: false, message: 'Organization not found' });
        }
        res.status(200).json({
            success: true,
            organization: {
                id: organization._id,
                _id: organization._id,
                name: organization.name,
                owner_id: organization.owner_id,
                office_layout: organization.office_layout || { version: 1, objects: [] },
                member_count: organization.members?.length || 0,
                members: organization.members || []
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

//PUT api/organizations/:id/layout
export const updateOrganizationLayout = async (req, res) => {
    try {
        const organizationId = req.params.id;
        const organization = await Organization.findById(organizationId);
        if (!organization) {
            return res.status(404).json({ success: false, message: 'Organization not found' });
        }

        // Only allow owner of the organization to edit the layout not others
        if (organization.owner_id.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: 'Only the owner of the organization can edit the layout' });
        }

        const incomingLayout = req.body.office_layout || req.body.layout || req.body;
        organization.office_layout = incomingLayout;
        organization.markModified('office_layout');
        await organization.save();

        res.status(200).json({
            success: true,
            message: 'Office layout updated successfully',
            office_layout: organization.office_layout
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

//GET api/organizations/:id/nearby
// Uses MongoDB geospatial $near query to find active users within proximity radius
export const getNearbyUsers = async (req, res) => {
    try {
        const organizationId = String(req.params.id);
        const x = parseFloat(req.query.x);
        const y = parseFloat(req.query.y);
        const radius = parseFloat(req.query.radius) || 25;

        if (isNaN(x) || isNaN(y)) {
            return res.status(400).json({ success: false, message: 'Valid x and y coordinates are required' });
        }

        try {
            // MongoDB 2dsphere $near geospatial query
            const nearbyUsers = await UserPosition.find({
                organization_id: organizationId,
                location: {
                    $near: {
                        $geometry: {
                            type: 'Point',
                            coordinates: [x, y]
                        },
                        $maxDistance: radius
                    }
                }
            }).limit(50).lean();

            return res.status(200).json({
                success: true,
                count: nearbyUsers.length,
                users: nearbyUsers
            });
        } catch (geoErr) {
            // Fallback for 2d index
            const nearbyUsers = await UserPosition.find({
                organization_id: organizationId,
                'location.coordinates': {
                    $near: [x, y],
                    $maxDistance: radius
                }
            }).limit(50).lean();

            return res.status(200).json({
                success: true,
                count: nearbyUsers.length,
                users: nearbyUsers
            });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

//DELETE api/organizations/:id
export const deleteOrganization = async (req,res) =>
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
            { organizations: organizationID },
            { $pull: { organizations: organizationID } }
        );

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
export const joinOrganization = async (req,res) => 
{
    try
    {
        const organizationID = req.params.id;
        const userID = req.user._id;
        const organization = await Organization.findById(organizationID);
        
        if (!organization)
        {
            return res.status(404).json({ success: false, message: 'Organization not found' });
        }

        //Check If User Is Already A Member
        const isMember = organization.members.some((member) => member.user_id.toString() === userID.toString());
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
