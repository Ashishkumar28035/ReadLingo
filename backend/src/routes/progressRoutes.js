import express from 'express';
import {
  saveProgress,
  getProgress,
  getAllProgress,
  deleteProgress,
} from '../controllers/progressController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

// All progress endpoints require authentication
router.use(protect);

router.post('/', saveProgress);
router.get('/', getAllProgress);
router.get('/:documentId', getProgress);
router.delete('/:documentId', deleteProgress);

export default router;
