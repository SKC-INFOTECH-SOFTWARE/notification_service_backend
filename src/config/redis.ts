import { config } from './index';

export interface RedisConnectionConfig {
  host: string;
  port: number;
  password?: string;
  maxRetriesPerRequest: null;
}

export function getRedisConfig(): RedisConnectionConfig {
  return {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    maxRetriesPerRequest: null, // required by BullMQ
  };
}
