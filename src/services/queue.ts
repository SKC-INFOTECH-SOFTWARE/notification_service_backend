import { Queue } from 'bullmq';
import { getRedisConfig } from '../config/redis';

export interface NotificationJobData {
  notificationId: string;
  clientId: string;
  appId: string;
  event: string;
  channel: 'EMAIL' | 'SMS' | 'PUSH' | 'IN_APP';
  userId: string;
  userEmail?: string;
  userMobile?: string;
  data: Record<string, unknown>;
  title?: string;
  body?: string;
}

let notificationQueue: Queue | null = null;

export function getNotificationQueue(): Queue {
  if (!notificationQueue) {
    notificationQueue = new Queue('notifications', {
      connection: getRedisConfig(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    });
  }
  return notificationQueue;
}
