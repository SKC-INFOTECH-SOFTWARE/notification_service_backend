import * as admin from 'firebase-admin';
import { NotificationCredential } from '../models/NotificationCredential';
import { PushToken } from '../models/PushToken';
import { decryptCredential } from '../utils/crypto';
import { NotFoundError } from '../utils/errors';

/**
 * Multi-tenant Firebase manager.
 * Each CLIENT gets its own Firebase Admin app instance, initialized from
 * their stored FCM service-account credentials. Apps are cached in memory
 * and keyed by clientId so we never mix tenants.
 */
const firebaseApps = new Map<string, admin.app.App>();

/**
 * Get or initialize a Firebase Admin app for a given client.
 * The service-account JSON is stored encrypted in NotificationCredential
 * (channel=PUSH, provider=fcm).
 */
async function getFirebaseApp(clientId: string): Promise<admin.app.App> {
  // Return cached app if available
  const existing = firebaseApps.get(clientId);
  if (existing) return existing;

  // Load encrypted credential from DB
  const credential = await NotificationCredential.findOne({
    clientId,
    channel: 'PUSH',
    provider: 'fcm',
    isActive: true,
  });

  if (!credential) {
    throw new NotFoundError('Firebase (FCM) credentials for this client. Store them via POST /api/admin/credentials with channel=PUSH, provider=fcm');
  }

  // Decrypt — this is the full Firebase service-account JSON object
  const serviceAccount = decryptCredential(
    credential.config as unknown as string
  ) as admin.ServiceAccount;

  // Initialize a named Firebase app (name = clientId for isolation)
  const app = admin.initializeApp(
    {
      credential: admin.credential.cert(serviceAccount),
    },
    clientId // unique name per tenant
  );

  firebaseApps.set(clientId, app);
  return app;
}

/**
 * Invalidate a cached Firebase app (call when credentials are rotated).
 */
export function invalidateFirebaseApp(clientId: string): void {
  const existing = firebaseApps.get(clientId);
  if (existing) {
    existing.delete().catch(() => {});
    firebaseApps.delete(clientId);
  }
}

// ── Types ────────────────────────────────────────────

export interface PushPayload {
  title: string;
  body: string;
  imageUrl?: string;
  data?: Record<string, string>;
}

export interface PushResult {
  successCount: number;
  failureCount: number;
  invalidTokens: string[]; // tokens that should be deactivated
}

// ── Send Push Notification ───────────────────────────

/**
 * Send a push notification to all active devices of a user
 * under a specific client+app using Firebase Cloud Messaging.
 */
export async function sendPushNotification(
  clientId: string,
  appId: string,
  userId: string,
  payload: PushPayload
): Promise<PushResult> {
  const firebaseApp = await getFirebaseApp(clientId);
  const messaging = firebaseApp.messaging();

  // Fetch all active device tokens for this user
  const tokens = await PushToken.find({
    clientId,
    appId,
    userId,
    isActive: true,
  });

  if (tokens.length === 0) {
    console.log(`[FCM] No active push tokens for user ${userId} (client: ${clientId}, app: ${appId})`);
    return { successCount: 0, failureCount: 0, invalidTokens: [] };
  }

  const tokenStrings = tokens.map((t) => t.token);

  // Build the FCM message
  const message: admin.messaging.MulticastMessage = {
    tokens: tokenStrings,
    notification: {
      title: payload.title,
      body: payload.body,
      ...(payload.imageUrl ? { imageUrl: payload.imageUrl } : {}),
    },
    // Custom data payload (always strings)
    ...(payload.data ? { data: payload.data } : {}),
    // Platform-specific config
    android: {
      priority: 'high' as const,
      notification: {
        channelId: 'default',
        sound: 'default',
      },
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
          badge: 1,
        },
      },
    },
    webpush: {
      notification: {
        icon: payload.imageUrl,
      },
    },
  };

  const response = await messaging.sendEachForMulticast(message);

  // Identify invalid/expired tokens for cleanup
  const invalidTokens: string[] = [];
  response.responses.forEach((resp, idx) => {
    if (!resp.success && resp.error) {
      const code = resp.error.code;
      // These error codes indicate the token is permanently invalid
      if (
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token' ||
        code === 'messaging/invalid-argument'
      ) {
        invalidTokens.push(tokenStrings[idx]);
      }
    }
  });

  // Deactivate invalid tokens so we don't retry them
  if (invalidTokens.length > 0) {
    await PushToken.updateMany(
      { clientId, appId, token: { $in: invalidTokens } },
      { isActive: false }
    );
    console.log(`[FCM] Deactivated ${invalidTokens.length} invalid tokens for user ${userId}`);
  }

  // Update lastUsedAt for successful tokens
  const validTokens = tokenStrings.filter((t) => !invalidTokens.includes(t));
  if (validTokens.length > 0) {
    await PushToken.updateMany(
      { clientId, appId, token: { $in: validTokens } },
      { lastUsedAt: new Date() }
    );
  }

  console.log(
    `[FCM] Sent to user ${userId}: ${response.successCount} success, ${response.failureCount} failure`
  );

  return {
    successCount: response.successCount,
    failureCount: response.failureCount,
    invalidTokens,
  };
}
