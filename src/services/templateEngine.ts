import Handlebars from 'handlebars';
import { Client } from '../models/Client';
import { EmailBaseTemplate } from '../models/EmailBaseTemplate';
import { NotificationTemplate } from '../models/NotificationTemplate';
import { NotFoundError } from '../utils/errors';

interface RenderedEmail {
  subject: string;
  html: string;
}

interface RenderedContent {
  subject?: string;
  body: string;
}

const DEFAULT_BASE_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f4f4f7; }
    .wrapper { width: 100%; background-color: #f4f4f7; padding: 24px 0; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .header { background-color: {{brandColor}}; padding: 24px; text-align: center; }
    .header img { max-height: 48px; }
    .header h1 { color: #ffffff; margin: 8px 0 0; font-size: 20px; }
    .content { padding: 32px 24px; color: #333333; line-height: 1.6; }
    .footer { padding: 16px 24px; text-align: center; font-size: 12px; color: #888888; background-color: #f9f9f9; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        {{#if logoUrl}}<img src="{{logoUrl}}" alt="{{companyName}}">{{/if}}
        {{#if companyName}}<h1>{{companyName}}</h1>{{/if}}
      </div>
      <div class="content">
        {{{content}}}
      </div>
      <div class="footer">
        {{{footerText}}}
      </div>
    </div>
  </div>
</body>
</html>
`;

/**
 * Render an email by combining:
 * 1. Client branding config
 * 2. Base email layout template
 * 3. Event-specific body template
 * 4. Data from the app payload
 *
 * If no template exists but fallbackBody is provided, wraps it in the base layout.
 * Returns null if no template and no fallback.
 */
export async function renderEmail(
  clientId: string,
  appId: string,
  event: string,
  data: Record<string, unknown>,
  fallbackBody?: string,
  fallbackSubject?: string
): Promise<RenderedEmail | null> {
  // 1. Get client branding
  const client = await Client.findById(clientId);
  if (!client) throw new NotFoundError('Client');

  // 2. Get event template
  const template = await NotificationTemplate.findOne({
    clientId,
    appId,
    event,
    channel: 'EMAIL',
    isActive: true,
  });

  let renderedBody: string;
  let renderedSubject: string;

  if (template) {
    // Render from template
    const bodyCompiled = Handlebars.compile(template.bodyTemplate);
    renderedBody = bodyCompiled(data);

    const subjectCompiled = Handlebars.compile(template.subject || event);
    renderedSubject = subjectCompiled(data);
  } else if (fallbackBody) {
    // Use fallback body directly
    renderedBody = fallbackBody;
    renderedSubject = fallbackSubject || event;
  } else {
    // No template and no fallback
    return null;
  }

  // 3. Get base template
  let baseHtml: string;
  if (template?.baseTemplateId) {
    const baseTemplate = await EmailBaseTemplate.findById(template.baseTemplateId);
    baseHtml = baseTemplate?.htmlTemplate || DEFAULT_BASE_TEMPLATE;
  } else {
    const defaultBase = await EmailBaseTemplate.findOne({
      clientId,
      isDefault: true,
      isActive: true,
    });
    baseHtml = defaultBase?.htmlTemplate || DEFAULT_BASE_TEMPLATE;
  }

  // 4. Render base template with branding + content
  const layoutCompiled = Handlebars.compile(baseHtml);
  const html = layoutCompiled({
    logoUrl: client.branding.logoUrl,
    brandColor: client.branding.brandColor,
    companyName: client.branding.companyName,
    footerText: client.branding.footerText,
    content: renderedBody,
    ...data,
  });

  return { subject: renderedSubject, html };
}

/**
 * Render a non-email template (IN_APP, SMS, PUSH).
 * Returns null if no template found (instead of throwing).
 */
export async function renderContent(
  clientId: string,
  appId: string,
  event: string,
  channel: 'SMS' | 'PUSH' | 'IN_APP',
  data: Record<string, unknown>
): Promise<RenderedContent | null> {
  const template = await NotificationTemplate.findOne({
    clientId,
    appId,
    event,
    channel,
    isActive: true,
  });
  if (!template) return null;

  const bodyCompiled = Handlebars.compile(template.bodyTemplate);
  const body = bodyCompiled(data);

  let subject: string | undefined;
  if (template.subject) {
    const subjectCompiled = Handlebars.compile(template.subject);
    subject = subjectCompiled(data);
  }

  return { subject, body };
}

/**
 * Preview a template with sample data (for admin panel).
 */
export async function previewTemplate(
  clientId: string,
  templateId: string,
  sampleData: Record<string, unknown>
): Promise<{ subject?: string; body: string }> {
  const template = await NotificationTemplate.findById(templateId);
  if (!template || template.clientId.toString() !== clientId) {
    throw new NotFoundError('Template');
  }

  if (template.channel === 'EMAIL') {
    const rendered = await renderEmail(clientId, template.appId.toString(), template.event, sampleData);
    if (!rendered) throw new NotFoundError('Template');
    return { subject: rendered.subject, body: rendered.html };
  }

  const bodyCompiled = Handlebars.compile(template.bodyTemplate);
  const body = bodyCompiled(sampleData);

  let subject: string | undefined;
  if (template.subject) {
    subject = Handlebars.compile(template.subject)(sampleData);
  }

  return { subject, body };
}
