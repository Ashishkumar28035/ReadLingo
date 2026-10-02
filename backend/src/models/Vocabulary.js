import mongoose from 'mongoose';

const vocabularySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    word: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    definition: {
      type: String,
      default: '',
    },
    hindiMeaning: {
      type: String,
      default: '',
    },
    exampleSentence: {
      type: String,
      default: '',
    },
    phonetic: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate saved words for the same user
vocabularySchema.index({ userId: 1, word: 1 }, { unique: true });

const Vocabulary = mongoose.model('Vocabulary', vocabularySchema);

export default Vocabulary;
