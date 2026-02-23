import mongoose, { Schema, Document, Types } from 'mongoose';

export type ChannelType = 'EMAIL' | 'SMS' | 'PUSH';

export interface INotificationCredential extends Document {
  clientId: Types.ObjectId;
  channel: ChannelType;
  provider: string; // e.g. 'smtp', 'sendgrid', 'twilio', 'fcm'
  config: Record<string, unknown>; // encrypted at rest
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationCredentialSchema = new Schema<INotificationCredential>(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    channel: { type: String, enum: ['EMAIL', 'SMS', 'PUSH'], required: true },
    provider: { type: String, required: true },
    config: { type: Schema.Types.Mixed, required: true }, // stored encrypted
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

NotificationCredentialSchema.index({ clientId: 1, channel: 1 });

export const NotificationCredential = mongoose.model<INotificationCredential>(
  'NotificationCredential',
  NotificationCredentialSchema
);
