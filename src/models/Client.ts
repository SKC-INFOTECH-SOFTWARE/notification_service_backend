import mongoose, { Schema, Document } from 'mongoose';

export interface IClient extends Document {
  name: string;
  slug: string;
  branding: {
    logoUrl: string;
    brandColor: string;
    companyName: string;
    footerText: string;
  };
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ClientSchema = new Schema<IClient>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    branding: {
      logoUrl: { type: String, default: '' },
      brandColor: { type: String, default: '#007bff' },
      companyName: { type: String, default: '' },
      footerText: { type: String, default: '' },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

ClientSchema.index({ slug: 1 });
ClientSchema.index({ isActive: 1 });

export const Client = mongoose.model<IClient>('Client', ClientSchema);
