import mongoose, { Schema, Document, Types } from 'mongoose';

export type DeliveryStatus = 'PENDING' | 'QUEUED' | 'SENT' | 'DELIVERED' | 'FAILED';

export interface INotification extends Document {
  clientId:        Types.ObjectId;
  appId:           Types.ObjectId;
  event:           string;
  channel:         'EMAIL' | 'SMS' | 'PUSH' | 'IN_APP';
  userId:          string;
  userEmail?:      string;
  userMobile?:     string;
  data:            Record<string, unknown>;
  status:          DeliveryStatus;
  error?:          string;
  readAt?:         Date;
  sentAt?:         Date;
  renderedSubject?: string;
  renderedBody?:   string;
  createdAt:       Date;
  updatedAt:       Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    clientId:   { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    appId:      { type: Schema.Types.ObjectId, ref: 'App',    required: true },
    event:      { type: String, required: true },
    channel:    { type: String, enum: ['EMAIL', 'SMS', 'PUSH', 'IN_APP'], required: true },
    userId:     { type: String, required: true },
    userEmail:  { type: String },
    userMobile: { type: String },
    data:       { type: Schema.Types.Mixed, default: {} },
    status: {
      type:    String,
      enum:    ['PENDING', 'QUEUED', 'SENT', 'DELIVERED', 'FAILED'],
      default: 'PENDING',
    },
    error:           { type: String },
    readAt:          { type: Date },
    sentAt:          { type: Date },
    renderedSubject: { type: String },
    renderedBody:    { type: String },
  },
  { timestamps: true }
);

// ── Indexes ──────────────────────────────────────────────────────────────────

// Primary fetch query: GET /api/notifications?userId=x
// Covers: clientId + appId + userId filter + createdAt sort
NotificationSchema.index(
  { clientId: 1, appId: 1, userId: 1, createdAt: -1 }
);

// Unread IN_APP count query: { clientId, appId, userId, channel, readAt: null }
// Adding `channel` to the index avoids a collection scan for the unread badge count
NotificationSchema.index(
  { clientId: 1, appId: 1, userId: 1, channel: 1, readAt: 1 }
);

// Admin log queries filtered by status or event
NotificationSchema.index({ clientId: 1, appId: 1, status: 1, createdAt: -1 });

// Generic createdAt for TTL + admin queries
NotificationSchema.index({ createdAt: -1 });

// TTL — auto-delete after 20 days
NotificationSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 20 * 24 * 60 * 60 }
);

export const Notification = mongoose.model<INotification>('Notification', NotificationSchema);
