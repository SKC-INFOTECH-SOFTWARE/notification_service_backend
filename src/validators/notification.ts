import { z } from 'zod';

export const sendNotificationSchema = z.object({
  event: z.string().min(1).max(100).transform((v) => v.toUpperCase().trim()),
  user: z.object({
    id: z.string().min(1),
    email: z.string().email().optional(),
    mobile: z.string().optional(),
  }),
  channels: z.array(z.enum(['EMAIL', 'SMS', 'PUSH', 'IN_APP'])).min(1),
  data: z.record(z.unknown()).default({}),
  title: z.string().max(200).optional(),
  body: z.string().max(5000),
});

export type SendNotificationInput = z.infer<typeof sendNotificationSchema>;
