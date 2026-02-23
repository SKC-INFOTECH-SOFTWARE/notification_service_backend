import mongoose from 'mongoose';
import { config } from './index';

export async function connectDatabase(): Promise<void> {
  await mongoose.connect(config.mongodb.uri);
  console.log('[DB] Connected to MongoDB');
}
