import { z } from 'zod';

export const registerPushTokenSchema = z.object({
  userId: z.string().min(1),
  token: z.string().min(1),
  platform: z.enum(['android', 'ios', 'web']),
  deviceId: z.string().optional(),
});

export const unregisterPushTokenSchema = z.object({
  token: z.string().min(1),
});
