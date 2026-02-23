import { Worker, Job } from 'bullmq';
import { getRedisConfig } from './config/redis';
import { connectDatabase } from './config/database';
import { config } from './config';
import { NotificationJobData } from './services/queue';
import { Notification } from './models/Notification';
import { renderEmail } from './services/templateEngine';
import { sendEmail } from './services/emailSender';
import { sendSMS } from './services/smsSender';
import { sendPushNotification } from './services/firebasePush';
import { emitToUser } from './services/socketManager';

async function processNotification(job: Job<NotificationJobData>): Promise<void> {
  const { notificationId, clientId, appId, event, channel, userId, userEmail, userMobile, data, title, body } = job.data;

  console.log(`[Worker] Processing ${channel} notification: ${notificationId} for event ${event}`);

  try {
    switch (channel) {
      case 'EMAIL': {
        if (!userEmail) throw new Error('User email is required for EMAIL channel');

        const rendered = await renderEmail(clientId, appId, event, data, body, title);

        if (rendered) {
          await sendEmail({
            clientId,
            to: userEmail,
            subject: rendered.subject,
            html: rendered.html,
          });

          await Notification.findByIdAndUpdate(notificationId, {
            status: 'SENT',
            sentAt: new Date(),
            renderedSubject: rendered.subject,
          });
        } else {
          // No template and no fallback body - skip silently
          console.log(`[Worker] No email template or fallback for event ${event}, marking as SENT`);
          await Notification.findByIdAndUpdate(notificationId, {
            status: 'SENT',
            sentAt: new Date(),
            renderedSubject: title || event,
          });
        }
        break;
      }

      case 'IN_APP': {
        const subject = title || event;
        const content = body || '';

        await Notification.findByIdAndUpdate(notificationId, {
          status: 'DELIVERED',
          sentAt: new Date(),
          renderedSubject: subject,
          renderedBody: content,
        });

        // Emit real-time via Socket.IO
        emitToUser(clientId, appId, userId, 'notification', {
          id: notificationId,
          event,
          subject,
          body: content,
          data,
          createdAt: new Date(),
        });
        break;
      }

      case 'SMS': {
        if (!userMobile) throw new Error('User mobile is required for SMS channel');

        const content = body || '';
        await sendSMS(clientId, userMobile, content);

        await Notification.findByIdAndUpdate(notificationId, {
          status: 'SENT',
          sentAt: new Date(),
          renderedBody: content,
        });
        break;
      }

      case 'PUSH': {
        const subject = title || event;
        const content = body || '';

        // Convert data values to strings for FCM data payload
        const fcmData: Record<string, string> = {
          notificationId,
          event,
        };
        for (const [key, value] of Object.entries(data)) {
          fcmData[key] = String(value);
        }

        const pushResult = await sendPushNotification(clientId, appId, userId, {
          title: subject,
          body: content,
          data: fcmData,
        });

        const pushStatus = pushResult.successCount > 0 ? 'SENT' : 'FAILED';
        const pushError =
          pushResult.failureCount > 0 && pushResult.successCount === 0
            ? `All ${pushResult.failureCount} push deliveries failed`
            : undefined;

        await Notification.findByIdAndUpdate(notificationId, {
          status: pushStatus,
          sentAt: pushStatus === 'SENT' ? new Date() : undefined,
          error: pushError,
          renderedSubject: subject,
          renderedBody: content,
        });
        break;
      }
    }

    console.log(`[Worker] Successfully processed ${channel} notification: ${notificationId}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Worker] Failed to process notification ${notificationId}:`, message);

    await Notification.findByIdAndUpdate(notificationId, {
      status: 'FAILED',
      error: message,
    });

    throw err; // re-throw so BullMQ retries
  }
}

async function startWorker(): Promise<void> {
  await connectDatabase();

  const worker = new Worker<NotificationJobData>('notifications', processNotification, {
    connection: getRedisConfig(),
    concurrency: 10,
  });

  worker.on('completed', (job) => {
    console.log(`[Worker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job?.id} failed:`, err.message);
  });

  console.log('[Worker] Notification worker started');
}

startWorker().catch((err) => {
  console.error('[Worker] Failed to start:', err);
  process.exit(1);
});
