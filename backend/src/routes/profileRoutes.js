import express from 'express'
import {protect} from '../middleware/auth.js';
import { getUserProfile,updateUserProfile } from '../controllers/profileController.js';
const router = express.Router();

//Routes
router.post('/',protect,getUserProfile);
router.put('/',protect,updateUserProfile)

export {router};