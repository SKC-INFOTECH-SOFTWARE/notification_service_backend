import mongoose, { Schema, Document, Types } from 'mongoose';

export type DevicePlatform = 'android' | 'ios' | 'web';

export interface IPushToken extends Document {
  clientId: Types.ObjectId;
  appId: Types.ObjectId;
  userId: string;
  token: string;
  platform: DevicePlatform;
  deviceId?: string; // optional unique device identifier to prevent duplicates
  isActive: boolean;
  lastUsedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PushTokenSchema = new Schema<IPushToken>(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    appId: { type: Schema.Types.ObjectId, ref: 'App', required: true },
    userId: { type: String, required: true },
    token: { type: String, required: true },
    platform: { type: String, enum: ['android', 'ios', 'web'], required: true },
    deviceId: { type: String },
    isActive: { type: Boolean, default: true },
    lastUsedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// A token string is unique per client+app (same physical device token can't belong to two users)
PushTokenSchema.index({ clientId: 1, appId: 1, token: 1 }, { unique: true });
// Fast lookup: all active tokens for a user
PushTokenSchema.index({ clientId: 1, appId: 1, userId: 1, isActive: 1 });

export const PushToken = mongoose.model<IPushToken>('PushToken', PushTokenSchema);
