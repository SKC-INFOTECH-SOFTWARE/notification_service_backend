import mongoose, { Schema, Document, Types } from 'mongoose';

export type DeliveryStatus = 'PENDING' | 'QUEUED' | 'SENT' | 'DELIVERED' | 'FAILED';

export interface INotification extends Document {
  clientId: Types.ObjectId;
  appId: Types.ObjectId;
  event: string;
  channel: 'EMAIL' | 'SMS' | 'PUSH' | 'IN_APP';
  userId: string;
  userEmail?: string;
  userMobile?: string;
  data: Record<string, unknown>;
  status: DeliveryStatus;
  error?: string;
  readAt?: Date;
  sentAt?: Date;
  renderedSubject?: string;
  renderedBody?: string; // for IN_APP display
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    appId: { type: Schema.Types.ObjectId, ref: 'App', required: true },
    event: { type: String, required: true },
    channel: { type: String, enum: ['EMAIL', 'SMS', 'PUSH', 'IN_APP'], required: true },
    userId: { type: String, required: true },
    userEmail: { type: String },
    userMobile: { type: String },
    data: { type: Schema.Types.Mixed, default: {} },
    status: {
      type: String,
      enum: ['PENDING', 'QUEUED', 'SENT', 'DELIVERED', 'FAILED'],
      default: 'PENDING',
    },
    error: { type: String },
    readAt: { type: Date },
    sentAt: { type: Date },
    renderedSubject: { type: String },
    renderedBody: { type: String },
  },
  { timestamps: true }
);

NotificationSchema.index({ clientId: 1, appId: 1, userId: 1, createdAt: -1 });
NotificationSchema.index({ clientId: 1, appId: 1, userId: 1, readAt: 1 });
NotificationSchema.index({ status: 1 });
NotificationSchema.index({ createdAt: -1 });

// Auto-delete notifications after 20 days to save disk space
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 20 * 24 * 60 * 60 });

export const Notification = mongoose.model<INotification>('Notification', NotificationSchema);
