import rateLimit from 'express-rate-limit';
import { config } from '../config';
import { AuthenticatedRequest } from './apiKeyAuth';

export const apiRateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  keyGenerator: (req) => {
    const authReq = req as AuthenticatedRequest;
    // Rate limit per API key (appId)
    return authReq.appId || req.ip || 'unknown';
  },
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const adminRateLimiter = rateLimit({
  windowMs: 60000,
  max: 30,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests',
    },
  },
});
