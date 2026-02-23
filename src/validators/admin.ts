import { z } from 'zod';

export const createClientSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  branding: z.object({
    logoUrl: z.string().url().optional().or(z.literal('')),
    brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    companyName: z.string().optional(),
    footerText: z.string().optional(),
  }).optional(),
});

export const updateClientSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  branding: z.object({
    logoUrl: z.string().optional(),
    brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    companyName: z.string().optional(),
    footerText: z.string().optional(),
  }).optional(),
  isActive: z.boolean().optional(),
});

export const createAppSchema = z.object({
  clientId: z.string().min(1),
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
});

export const createCredentialSchema = z.object({
  clientId: z.string().min(1),
  channel: z.enum(['EMAIL', 'SMS', 'PUSH']),
  provider: z.string().min(1),
  config: z.record(z.unknown()),
});

export const createBaseTemplateSchema = z.object({
  clientId: z.string().min(1),
  name: z.string().min(1).max(200),
  htmlTemplate: z.string().min(1),
  isDefault: z.boolean().optional(),
});

export const createNotificationTemplateSchema = z.object({
  clientId: z.string().min(1),
  appId: z.string().min(1),
  event: z.string().min(1).max(100),
  channel: z.literal('EMAIL'),
  subject: z.string().optional(),
  bodyTemplate: z.string().min(1),
  baseTemplateId: z.string().optional(),
});

export const previewTemplateSchema = z.object({
  sampleData: z.record(z.unknown()).default({}),
});

export const adminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
