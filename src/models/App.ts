import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IApp extends Document {
  clientId: Types.ObjectId;
  name: string;
  slug: string;
  apiKeyHash: string;
  apiKeyPrefix: string; // first 8 chars for identification
  isActive: boolean;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const AppSchema = new Schema<IApp>(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    name: { type: String, required: true },
    slug: { type: String, required: true, lowercase: true, trim: true },
    apiKeyHash: { type: String, required: true },
    apiKeyPrefix: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

AppSchema.index({ clientId: 1, slug: 1 }, { unique: true });
AppSchema.index({ apiKeyPrefix: 1 });
AppSchema.index({ isActive: 1 });

export const App = mongoose.model<IApp>('App', AppSchema);
