import mongoose from 'mongoose';
import dns from 'dns';

// Only configure public DNS if connecting to MongoDB Atlas SRV cluster where local ISP might fail SRV queries
if (process.env.MONGODB_URI && process.env.MONGODB_URI.startsWith('mongodb+srv://')) {
  try {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
  } catch {
    // Fall back to system DNS
  }
}

export const connectDB = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI environment variable is missing in backend/.env');
    }
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      dbName: 'readlingo',
      autoSelectFamily: false,
      family: 4,
    });
    console.log(`MongoDB Connected: ${conn.connection.host} (Database: ${conn.connection.name})`);
    return conn;
  } catch (error) {
    const safeMsg = (error.message || '').replace(/:([^:@]+)@/, ':***@');
    console.error(`MongoDB Connection Error: ${safeMsg}`);
    // Don't exit process in dev if mongo isn't running yet, just log
  }
};
