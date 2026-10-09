import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import app from './app.js';
import { connectDB } from './config/db.js';
import { validateJwtSecret } from './config/jwtConfig.js';

const PORT = process.env.PORT || 5000;

// Validate JWT secret strength before initializing services
try {
  validateJwtSecret(process.env.JWT_SECRET, process.env.NODE_ENV);
} catch (error) {
  console.error(`[FATAL CONFIGURATION ERROR] ${error.message}`);
  process.exit(1);
}

// Connect to MongoDB
connectDB();

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});

// Handle graceful shutdown for deployment platforms (Docker, Render, Railway, etc.)
const gracefulShutdown = (signal) => {
  console.log(`Received ${signal}. Shutting down gracefully...`);
  server.close(async () => {
    try {
      await mongoose.disconnect();
    } catch {
      // Ignore disconnect errors during exit
    }
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
