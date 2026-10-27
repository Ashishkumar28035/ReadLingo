import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import helmet from 'helmet';
import authRoutes from './routes/authRoutes.js';
import wordRoutes from './routes/wordRoutes.js';
import vocabularyRoutes from './routes/vocabularyRoutes.js';
import progressRoutes from './routes/progressRoutes.js';
import { notFound, errorHandler } from './middlewares/errorMiddleware.js';
import { wordLookupLimiter } from './middlewares/rateLimiter.js';

const app = express();

// Trust reverse proxies (Cloudflare, Render, Railway, Nginx)
app.set('trust proxy', 1);

// Standard Security Headers for Express JSON API
app.use(
  helmet({
    contentSecurityPolicy: false, // Managed at frontend host (Vercel) to avoid breaking PDF.js blobs/workers
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allows cross-origin frontend API consumption
    crossOriginEmbedderPolicy: false,
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: {
      maxAge: 15552000, // 180 days
      includeSubDomains: false, // Safely omitted pending multi-domain confirmation
      preload: false,
    },
  })
);

// Middleware
// Configure allowed origins (explicit allowlist preserving production and local development origins)
const defaultOrigins = [
  'https://readlingo-app.vercel.app',
  'https://readlingo-three.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
];

const envOrigins = (process.env.CLIENT_URL || '')
  .split(',')
  .map((url) => url.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const allowedOriginsSet = new Set([...defaultOrigins, ...envOrigins]);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server)
      if (!origin) {
        return callback(null, true);
      }

      const normalizedOrigin = origin.replace(/\/+$/, '');
      if (allowedOriginsSet.has(normalizedOrigin) || process.env.NODE_ENV !== 'production') {
        return callback(null, true);
      }

      return callback(new Error('Blocked by CORS policy'));
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
app.use('/api/progress', progressRoutes);

// Error Handling
app.use(notFound);
app.use(errorHandler);

export default app;
