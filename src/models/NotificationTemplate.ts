import mongoose, { Schema, Document, Types } from 'mongoose';

export interface INotificationTemplate extends Document {
  clientId: Types.ObjectId;
  appId: Types.ObjectId;
  event: string; // e.g. 'INVOICE_CREATED', 'PASSWORD_RESET'
  channel: 'EMAIL' | 'SMS' | 'PUSH' | 'IN_APP';
  /** For EMAIL: Handlebars body content inserted into base layout via {{{content}}} */
  subject?: string;
  bodyTemplate: string;
  baseTemplateId?: Types.ObjectId; // override default base template
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationTemplateSchema = new Schema<INotificationTemplate>(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    appId: { type: Schema.Types.ObjectId, ref: 'App', required: true },
    event: { type: String, required: true, uppercase: true, trim: true },
    channel: { type: String, enum: ['EMAIL', 'SMS', 'PUSH', 'IN_APP'], required: true },
    subject: { type: String },
    bodyTemplate: { type: String, required: true },
    baseTemplateId: { type: Schema.Types.ObjectId, ref: 'EmailBaseTemplate' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

NotificationTemplateSchema.index({ clientId: 1, appId: 1, event: 1, channel: 1 }, { unique: true });

export const NotificationTemplate = mongoose.model<INotificationTemplate>(
  'NotificationTemplate',
  NotificationTemplateSchema
);
