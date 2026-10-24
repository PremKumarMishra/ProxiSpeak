import express from 'express';
import { protect } from '../middleware/auth.js';
import {
  createOrganization,
  getMyOrganizations,
  getOrganizationById,
  updateOrganizationLayout,
  getNearbyUsers,
  deleteOrganization,
  joinOrganization,
} from '../controllers/organizationController.js';

const router = express.Router();
router.post('/', protect, createOrganization);
router.get('/', protect, getMyOrganizations);
router.get('/:id', protect, getOrganizationById);
router.get('/:id/nearby', protect, getNearbyUsers);
router.put('/:id/layout', protect, updateOrganizationLayout);
router.delete('/:id', protect, deleteOrganization);
router.post('/join/:id', protect, joinOrganization);

export { router };
