import express from 'express';
import cors from 'cors';
import authRoutes from './routes/authRoutes.js';
import wordRoutes from './routes/wordRoutes.js';
import vocabularyRoutes from './routes/vocabularyRoutes.js';
import { notFound, errorHandler } from './middlewares/errorMiddleware.js';

const app = express();

// Middleware
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(express.json());

// Health Check API
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'ReadLingo API is running' });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/words', wordRoutes);
app.use('/api/vocabulary', vocabularyRoutes);

// Error Handling
app.use(notFound);
app.use(errorHandler);

export default app;
