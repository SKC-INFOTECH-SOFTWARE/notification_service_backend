import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest, apiKeyAuth } from '../middleware/apiKeyAuth';
import { apiRateLimiter } from '../middleware/rateLimiter';
import { validate } from '../middleware/validate';
import { sendNotificationSchema } from '../validators/notification';
import { Notification } from '../models/Notification';
import { getNotificationQueue, NotificationJobData } from '../services/queue';
import { logAudit } from '../middleware/audit';
import { ValidationError } from '../utils/errors';

const router = Router();

// All public routes use API key auth + rate limiting
router.use(apiKeyAuth);
router.use(apiRateLimiter);

/**
 * POST /api/notifications/send
 * Send one or more notifications (one per channel).
 */
router.post(
  '/send',
  validate(sendNotificationSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { event, user, channels, data, title, body } = req.body;
      const clientId = req.clientId!;
      const appId = req.appId!;

      // Validate required fields per channel
      if (channels.includes('EMAIL') && !user.email) {
        throw new ValidationError('user.email is required when EMAIL channel is requested');
      }
      if (channels.includes('SMS') && !user.mobile) {
        throw new ValidationError('user.mobile is required when SMS channel is requested');
      }

      // Reject any attempt to send raw HTML
      if (data.html || data.emailHtml || data.template) {
        throw new ValidationError('Applications must not send email HTML or templates. Only event data is accepted.');
      }

      const queue = getNotificationQueue();
      const notifications = [];

      for (const channel of channels) {
        // Create notification record
        const notification = await Notification.create({
          clientId,
          appId,
          event,
          channel,
          userId: user.id,
          userEmail: user.email,
          userMobile: user.mobile,
          data,
          status: 'QUEUED',
        });

        // Enqueue job
        const jobData: NotificationJobData = {
          notificationId: notification._id!.toString(),
          clientId,
          appId,
          event,
          channel,
          userId: user.id,
          userEmail: user.email,
          userMobile: user.mobile,
          data,
          title,
          body,
        };

        await queue.add(`${event}:${channel}`, jobData, {
          priority: channel === 'EMAIL' ? 2 : 1, // IN_APP is higher priority
        });

        notifications.push({
          id: notification._id,
          channel,
          status: 'QUEUED',
        });
      }

      await logAudit({
        clientId,
        appId,
        action: 'NOTIFICATION_SENT',
        actor: `api-key:${req.apiKeyPrefix}`,
        resource: 'Notification',
        details: { event, channels, userId: user.id },
        ip: req.ip,
      });

      res.status(202).json({
        success: true,
        data: { notifications },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/notifications
 * Get notifications for a user.
 */
router.get(
  '/',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { userId, channel, status, limit = '20', offset = '0' } = req.query;

      if (!userId) {
        throw new ValidationError('userId query parameter is required');
      }

      const filter: Record<string, unknown> = {
        clientId: req.clientId,
        appId: req.appId,
        userId: userId as string,
      };

      if (channel) filter.channel = channel;
      if (status) filter.status = status;

      const notifications = await Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip(parseInt(offset as string, 10))
        .limit(Math.min(parseInt(limit as string, 10), 100))
        .select('-data -__v');

      const total = await Notification.countDocuments(filter);
      const unreadCount = await Notification.countDocuments({ ...filter, readAt: null, channel: 'IN_APP' });

      res.json({
        success: true,
        data: {
          notifications,
          total,
          unreadCount,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PATCH /api/notifications/:id/read
 * Mark a notification as read.
 */
router.patch(
  '/:id/read',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      // Try to mark as read (only if not already read)
      let notification = await Notification.findOneAndUpdate(
        {
          _id: req.params.id,
          clientId: req.clientId,
          appId: req.appId,
          readAt: null,
        },
        { readAt: new Date() },
        { new: true }
      );

      // If not found, check if it exists but is already read
      if (!notification) {
        notification = await Notification.findOne({
          _id: req.params.id,
          clientId: req.clientId,
          appId: req.appId,
        });

        if (!notification) {
          res.status(404).json({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Notification not found' },
          });
          return;
        }
        // Already read — return it as-is
      }

      res.json({
        success: true,
        data: { notification },
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
