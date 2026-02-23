import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IAuditLog extends Document {
  clientId?: Types.ObjectId;
  appId?: Types.ObjectId;
  action: string;
  actor: string; // 'api-key:<prefix>' or 'admin:<email>'
  resource: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ip?: string;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client' },
    appId: { type: Schema.Types.ObjectId, ref: 'App' },
    action: { type: String, required: true },
    actor: { type: String, required: true },
    resource: { type: String, required: true },
    resourceId: { type: String },
    details: { type: Schema.Types.Mixed },
    ip: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AuditLogSchema.index({ clientId: 1, createdAt: -1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });
AuditLogSchema.index({ createdAt: -1 });

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
