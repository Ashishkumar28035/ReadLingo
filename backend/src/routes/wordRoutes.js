import express from 'express';
import { lookupWord, getWordDefinition, getWordTranslation } from '../controllers/wordController.js';

const router = express.Router();

router.get('/lookup', lookupWord);
router.get('/definition', getWordDefinition);
router.get('/translate', getWordTranslation);

export default router;
