const express  = require('express');
const {protect}  = require('../middleware/auth');
const {createOrganization,getMyOrganizations} = require('../controllers/organizationController');

const router = express.Router();
router.post('/',protect,createOrganization)
router.get('/',protect,getMyOrganizations)

module.exports = router;