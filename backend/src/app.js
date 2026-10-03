import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import authRoutes from './routes/authRoutes.js';
import wordRoutes from './routes/wordRoutes.js';
import vocabularyRoutes from './routes/vocabularyRoutes.js';
import { notFound, errorHandler } from './middlewares/errorMiddleware.js';
import { wordLookupLimiter } from './middlewares/rateLimiter.js';

const app = express();

// Trust reverse proxies (Cloudflare, Render, Railway, Nginx)
app.set('trust proxy', 1);

// Middleware
const allowedOrigin = process.env.CLIENT_URL || 'http://localhost:5173';
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server) or matching allowedOrigin
      if (!origin || origin === allowedOrigin || process.env.NODE_ENV !== 'production') {
        callback(null, true);
      } else {
        callback(new Error('Blocked by CORS policy'));
      }
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));

// Health Check API with Database Connectivity Status
app.get('/api/health', (req, res) => {
  const isDbConnected = mongoose.connection.readyState === 1;
  res.status(isDbConnected ? 200 : 503).json({
    status: isDbConnected ? 'ok' : 'degraded',
    message: 'ReadLingo API is running',
    database: isDbConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/words', wordLookupLimiter, wordRoutes);
app.use('/api/vocabulary', vocabularyRoutes);

// Error Handling
app.use(notFound);
app.use(errorHandler);

export default app;
