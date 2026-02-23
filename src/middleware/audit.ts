import { AuditLog } from '../models/AuditLog';
import { Types } from 'mongoose';

interface AuditParams {
  clientId?: string;
  appId?: string;
  action: string;
  actor: string;
  resource: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ip?: string;
}

export async function logAudit(params: AuditParams): Promise<void> {
  try {
    await AuditLog.create({
      clientId: params.clientId ? new Types.ObjectId(params.clientId) : undefined,
      appId: params.appId ? new Types.ObjectId(params.appId) : undefined,
      action: params.action,
      actor: params.actor,
      resource: params.resource,
      resourceId: params.resourceId,
      details: params.details,
      ip: params.ip,
    });
  } catch (err) {
    console.error('[AuditLog] Failed to write audit log:', err);
  }
}
