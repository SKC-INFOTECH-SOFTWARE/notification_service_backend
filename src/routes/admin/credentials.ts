import { Router, Response, NextFunction } from 'express';
import { AdminRequest, adminAuth } from '../../middleware/adminAuth';
import { validate } from '../../middleware/validate';
import { createCredentialSchema } from '../../validators/admin';
import { NotificationCredential } from '../../models/NotificationCredential';
import { Client } from '../../models/Client';
import { encryptCredential } from '../../utils/crypto';
import { invalidateFirebaseApp } from '../../services/firebasePush';
import { logAudit } from '../../middleware/audit';
import { NotFoundError } from '../../utils/errors';

const router = Router();
router.use(adminAuth);

/**
 * POST /api/admin/credentials — Store channel credentials for a client.
 * Credentials are encrypted before storage.
 */
router.post(
  '/',
  validate(createCredentialSchema),
  async (req: AdminRequest, res: Response, next: NextFunction) => {
    try {
      const { clientId, channel, provider, config: credConfig } = req.body;

      const client = await Client.findById(clientId);
      if (!client) throw new NotFoundError('Client');

      // Deactivate any existing credential for the same client+channel
      await NotificationCredential.updateMany(
        { clientId, channel, isActive: true },
        { isActive: false }
      );

      // If rotating FCM credentials, clear the cached Firebase app so it re-initializes
      if (channel === 'PUSH' && provider === 'fcm') {
        invalidateFirebaseApp(clientId);
      }

      const encrypted = encryptCredential(credConfig);

      const credential = await NotificationCredential.create({
        clientId,
        channel,
        provider,
        config: encrypted,
        isActive: true,
      });

      await logAudit({
        clientId,
        action: 'CREDENTIAL_CREATED',
        actor: `admin:${req.adminEmail}`,
        resource: 'NotificationCredential',
        resourceId: credential._id!.toString(),
        details: { channel, provider },
        ip: req.ip,
      });

      res.status(201).json({
        success: true,
        data: {
          credential: {
            id: credential._id,
            clientId: credential.clientId,
            channel: credential.channel,
            provider: credential.provider,
            isActive: credential.isActive,
            createdAt: credential.createdAt,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/admin/credentials — List credentials (config is NOT returned).
 */
router.get('/', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const filter: Record<string, unknown> = {};
    if (req.query.clientId) filter.clientId = req.query.clientId;
    if (req.query.channel) filter.channel = req.query.channel;

    const credentials = await NotificationCredential.find(filter)
      .select('-config')
      .sort({ createdAt: -1 })
      .populate('clientId', 'name slug');

    res.json({ success: true, data: { credentials } });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/admin/credentials/:id — Deactivate a credential.
 */
router.delete('/:id', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const credential = await NotificationCredential.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    if (!credential) throw new NotFoundError('Credential');

    await logAudit({
      clientId: credential.clientId.toString(),
      action: 'CREDENTIAL_DEACTIVATED',
      actor: `admin:${req.adminEmail}`,
      resource: 'NotificationCredential',
      resourceId: credential._id!.toString(),
      ip: req.ip,
    });

    res.json({ success: true, message: 'Credential deactivated' });
  } catch (err) {
    next(err);
  }
});

export default router;
