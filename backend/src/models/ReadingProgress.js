import mongoose from 'mongoose';

const readingProgressSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    documentId: {
      type: String,
      required: true,
      trim: true,
    },
    pageNumber: {
      type: Number,
      required: true,
      min: 1,
    },
    totalPages: {
      type: Number,
      min: 1,
      default: null,
    },
    title: {
      type: String,
      trim: true,
      default: '',
      maxLength: 255,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate reading progress records for the same user and document
readingProgressSchema.index({ userId: 1, documentId: 1 }, { unique: true });

const ReadingProgress = mongoose.model('ReadingProgress', readingProgressSchema);

export default ReadingProgress;
