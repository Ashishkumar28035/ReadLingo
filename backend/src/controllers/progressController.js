import ReadingProgress from '../models/ReadingProgress.js';

// @desc    Save or update reading progress for a document
// @route   POST /api/progress
// @access  Private
export const saveProgress = async (req, res) => {
  try {
    const { documentId, pageNumber, totalPages, title } = req.body;

    // Validate documentId
    if (!documentId || typeof documentId !== 'string') {
      return res.status(400).json({ message: 'Document identifier is required' });
    }

    const cleanDocId = documentId.trim();
    if (!cleanDocId || cleanDocId.length > 256) {
      return res.status(400).json({ message: 'Document identifier must be between 1 and 256 characters' });
    }

    // Validate pageNumber
    const parsedPage = Number(pageNumber);
    if (!Number.isInteger(parsedPage) || parsedPage < 1) {
      return res.status(400).json({ message: 'Page number must be a positive integer greater than or equal to 1' });
    }

    // Validate totalPages if provided
    let parsedTotalPages = null;
    if (totalPages !== undefined && totalPages !== null && totalPages !== '') {
      parsedTotalPages = Number(totalPages);
      if (!Number.isInteger(parsedTotalPages) || parsedTotalPages < 1) {
        return res.status(400).json({ message: 'Total pages must be a positive integer' });
      }
      if (parsedPage > parsedTotalPages) {
        return res.status(400).json({ message: 'Page number cannot exceed total pages' });
      }
    }

    // Sanitize title if provided
    let cleanTitle = '';
    if (title && typeof title === 'string') {
      cleanTitle = title.trim().slice(0, 255);
    }

    // Upsert reading progress record for the authenticated user and document
    const updateData = {
      pageNumber: parsedPage,
      title: cleanTitle,
      ...(parsedTotalPages ? { totalPages: parsedTotalPages } : {}),
    };

    const progress = await ReadingProgress.findOneAndUpdate(
      { userId: req.user._id, documentId: cleanDocId },
      { $set: updateData },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    return res.status(200).json({
      message: 'Reading progress saved successfully',
      progress: {
        id: progress._id,
        documentId: progress.documentId,
        pageNumber: progress.pageNumber,
        totalPages: progress.totalPages,
        title: progress.title,
        updatedAt: progress.updatedAt,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      // Race condition handled safely via findOneAndUpdate retry
      try {
        const retryProgress = await ReadingProgress.findOneAndUpdate(
          { userId: req.user._id, documentId: req.body.documentId.trim() },
          {
            $set: {
              pageNumber: Number(req.body.pageNumber),
              title: (req.body.title || '').trim().slice(0, 255),
            },
          },
          { new: true }
        );
        return res.status(200).json({
          message: 'Reading progress saved successfully',
          progress: retryProgress,
        });
      } catch (retryError) {
        console.error('Retry save progress error:', retryError);
      }
    }

    console.error('Save progress error:', error);
    return res.status(500).json({ message: 'Failed to save reading progress' });
  }
};

// @desc    Get reading progress for a specific document
// @route   GET /api/progress/:documentId
// @access  Private
export const getProgress = async (req, res) => {
  try {
    const { documentId } = req.params;

    if (!documentId || typeof documentId !== 'string') {
      return res.status(400).json({ message: 'Document identifier is required' });
    }

    const cleanDocId = documentId.trim();
    if (!cleanDocId || cleanDocId.length > 256) {
      return res.status(400).json({ message: 'Invalid document identifier' });
    }

    const progress = await ReadingProgress.findOne({
      userId: req.user._id,
      documentId: cleanDocId,
    });

    if (!progress) {
      return res.status(200).json({ progress: null });
    }

    return res.status(200).json({
      progress: {
        id: progress._id,
        documentId: progress.documentId,
        pageNumber: progress.pageNumber,
        totalPages: progress.totalPages,
        title: progress.title,
        updatedAt: progress.updatedAt,
      },
    });
  } catch (error) {
    console.error('Get progress error:', error);
    return res.status(500).json({ message: 'Failed to fetch reading progress' });
  }
};

// @desc    Get all reading progress records for current user
// @route   GET /api/progress
// @access  Private
export const getAllProgress = async (req, res) => {
  try {
    const records = await ReadingProgress.find({ userId: req.user._id })
      .sort({ updatedAt: -1 })
      .limit(50);

    return res.status(200).json({ progressList: records });
  } catch (error) {
    console.error('Get all progress error:', error);
    return res.status(500).json({ message: 'Failed to fetch reading progress list' });
  }
};

// @desc    Delete reading progress for a document
// @route   DELETE /api/progress/:documentId
// @access  Private
export const deleteProgress = async (req, res) => {
  try {
    const { documentId } = req.params;

    if (!documentId || typeof documentId !== 'string') {
      return res.status(400).json({ message: 'Document identifier is required' });
    }

    const cleanDocId = documentId.trim();

    const deleted = await ReadingProgress.findOneAndDelete({
      userId: req.user._id,
      documentId: cleanDocId,
    });

    if (!deleted) {
      return res.status(404).json({ message: 'Reading progress not found' });
    }

    return res.status(200).json({ message: 'Reading progress deleted successfully' });
  } catch (error) {
    console.error('Delete progress error:', error);
    return res.status(500).json({ message: 'Failed to delete reading progress' });
  }
};
