const express = require('express');
const {protect} = require('../middleware/auth')
const {getUserProfile,updateUserProfile} = require('../controllers/profileController')
const router = express.Router();

//Routes
router.post('/',protect,getUserProfile);
router.put('/',protect,updateUserProfile)

module.exports = router;