import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { App } from '../models/App';
import { Client } from '../models/Client';
import { compareApiKey, getApiKeyPrefix } from '../utils/crypto';
import { UnauthorizedError } from '../utils/errors';

export interface AuthenticatedRequest extends Request {
  clientId?: string;
  appId?: string;
  apiKeyPrefix?: string;
}

// ── API Key Cache ────────────────────────────────────────────────────────────
// Avoids bcrypt re-computation (300–500ms) on every request.
// Keyed by SHA-256(rawApiKey) — fast, non-reversible, safe in-process.

interface CachedAuth {
  clientId: string;
  appId: string;
  prefix: string;
  expiresAt: number;
}

const authCache = new Map<string, CachedAuth>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 1000;         // prevent unbounded growth

// Periodically evict expired entries
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of authCache) {
    if (entry.expiresAt <= now) authCache.delete(key);
  }
}, 60_000);

function getCacheKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

// ── Middleware ───────────────────────────────────────────────────────────────

export async function apiKeyAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const apiKey = req.header('x-api-key');
    if (!apiKey) throw new UnauthorizedError('Missing x-api-key header');

    const cacheKey = getCacheKey(apiKey);

    // ── Cache hit — skip bcrypt entirely ──────────────────────────────────
    const cached = authCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      req.clientId    = cached.clientId;
      req.appId       = cached.appId;
      req.apiKeyPrefix = cached.prefix;
      return next();
    }

    // ── Cache miss — run full bcrypt verification ─────────────────────────
    const prefix = getApiKeyPrefix(apiKey);

    // Fetch candidate apps and the client in parallel
    const apps = await App.find({ apiKeyPrefix: prefix, isActive: true, revokedAt: null }).lean();

    let matchedApp: (typeof apps)[number] | null = null;
    for (const app of apps) {
      if (await compareApiKey(apiKey, app.apiKeyHash)) {
        matchedApp = app;
        break;
      }
    }

    if (!matchedApp) throw new UnauthorizedError('Invalid API key');

    // Verify client is active
    const client = await Client.findById(matchedApp.clientId).lean();
    if (!client || !client.isActive) throw new UnauthorizedError('Client is deactivated');

    const clientId = matchedApp.clientId.toString();
    const appId    = matchedApp._id!.toString();

    // ── Populate cache ────────────────────────────────────────────────────
    if (authCache.size >= MAX_CACHE_SIZE) {
      // Evict oldest entry when at capacity
      authCache.delete(authCache.keys().next().value!);
    }
    authCache.set(cacheKey, { clientId, appId, prefix, expiresAt: Date.now() + CACHE_TTL_MS });

    req.clientId     = clientId;
    req.appId        = appId;
    req.apiKeyPrefix = prefix;

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Invalidate a cached API key (call after key rotation/revocation).
 */
export function invalidateApiKeyCache(rawApiKey: string): void {
  authCache.delete(getCacheKey(rawApiKey));
}

/**
 * Expose cache stats for monitoring/debugging.
 */
export function getApiKeyCacheStats() {
  return { size: authCache.size, maxSize: MAX_CACHE_SIZE, ttlMs: CACHE_TTL_MS };
}
