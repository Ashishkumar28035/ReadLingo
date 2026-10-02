import Vocabulary from '../models/Vocabulary.js';

// @desc    Save a word to user vocabulary
// @route   POST /api/vocabulary
// @access  Private
export const saveWord = async (req, res) => {
  try {
    const { word, definition, hindiMeaning, exampleSentence, phonetic } = req.body;

    if (!word) {
      return res.status(400).json({ message: 'Word is required' });
    }

    const cleanWord = word.trim().toLowerCase();

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

    const newWord = await Vocabulary.create({
      userId: req.user._id,
      word: cleanWord,
      definition: definition || '',
      hindiMeaning: hindiMeaning || '',
      exampleSentence: exampleSentence || '',
      phonetic: phonetic || '',
    });

    res.status(201).json({
      message: 'Word saved successfully',
      alreadySaved: false,
      vocabulary: newWord,
    });
  } catch (error) {
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
    const deleted = await Vocabulary.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!deleted) {
      return res.status(404).json({ message: 'Word not found in your vocabulary' });
    }

    res.json({ message: 'Word deleted successfully', id: req.params.id });
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
    if (!rawWord) {
      return res.status(400).json({ message: 'Word query is required' });
    }

    const cleanWord = rawWord.trim().toLowerCase();
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
