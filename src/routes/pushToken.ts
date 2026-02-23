import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest, apiKeyAuth } from '../middleware/apiKeyAuth';
import { apiRateLimiter } from '../middleware/rateLimiter';
import { validate } from '../middleware/validate';
import { registerPushTokenSchema, unregisterPushTokenSchema } from '../validators/pushToken';
import { PushToken } from '../models/PushToken';
import { logAudit } from '../middleware/audit';

const router = Router();

router.use(apiKeyAuth);
router.use(apiRateLimiter);

/**
 * POST /api/push-tokens/register
 * Register a device's FCM token. Called by the mobile/web app after
 * obtaining a token from Firebase client SDK.
 *
 * If the same token already exists, it updates the userId (device changed hands)
 * and reactivates it.
 */
router.post(
  '/register',
  validate(registerPushTokenSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { userId, token, platform, deviceId } = req.body;
      const clientId = req.clientId!;
      const appId = req.appId!;

      // Upsert: same token under same client+app → update userId/platform/reactivate
      const pushToken = await PushToken.findOneAndUpdate(
        { clientId, appId, token },
        {
          userId,
          platform,
          deviceId,
          isActive: true,
          lastUsedAt: new Date(),
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      // If a deviceId is provided, deactivate other tokens for the same device
      // (device got a new FCM token after reinstall/refresh)
      if (deviceId) {
        await PushToken.updateMany(
          {
            clientId,
            appId,
            userId,
            deviceId,
            _id: { $ne: pushToken._id },
            isActive: true,
          },
          { isActive: false }
        );
      }

      await logAudit({
        clientId,
        appId,
        action: 'PUSH_TOKEN_REGISTERED',
        actor: `api-key:${req.apiKeyPrefix}`,
        resource: 'PushToken',
        resourceId: pushToken._id!.toString(),
        details: { userId, platform },
        ip: req.ip,
      });

      res.status(200).json({
        success: true,
        data: {
          id: pushToken._id,
          userId: pushToken.userId,
          platform: pushToken.platform,
          isActive: pushToken.isActive,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/push-tokens/unregister
 * Deactivate a device token (e.g. on logout).
 */
router.post(
  '/unregister',
  validate(unregisterPushTokenSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { token } = req.body;
      const clientId = req.clientId!;
      const appId = req.appId!;

      const result = await PushToken.findOneAndUpdate(
        { clientId, appId, token, isActive: true },
        { isActive: false },
        { new: true }
      );

      if (!result) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Token not found or already inactive' },
        });
        return;
      }

      await logAudit({
        clientId,
        appId,
        action: 'PUSH_TOKEN_UNREGISTERED',
        actor: `api-key:${req.apiKeyPrefix}`,
        resource: 'PushToken',
        resourceId: result._id!.toString(),
        ip: req.ip,
      });

      res.json({ success: true, message: 'Token deactivated' });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
