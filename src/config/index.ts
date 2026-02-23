import dotenv from 'dotenv';
dotenv.config();

/**
 * Parse a Redis URL (redis://user:pass@host:port) into components,
 * or fall back to individual REDIS_HOST/REDIS_PORT/REDIS_PASSWORD env vars.
 */
function parseRedisConfig() {
  const url = process.env.REDIS_URL;
  if (url) {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || 'localhost',
      port: parseInt(parsed.port || '6379', 10),
      password: parsed.password || undefined,
    };
  }
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  };
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),

  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/notification_service',
  },

  redis: parseRedisConfig(),

  admin: {
    jwtSecret: process.env.JWT_SECRET || process.env.ADMIN_JWT_SECRET || 'dev-secret-change-me',
    defaultEmail: process.env.ADMIN_DEFAULT_EMAIL || 'admin@notification.local',
    defaultPassword: process.env.ADMIN_DEFAULT_PASSWORD || 'change-this-password',
  },

  credentialEncryptionKey: process.env.CREDENTIAL_ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },

  frontendUrl: process.env.FRONTEND_URL || '*',
};
