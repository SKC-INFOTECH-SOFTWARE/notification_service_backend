import { Router, Response, NextFunction } from 'express';
import { AdminRequest, adminAuth } from '../../middleware/adminAuth';
import { validate } from '../../middleware/validate';
import { createClientSchema, updateClientSchema } from '../../validators/admin';
import { Client } from '../../models/Client';
import { logAudit } from '../../middleware/audit';
import { ConflictError, NotFoundError } from '../../utils/errors';

const router = Router();
router.use(adminAuth);

/**
 * POST /api/admin/clients — Create a client.
 */
router.post(
  '/',
  validate(createClientSchema),
  async (req: AdminRequest, res: Response, next: NextFunction) => {
    try {
      const existing = await Client.findOne({ slug: req.body.slug });
      if (existing) throw new ConflictError('Client with this slug already exists');

      const client = await Client.create(req.body);

      await logAudit({
        clientId: client._id!.toString(),
        action: 'CLIENT_CREATED',
        actor: `admin:${req.adminEmail}`,
        resource: 'Client',
        resourceId: client._id!.toString(),
        ip: req.ip,
      });

      res.status(201).json({ success: true, data: { client } });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/admin/clients — List all clients.
 */
router.get('/', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const clients = await Client.find().sort({ createdAt: -1 });
    res.json({ success: true, data: { clients } });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/clients/:id — Get a client.
 */
router.get('/:id', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) throw new NotFoundError('Client');
    res.json({ success: true, data: { client } });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/admin/clients/:id — Update a client.
 */
router.patch(
  '/:id',
  validate(updateClientSchema),
  async (req: AdminRequest, res: Response, next: NextFunction) => {
    try {
      const update: Record<string, unknown> = {};

      if (req.body.name) update.name = req.body.name;
      if (req.body.isActive !== undefined) update.isActive = req.body.isActive;

      // Merge branding fields
      if (req.body.branding) {
        for (const [key, value] of Object.entries(req.body.branding)) {
          update[`branding.${key}`] = value;
        }
      }

      const client = await Client.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
      if (!client) throw new NotFoundError('Client');

      await logAudit({
        clientId: client._id!.toString(),
        action: 'CLIENT_UPDATED',
        actor: `admin:${req.adminEmail}`,
        resource: 'Client',
        resourceId: client._id!.toString(),
        details: req.body,
        ip: req.ip,
      });

      res.json({ success: true, data: { client } });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
