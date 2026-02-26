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

router.use(apiKeyAuth);
router.use(apiRateLimiter);

/**
 * POST /api/notifications/send
 */
router.post(
  '/send',
  validate(sendNotificationSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { event, user, channels, data, title, body } = req.body;
      const clientId = req.clientId!;
      const appId    = req.appId!;

      if (channels.includes('EMAIL') && !user.email) {
        throw new ValidationError('user.email is required when EMAIL channel is requested');
      }
      if (channels.includes('SMS') && !user.mobile) {
        throw new ValidationError('user.mobile is required when SMS channel is requested');
      }
      if (data.html || data.emailHtml || data.template) {
        throw new ValidationError('Applications must not send email HTML or templates. Only event data is accepted.');
      }

      const queue = getNotificationQueue();

      // Create all notification records in parallel
      const notifications = await Promise.all(
        channels.map(async (channel: string) => {
          const notification = await Notification.create({
            clientId,
            appId,
            event,
            channel,
            userId:      user.id,
            userEmail:   user.email,
            userMobile:  user.mobile,
            data,
            status: 'QUEUED',
          });

          const jobData: NotificationJobData = {
            notificationId: notification._id!.toString(),
            clientId,
            appId,
            event,
            channel: channel as NotificationJobData['channel'],
            userId:     user.id,
            userEmail:  user.email,
            userMobile: user.mobile,
            data,
            title,
            body,
          };

          await queue.add(`${event}:${channel}`, jobData, {
            priority: channel === 'EMAIL' ? 2 : 1,
          });

          return { id: notification._id, channel, status: 'QUEUED' };
        })
      );

      // Fire-and-forget audit log
      logAudit({
        clientId,
        appId,
        action:   'NOTIFICATION_SENT',
        actor:    `api-key:${req.apiKeyPrefix}`,
        resource: 'Notification',
        details:  { event, channels, userId: user.id },
        ip:       req.ip,
      });

      res.status(202).json({ success: true, data: { notifications } });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/notifications
 * All three DB queries run in parallel.
 */
router.get(
  '/',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { userId, channel, status } = req.query;
      const limit  = Math.min(parseInt((req.query.limit  as string) || '20', 10), 100);
      const offset = parseInt((req.query.offset as string) || '0', 10);

      if (!userId) throw new ValidationError('userId query parameter is required');

      const baseFilter: Record<string, unknown> = {
        clientId: req.clientId,
        appId:    req.appId,
        userId:   userId as string,
      };

      if (channel) baseFilter.channel = channel;
      if (status)  baseFilter.status  = status;

      // Run all three queries in parallel — eliminates ~2× round-trip overhead
      const [notifications, total, unreadCount] = await Promise.all([
        Notification.find(baseFilter)
          .sort({ createdAt: -1 })
          .skip(offset)
          .limit(limit)
          .select('-data -__v')
          .lean(),

        Notification.countDocuments(baseFilter),

        // Unread IN_APP count — uses the (clientId, appId, userId, readAt) index
        Notification.countDocuments({
          clientId:  req.clientId,
          appId:     req.appId,
          userId:    userId as string,
          channel:   'IN_APP',
          readAt:    null,
        }),
      ]);

      res.json({ success: true, data: { notifications, total, unreadCount } });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PATCH /api/notifications/:id/read
 */
router.patch(
  '/:id/read',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      let notification = await Notification.findOneAndUpdate(
        {
          _id:      req.params.id,
          clientId: req.clientId,
          appId:    req.appId,
          readAt:   null,
        },
        { readAt: new Date() },
        { new: true }
      );

      if (!notification) {
        notification = await Notification.findOne({
          _id:      req.params.id,
          clientId: req.clientId,
          appId:    req.appId,
        });

        if (!notification) {
          res.status(404).json({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Notification not found' },
          });
          return;
        }
      }

      res.json({ success: true, data: { notification } });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
