import express from 'express'
import { protect } from '../middleware/auth.js'
import { getUserActivites,addUserActivity } from '../controllers/activityController.js'
import { get } from 'mongoose'

const router = express.Router()
router.get("/",protect,getUserActivites)
router.post("/",protect,addUserActivity)

export {router}