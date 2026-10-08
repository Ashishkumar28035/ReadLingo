import express from 'express';
import { lookupWord, getWordDefinition, getWordTranslation, translateSentence } from '../controllers/wordController.js';

const router = express.Router();

router.get('/lookup', lookupWord);
router.get('/definition', getWordDefinition);
router.get('/translate', getWordTranslation);
router.all('/translate-sentence', translateSentence);

export default router;
