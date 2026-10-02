import express from 'express';
import {
  saveWord,
  getSavedWords,
  deleteWord,
  checkWordSaved,
} from '../controllers/vocabularyController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(protect);

router.post('/', saveWord);
router.get('/', getSavedWords);
router.delete('/:id', deleteWord);
router.get('/check', checkWordSaved);

export default router;
