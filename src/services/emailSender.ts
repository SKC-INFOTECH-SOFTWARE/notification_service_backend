import nodemailer from 'nodemailer';
import { NotificationCredential } from '../models/NotificationCredential';
import { decryptCredential } from '../utils/crypto';
import { NotFoundError } from '../utils/errors';

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  fromName?: string;
  fromEmail?: string;
}

interface SendEmailParams {
  clientId: string;
  to: string;
  subject: string;
  html: string;
}

// Cache transports per client to avoid re-creating on every send
const transportCache = new Map<string, { transport: nodemailer.Transporter; from: string; cachedAt: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getTransport(clientId: string): Promise<{ transport: nodemailer.Transporter; from: string }> {
  const cached = transportCache.get(clientId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
    return { transport: cached.transport, from: cached.from };
  }

  const credential = await NotificationCredential.findOne({
    clientId,
    channel: 'EMAIL',
    isActive: true,
  });
  if (!credential) throw new NotFoundError('Email credentials for this client');

  const smtpConfig = decryptCredential(credential.config as unknown as string) as unknown as SmtpConfig;

  const transport = nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    auth: smtpConfig.auth,
  });

  const from = smtpConfig.fromName
    ? `"${smtpConfig.fromName}" <${smtpConfig.fromEmail || smtpConfig.auth.user}>`
    : smtpConfig.fromEmail || smtpConfig.auth.user;

  transportCache.set(clientId, { transport, from, cachedAt: Date.now() });
  return { transport, from };
}

export async function sendEmail(params: SendEmailParams): Promise<void> {
  const { transport, from } = await getTransport(params.clientId);

  await transport.sendMail({
    from,
    to: params.to,
    subject: params.subject,
    html: params.html,
  });
}
