const express  = require('express');
const {protect}  = require('../middleware/auth');
const {createOrganization,getMyOrganizations,deleteOrganization,joinOrganization} = require('../controllers/organizationController');

const router = express.Router();
router.post('/',protect,createOrganization)
router.get('/',protect,getMyOrganizations)
router.delete('/:id',protect,deleteOrganization)
router.post('/join/:id',protect,joinOrganization)

module.exports = router;