import mongoose from 'mongoose';
import Vocabulary from '../models/Vocabulary.js';
import { cleanEnglishText, cleanHindiText } from '../utils/sanitizer.js';

// @desc    Save a word to user vocabulary
// @route   POST /api/vocabulary
// @access  Private
export const saveWord = async (req, res) => {
  try {
    const { word, definition, hindiMeaning, exampleSentence, phonetic } = req.body;

    if (!word || typeof word !== 'string') {
      return res.status(400).json({ message: 'Word is required' });
    }

    const cleanWord = word.trim().toLowerCase();

    if (!cleanWord || cleanWord.length > 45) {
      return res.status(400).json({ message: 'Word must be between 1 and 45 characters' });
    }

    // Check if word already exists for this user
    const existingWord = await Vocabulary.findOne({
      userId: req.user._id,
      word: cleanWord,
    });

    if (existingWord) {
      return res.status(200).json({
        message: 'Word is already saved in your vocabulary',
        alreadySaved: true,
        vocabulary: existingWord,
      });
    }

    const cleanDef = cleanEnglishText(definition);
    const cleanHindi = cleanHindiText(hindiMeaning, cleanWord);
    const cleanEx = cleanEnglishText(exampleSentence);
    const cleanPhonetic = cleanEnglishText(phonetic);

    const newWord = await Vocabulary.create({
      userId: req.user._id,
      word: cleanWord,
      definition: cleanDef,
      hindiMeaning: cleanHindi,
      exampleSentence: cleanEx,
      phonetic: cleanPhonetic,
    });

    res.status(201).json({
      message: 'Word saved successfully',
      alreadySaved: false,
      vocabulary: newWord,
    });
  } catch (error) {
    // Handle concurrent duplicate save requests cleanly
    if (error.code === 11000) {
      const existing = await Vocabulary.findOne({
        userId: req.user._id,
        word: req.body?.word?.trim()?.toLowerCase(),
      });
      return res.status(200).json({
        message: 'Word is already saved in your vocabulary',
        alreadySaved: true,
        vocabulary: existing,
      });
    }

    console.error('Save word error:', error);
    res.status(500).json({ message: 'Failed to save word to vocabulary' });
  }
};

// @desc    Get all saved words for current user
// @route   GET /api/vocabulary
// @access  Private
export const getSavedWords = async (req, res) => {
  try {
    const words = await Vocabulary.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json(words);
  } catch (error) {
    console.error('Get vocabulary error:', error);
    res.status(500).json({ message: 'Failed to fetch saved vocabulary' });
  }
};

// @desc    Delete a saved word
// @route   DELETE /api/vocabulary/:id
// @access  Private
export const deleteWord = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid vocabulary ID format' });
    }

    const deleted = await Vocabulary.findOneAndDelete({
      _id: id,
      userId: req.user._id,
    });

    if (!deleted) {
      return res.status(404).json({ message: 'Word not found in your vocabulary' });
    }

    res.json({ message: 'Word deleted successfully', id });
  } catch (error) {
    console.error('Delete word error:', error);
    res.status(500).json({ message: 'Failed to delete word' });
  }
};

// @desc    Check if a word is already saved
// @route   GET /api/vocabulary/check?word=...
// @access  Private
export const checkWordSaved = async (req, res) => {
  try {
    const rawWord = req.query.word;
    if (!rawWord || typeof rawWord !== 'string') {
      return res.status(400).json({ message: 'Word query is required' });
    }

    const cleanWord = rawWord.trim().toLowerCase();
    if (!cleanWord || cleanWord.length > 45) {
      return res.status(400).json({ message: 'Invalid word format' });
    }

    const existing = await Vocabulary.findOne({
      userId: req.user._id,
      word: cleanWord,
    });

    res.json({ isSaved: !!existing });
  } catch (error) {
    console.error('Check word error:', error);
    res.status(500).json({ message: 'Failed to check word status' });
  }
};
