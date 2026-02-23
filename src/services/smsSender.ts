import axios from 'axios';
import { NotificationCredential } from '../models/NotificationCredential';
import { decryptCredential } from '../utils/crypto';
import { NotFoundError } from '../utils/errors';

interface TwilioConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
}

interface Msg91Config {
  authKey: string;
  senderId: string;
  route: string;
}

interface VonageConfig {
  apiKey: string;
  apiSecret: string;
  fromNumber: string;
}

interface TextlocalConfig {
  apiKey: string;
  sender: string;
}

interface CustomWebhookConfig {
  webhookUrl: string;
  headers?: Record<string, string>;
  method?: 'POST' | 'PUT';
}

type SmsConfig = TwilioConfig | Msg91Config | VonageConfig | TextlocalConfig | CustomWebhookConfig;

async function sendViaTwilio(config: TwilioConfig, to: string, body: string): Promise<void> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`;
  await axios.post(
    url,
    new URLSearchParams({ To: to, From: config.fromNumber, Body: body }).toString(),
    {
      auth: { username: config.accountSid, password: config.authToken },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }
  );
}

async function sendViaMsg91(config: Msg91Config, to: string, body: string): Promise<void> {
  await axios.post(
    'https://api.msg91.com/api/v5/flow/',
    {
      sender: config.senderId,
      route: config.route,
      mobiles: to,
      body,
    },
    {
      headers: {
        authkey: config.authKey,
        'Content-Type': 'application/json',
      },
    }
  );
}

async function sendViaVonage(config: VonageConfig, to: string, body: string): Promise<void> {
  await axios.post('https://rest.nexmo.com/sms/json', {
    api_key: config.apiKey,
    api_secret: config.apiSecret,
    from: config.fromNumber,
    to,
    text: body,
  });
}

async function sendViaTextlocal(config: TextlocalConfig, to: string, body: string): Promise<void> {
  await axios.post(
    'https://api.textlocal.in/send/',
    new URLSearchParams({
      apikey: config.apiKey,
      sender: config.sender,
      numbers: to,
      message: body,
    }).toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }
  );
}

async function sendViaCustomWebhook(config: CustomWebhookConfig, to: string, body: string): Promise<void> {
  const method = config.method || 'POST';
  await axios({
    method,
    url: config.webhookUrl,
    headers: {
      'Content-Type': 'application/json',
      ...config.headers,
    },
    data: { to, body },
  });
}

export async function sendSMS(clientId: string, to: string, body: string): Promise<void> {
  const credential = await NotificationCredential.findOne({
    clientId,
    channel: 'SMS',
    isActive: true,
  });
  if (!credential) throw new NotFoundError('SMS credentials for this client');

  const config = decryptCredential(credential.config as unknown as string) as unknown as SmsConfig;
  const provider = credential.provider;

  switch (provider) {
    case 'twilio':
      await sendViaTwilio(config as TwilioConfig, to, body);
      break;
    case 'msg91':
      await sendViaMsg91(config as Msg91Config, to, body);
      break;
    case 'vonage':
      await sendViaVonage(config as VonageConfig, to, body);
      break;
    case 'textlocal':
      await sendViaTextlocal(config as TextlocalConfig, to, body);
      break;
    case 'custom':
      await sendViaCustomWebhook(config as CustomWebhookConfig, to, body);
      break;
    default:
      throw new Error(`Unsupported SMS provider: ${provider}`);
  }
}
