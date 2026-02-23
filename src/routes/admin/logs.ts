import { Router, Response, NextFunction } from 'express';
import { AdminRequest, adminAuth } from '../../middleware/adminAuth';
import { AuditLog } from '../../models/AuditLog';
import { Notification } from '../../models/Notification';

const router = Router();
router.use(adminAuth);

/**
 * GET /api/admin/logs/audit — Audit logs.
 */
router.get('/audit', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const filter: Record<string, unknown> = {};
    if (req.query.clientId) filter.clientId = req.query.clientId;
    if (req.query.action) filter.action = req.query.action;

    const limit = Math.min(parseInt(req.query.limit as string || '50', 10), 200);
    const offset = parseInt(req.query.offset as string || '0', 10);

    const [logs, total] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).skip(offset).limit(limit),
      AuditLog.countDocuments(filter),
    ]);

    res.json({ success: true, data: { logs, total } });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/logs/notifications — Notification delivery logs.
 */
router.get('/notifications', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const filter: Record<string, unknown> = {};
    if (req.query.clientId) filter.clientId = req.query.clientId;
    if (req.query.appId) filter.appId = req.query.appId;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.event) filter.event = (req.query.event as string).toUpperCase();
    if (req.query.channel) filter.channel = req.query.channel;
    if (req.query.userId) filter.userId = req.query.userId;

    const limit = Math.min(parseInt(req.query.limit as string || '50', 10), 200);
    const offset = parseInt(req.query.offset as string || '0', 10);

    const [notifications, total] = await Promise.all([
      Notification.find(filter)
        .select('-renderedBody')
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit),
      Notification.countDocuments(filter),
    ]);

    res.json({ success: true, data: { notifications, total } });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/logs/stats — Aggregate stats.
 */
router.get('/stats', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const match: Record<string, unknown> = {};
    if (req.query.clientId) match.clientId = req.query.clientId;

    const [statusCounts, channelCounts, totalToday] = await Promise.all([
      Notification.aggregate([
        { $match: match },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Notification.aggregate([
        { $match: match },
        { $group: { _id: '$channel', count: { $sum: 1 } } },
      ]),
      Notification.countDocuments({
        ...match,
        createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      }),
    ]);

    res.json({
      success: true,
      data: {
        byStatus: Object.fromEntries(statusCounts.map((s: any) => [s._id, s.count])),
        byChannel: Object.fromEntries(channelCounts.map((c: any) => [c._id, c.count])),
        totalToday,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
