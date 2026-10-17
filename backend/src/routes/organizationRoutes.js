import express from 'express';
import { protect } from '../middleware/auth.js';
import {createOrganization,getMyOrganizations,deleteOrganization,joinOrganization} from '../controllers/organizationController.js';

const router = express.Router();
router.post('/',protect,createOrganization)
router.get('/',protect,getMyOrganizations)
router.delete('/:id',protect,deleteOrganization)
router.post('/join/:id',protect,joinOrganization)

export {router}