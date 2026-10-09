import express from 'express';
import { lookupWord, getWordDefinition, getWordTranslation, translateSentence } from '../controllers/wordController.js';
import { checkSentenceGrammar } from '../controllers/grammarController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.get('/lookup', lookupWord);
router.get('/definition', getWordDefinition);
router.get('/translate', getWordTranslation);
router.post('/translate-sentence', translateSentence);
router.post('/check-grammar', protect, checkSentenceGrammar);

export default router;
