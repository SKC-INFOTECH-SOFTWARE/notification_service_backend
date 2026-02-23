import { Router, Response, NextFunction } from 'express';
import { AdminRequest, adminAuth } from '../../middleware/adminAuth';
import { validate } from '../../middleware/validate';
import {
  createBaseTemplateSchema,
  createNotificationTemplateSchema,
  previewTemplateSchema,
} from '../../validators/admin';
import { EmailBaseTemplate } from '../../models/EmailBaseTemplate';
import { NotificationTemplate } from '../../models/NotificationTemplate';
import { Client } from '../../models/Client';
import { App } from '../../models/App';
import { previewTemplate } from '../../services/templateEngine';
import { logAudit } from '../../middleware/audit';
import { NotFoundError, ConflictError } from '../../utils/errors';

const router = Router();
router.use(adminAuth);

// ── Base Templates ──────────────────────────────────

/**
 * POST /api/admin/templates/base — Create a base email layout for a client.
 */
router.post(
  '/base',
  validate(createBaseTemplateSchema),
  async (req: AdminRequest, res: Response, next: NextFunction) => {
    try {
      const { clientId, name, htmlTemplate, isDefault } = req.body;

      const client = await Client.findById(clientId);
      if (!client) throw new NotFoundError('Client');

      // If setting as default, unset any existing default
      if (isDefault) {
        await EmailBaseTemplate.updateMany(
          { clientId, isDefault: true },
          { isDefault: false }
        );
      }

      const template = await EmailBaseTemplate.create({
        clientId,
        name,
        htmlTemplate,
        isDefault: isDefault || false,
      });

      await logAudit({
        clientId,
        action: 'BASE_TEMPLATE_CREATED',
        actor: `admin:${req.adminEmail}`,
        resource: 'EmailBaseTemplate',
        resourceId: template._id!.toString(),
        ip: req.ip,
      });

      res.status(201).json({ success: true, data: { template } });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/admin/templates/base — List base templates.
 */
router.get('/base', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const filter: Record<string, unknown> = {};
    if (req.query.clientId) filter.clientId = req.query.clientId;

    const templates = await EmailBaseTemplate.find(filter)
      .sort({ createdAt: -1 })
      .populate('clientId', 'name slug');

    res.json({ success: true, data: { templates } });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/admin/templates/base/:id — Update a base template.
 */
router.patch('/base/:id', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const update: Record<string, unknown> = {};
    if (req.body.name) update.name = req.body.name;
    if (req.body.htmlTemplate) update.htmlTemplate = req.body.htmlTemplate;
    if (req.body.isActive !== undefined) update.isActive = req.body.isActive;

    if (req.body.isDefault) {
      const existing = await EmailBaseTemplate.findById(req.params.id);
      if (existing) {
        await EmailBaseTemplate.updateMany(
          { clientId: existing.clientId, isDefault: true },
          { isDefault: false }
        );
      }
      update.isDefault = true;
    }

    const template = await EmailBaseTemplate.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true }
    );
    if (!template) throw new NotFoundError('Base template');

    res.json({ success: true, data: { template } });
  } catch (err) {
    next(err);
  }
});

// ── Notification Templates (event-specific) ─────────

/**
 * POST /api/admin/templates — Create a notification template.
 */
router.post(
  '/',
  validate(createNotificationTemplateSchema),
  async (req: AdminRequest, res: Response, next: NextFunction) => {
    try {
      const { clientId, appId, event, channel, subject, bodyTemplate, baseTemplateId } = req.body;

      const client = await Client.findById(clientId);
      if (!client) throw new NotFoundError('Client');
      const app = await App.findById(appId);
      if (!app || app.clientId.toString() !== clientId) throw new NotFoundError('App');

      // Check for duplicate
      const existing = await NotificationTemplate.findOne({
        clientId,
        appId,
        event: event.toUpperCase(),
        channel,
      });
      if (existing) throw new ConflictError('Template for this client+app+event+channel already exists');

      const template = await NotificationTemplate.create({
        clientId,
        appId,
        event: event.toUpperCase(),
        channel,
        subject,
        bodyTemplate,
        baseTemplateId,
      });

      await logAudit({
        clientId,
        appId,
        action: 'TEMPLATE_CREATED',
        actor: `admin:${req.adminEmail}`,
        resource: 'NotificationTemplate',
        resourceId: template._id!.toString(),
        details: { event, channel },
        ip: req.ip,
      });

      res.status(201).json({ success: true, data: { template } });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/admin/templates — List notification templates.
 */
router.get('/', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const filter: Record<string, unknown> = {};
    if (req.query.clientId) filter.clientId = req.query.clientId;
    if (req.query.appId) filter.appId = req.query.appId;
    if (req.query.event) filter.event = (req.query.event as string).toUpperCase();
    if (req.query.channel) filter.channel = req.query.channel;

    const templates = await NotificationTemplate.find(filter)
      .sort({ createdAt: -1 })
      .populate('clientId', 'name slug')
      .populate('appId', 'name slug');

    res.json({ success: true, data: { templates } });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/templates/:id — Get a template.
 */
router.get('/:id', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const template = await NotificationTemplate.findById(req.params.id)
      .populate('clientId', 'name slug')
      .populate('appId', 'name slug');
    if (!template) throw new NotFoundError('Template');
    res.json({ success: true, data: { template } });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/admin/templates/:id — Update a template.
 */
router.patch('/:id', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const update: Record<string, unknown> = {};
    if (req.body.subject !== undefined) update.subject = req.body.subject;
    if (req.body.bodyTemplate) update.bodyTemplate = req.body.bodyTemplate;
    if (req.body.baseTemplateId) update.baseTemplateId = req.body.baseTemplateId;
    if (req.body.isActive !== undefined) update.isActive = req.body.isActive;

    const template = await NotificationTemplate.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true }
    );
    if (!template) throw new NotFoundError('Template');

    await logAudit({
      clientId: template.clientId.toString(),
      appId: template.appId.toString(),
      action: 'TEMPLATE_UPDATED',
      actor: `admin:${req.adminEmail}`,
      resource: 'NotificationTemplate',
      resourceId: template._id!.toString(),
      ip: req.ip,
    });

    res.json({ success: true, data: { template } });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/templates/:id/preview — Preview a template with sample data.
 */
router.post(
  '/:id/preview',
  validate(previewTemplateSchema),
  async (req: AdminRequest, res: Response, next: NextFunction) => {
    try {
      const template = await NotificationTemplate.findById(req.params.id);
      if (!template) throw new NotFoundError('Template');

      const result = await previewTemplate(
        template.clientId.toString(),
        template._id!.toString(),
        req.body.sampleData
      );

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
