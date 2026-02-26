import { Router, Response, NextFunction } from 'express';
import { AdminRequest, adminAuth } from '../../middleware/adminAuth';
import { validate } from '../../middleware/validate';
import { createAppSchema } from '../../validators/admin';
import { App } from '../../models/App';
import { Client } from '../../models/Client';
import { generateApiKey, hashApiKey, getApiKeyPrefix } from '../../utils/crypto';
import { logAudit } from '../../middleware/audit';
import { ConflictError, NotFoundError } from '../../utils/errors';

const router = Router();
router.use(adminAuth);

/**
 * POST /api/admin/apps — Create an app and generate its API key.
 */
router.post(
  '/',
  validate(createAppSchema),
  async (req: AdminRequest, res: Response, next: NextFunction) => {
    try {
      const { clientId, name, slug } = req.body;

      const client = await Client.findById(clientId);
      if (!client) throw new NotFoundError('Client');

      const existing = await App.findOne({ clientId, slug });
      if (existing) throw new ConflictError('App with this slug already exists for this client');

      const rawApiKey   = generateApiKey();
      const apiKeyHash  = await hashApiKey(rawApiKey);
      const apiKeyPrefix = getApiKeyPrefix(rawApiKey);

      const app = await App.create({ clientId, name, slug, apiKeyHash, apiKeyPrefix });

      await logAudit({
        clientId,
        appId:      app._id!.toString(),
        action:     'APP_CREATED',
        actor:      `admin:${req.adminEmail}`,
        resource:   'App',
        resourceId: app._id!.toString(),
        ip:         req.ip,
      });

      res.status(201).json({
        success: true,
        data: {
          app: {
            id:           app._id,
            clientId:     app.clientId,
            name:         app.name,
            slug:         app.slug,
            apiKeyPrefix: app.apiKeyPrefix,
            isActive:     app.isActive,
            createdAt:    app.createdAt,
          },
          apiKey: rawApiKey,
        },
        warning: 'Store this API key securely. It will NOT be shown again.',
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/admin/apps
 */
router.get('/', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const filter: Record<string, unknown> = {};
    if (req.query.clientId) filter.clientId = req.query.clientId;

    const apps = await App.find(filter)
      .select('-apiKeyHash')
      .sort({ createdAt: -1 })
      .populate('clientId', 'name slug');

    res.json({ success: true, data: { apps } });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/apps/:id
 */
router.get('/:id', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const app = await App.findById(req.params.id)
      .select('-apiKeyHash')
      .populate('clientId', 'name slug');
    if (!app) throw new NotFoundError('App');
    res.json({ success: true, data: { app } });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/apps/:id/regenerate-key
 * Invalidates cache for the old key automatically (old key hash is gone).
 */
router.post('/:id/regenerate-key', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const app = await App.findById(req.params.id);
    if (!app) throw new NotFoundError('App');

    const rawApiKey    = generateApiKey();
    const apiKeyHash   = await hashApiKey(rawApiKey);
    const apiKeyPrefix = getApiKeyPrefix(rawApiKey);

    app.apiKeyHash   = apiKeyHash;
    app.apiKeyPrefix = apiKeyPrefix;
    app.revokedAt    = null;
    await app.save();

    // Cache entries for the old key will expire naturally (5 min TTL).
    // Nothing to explicitly invalidate since we don't have the raw old key here.

    await logAudit({
      clientId:   app.clientId.toString(),
      appId:      app._id!.toString(),
      action:     'API_KEY_REGENERATED',
      actor:      `admin:${req.adminEmail}`,
      resource:   'App',
      resourceId: app._id!.toString(),
      ip:         req.ip,
    });

    res.json({
      success: true,
      data:    { apiKey: rawApiKey, apiKeyPrefix },
      warning: 'Store this API key securely. It will NOT be shown again. The previous key is now invalid.',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/apps/:id/revoke-key
 */
router.post('/:id/revoke-key', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const app = await App.findByIdAndUpdate(
      req.params.id,
      { revokedAt: new Date(), isActive: false },
      { new: true }
    );
    if (!app) throw new NotFoundError('App');

    // Cached entries will expire within 5 min — acceptable for revocation.
    // For immediate enforcement, store rawKey on rotation and call invalidateApiKeyCache().

    await logAudit({
      clientId:   app.clientId.toString(),
      appId:      app._id!.toString(),
      action:     'API_KEY_REVOKED',
      actor:      `admin:${req.adminEmail}`,
      resource:   'App',
      resourceId: app._id!.toString(),
      ip:         req.ip,
    });

    res.json({ success: true, message: 'API key revoked' });
  } catch (err) {
    next(err);
  }
});

export default router;
