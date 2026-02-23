import { Request, Response, NextFunction } from 'express';
import { App } from '../models/App';
import { Client } from '../models/Client';
import { compareApiKey, getApiKeyPrefix } from '../utils/crypto';
import { UnauthorizedError } from '../utils/errors';
import { AuditLog } from '../models/AuditLog';

export interface AuthenticatedRequest extends Request {
  clientId?: string;
  appId?: string;
  apiKeyPrefix?: string;
}

export async function apiKeyAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const apiKey = req.header('x-api-key');

    if (!apiKey) {
      throw new UnauthorizedError('Missing x-api-key header');
    }

    const prefix = getApiKeyPrefix(apiKey);

    // Find apps with matching prefix (narrows search before bcrypt compare)
    const apps = await App.find({ apiKeyPrefix: prefix, isActive: true, revokedAt: null });

    let matchedApp = null;
    for (const app of apps) {
      const isMatch = await compareApiKey(apiKey, app.apiKeyHash);
      if (isMatch) {
        matchedApp = app;
        break;
      }
    }

    if (!matchedApp) {
      throw new UnauthorizedError('Invalid API key');
    }

    // Verify client is active
    const client = await Client.findById(matchedApp.clientId);
    if (!client || !client.isActive) {
      throw new UnauthorizedError('Client is deactivated');
    }

    req.clientId = matchedApp.clientId.toString();
    req.appId = matchedApp._id!.toString();
    req.apiKeyPrefix = prefix;

    next();
  } catch (err) {
    next(err);
  }
}
