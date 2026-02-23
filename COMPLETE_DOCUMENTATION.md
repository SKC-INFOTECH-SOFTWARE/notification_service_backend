# Notification Service — Complete Documentation

## Table of Contents

1. [How It Works](#1-how-it-works)
2. [Admin Panel Setup](#2-admin-panel-setup)
3. [API Reference](#3-api-reference)
4. [Channel Guide](#4-channel-guide)
5. [Template System](#5-template-system)
6. [Backend Integration](#6-backend-integration)
7. [Mobile App Integration](#7-mobile-app-integration)
8. [Web App Integration](#8-web-app-integration)
9. [Real-World Scenarios](#9-real-world-scenarios)
10. [Deployment](#10-deployment)

---

## 1. How It Works

```
┌─────────────────┐     HTTP POST      ┌──────────────────────────────────┐
│                 │────────────────────→│     NOTIFICATION SERVICE         │
│  YOUR BACKEND   │  x-api-key header   │                                  │
│  (any language) │                     │  1. Validates API key            │
│                 │                     │  2. Queues to Redis (BullMQ)     │
│                 │                     │  3. Worker picks up and sends:   │
│                 │                     │     EMAIL → SMTP (template or    │
│                 │                     │              fallback to body)   │
│                 │                     │     PUSH  → Firebase (FCM)       │
│                 │                     │     IN_APP→ Socket.IO (realtime) │
│                 │                     │     SMS   → Provider (Twilio,    │
│                 │                     │              MSG91, Vonage, etc) │
└─────────────────┘                     └──────────────────────────────────┘
```

**Key design principles:**
- **One HTTP call** sends to multiple channels simultaneously.
- **`body` is the primary content** — sent directly from your backend for all channels.
- **Templates are EMAIL-only** — used to wrap email content in branded HTML layouts. Other channels (SMS, PUSH, IN_APP) use `body` and `title` from your request directly.
- **No template? No problem** — if no email template exists, `body` is wrapped in the default branded layout. Non-email channels never need templates.

---

## 2. Admin Panel Setup

**URL**: `http://localhost:3001`
**Login**: `admin@notification.local` / `change-this-password`

(Run `npm run seed` first to create the admin user)

### 2.1 Create Client (your company)

**Page**: Clients → Add Client

```
Name:         Sadana Corp
Slug:         sadana-corp
Company Name: Sadana Corporation
Brand Color:  #2563EB
Logo URL:     https://sadana.com/logo.png
Footer Text:  © 2025 Sadana Corp
```

### 2.2 Create App (each project gets its own)

**Page**: Apps → Create App

```
Client: Sadana Corp
Name:   Sadana ERP
Slug:   sadana-erp
```

**Result**: You get an API key like `ns_live_a8f3c2d1e4b5...` — **copy this immediately, shown only once.**

Create separate apps for separate projects:

| App | Slug | Purpose |
|-----|------|---------|
| Sadana ERP | `sadana-erp` | Invoice, payment notifications |
| Social App | `social-app` | Likes, comments, follows |
| E-Commerce | `ecommerce` | Orders, shipping, cart |
| Auth Service | `auth-service` | OTP, password reset |

Each app gets its own API key and its own set of email templates.

### 2.3 Add Credentials

**Page**: Credentials → Add Credential

#### For Email (SMTP tab):

```
Client:    Sadana Corp
Host:      smtp.gmail.com
Port:      587
Username:  noreply@sadana.com
Password:  (app-specific password from Google)
From Name: Sadana Notifications
```

#### For Push Notifications (FCM tab):

```
Client: Sadana Corp
Paste entire Firebase Service Account JSON from:
  Firebase Console → Project Settings → Service Accounts → Generate New Private Key
```

#### For SMS (SMS tab):

Select your SMS provider and fill in the provider-specific fields:

**Twilio:**
```
Client:      Sadana Corp
Provider:    Twilio
Account SID: ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Auth Token:  your_auth_token
From Number: +1234567890
```

**MSG91:**
```
Client:    Sadana Corp
Provider:  MSG91
Auth Key:  your_auth_key
Sender ID: SADANA
Route:     4
```

**Vonage:**
```
Client:      Sadana Corp
Provider:    Vonage
API Key:     your_api_key
API Secret:  your_api_secret
From Number: +1234567890
```

**Textlocal:**
```
Client:    Sadana Corp
Provider:  Textlocal
API Key:   your_api_key
Sender:    SADANA
```

**Custom Webhook:**
```
Client:       Sadana Corp
Provider:     Custom Webhook
Webhook URL:  https://api.example.com/sms/send
HTTP Method:  POST
Headers:      {"Authorization": "Bearer xxx"}  (optional, JSON)
```

### 2.4 Create Email Templates (Optional)

**Page**: Email Templates → Create Template

Templates are **only for the EMAIL channel** and use **Handlebars** syntax: `{{variableName}}` gets replaced with your data.

> **Note:** Templates are optional even for email. If no template exists for an event, the `body` from your API request is wrapped in the default branded email layout.

For non-email channels (SMS, PUSH, IN_APP), content is sent directly via `body` and `title` in your API request — no templates needed.

---

## 3. API Reference

**Base URL**: `http://localhost:3000`

All app endpoints require the `x-api-key` header.

---

### 3.1 Send Notification

**The main endpoint. This is what your backend calls.**

```
POST /api/notifications/send
```

**Headers**:
```
Content-Type: application/json
x-api-key: ns_live_YOUR_API_KEY
```

**Body**:
```json
{
  "event": "EVENT_NAME",
  "user": {
    "id": "user-123",
    "email": "john@example.com",
    "mobile": "+919876543210"
  },
  "channels": ["EMAIL", "PUSH", "IN_APP", "SMS"],
  "body": "Your invoice #INV-001 for $1,500.00 is ready.",
  "title": "Invoice Created",
  "data": {
    "key1": "value1",
    "key2": "value2"
  }
}
```

**Fields**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `event` | string | Yes | Event name identifier. Auto-uppercased. |
| `user.id` | string | Yes | Your app's user identifier. Used for push token lookup and in-app delivery. |
| `user.email` | string | If EMAIL in channels | Recipient's email address. |
| `user.mobile` | string | If SMS in channels | Recipient's phone with country code (e.g., `+919876543210`). |
| `channels` | string[] | Yes | One or more: `"EMAIL"`, `"SMS"`, `"PUSH"`, `"IN_APP"`. Min 1. |
| `body` | string | **Yes** | The notification content text. Used directly for SMS, PUSH, and IN_APP. For EMAIL, used as fallback if no template exists. Max 5000 chars. |
| `title` | string | No | Notification title. Used as push title, in-app subject, and email subject fallback. Defaults to the event name if not provided. Max 200 chars. |
| `data` | object | No | Key-value pairs that fill `{{placeholders}}` in email templates. Also passed as FCM data payload. All values should be strings. |

**How each channel uses `body` and `title`:**

| Channel | `body` | `title` | `data` |
|---------|--------|---------|--------|
| **EMAIL** | Fallback content if no template exists | Fallback subject if no template exists | Fills `{{placeholders}}` in email template |
| **SMS** | Sent as the SMS text message | Not used | Not used |
| **PUSH** | Push notification body text | Push notification title (falls back to event name) | Sent as FCM data payload (values stringified) |
| **IN_APP** | Notification body text | Notification subject (falls back to event name) | Passed in Socket.IO event payload |

**Response** `202 Accepted`:
```json
{
  "success": true,
  "data": {
    "notifications": [
      { "id": "665abc001", "channel": "EMAIL", "status": "QUEUED" },
      { "id": "665abc002", "channel": "PUSH", "status": "QUEUED" },
      { "id": "665abc003", "channel": "IN_APP", "status": "QUEUED" }
    ]
  },
  "message": "3 notification(s) queued for delivery."
}
```

**Error** `400`:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "user.email is required when channels include EMAIL"
  }
}
```

**Error** `401`:
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or missing API key"
  }
}
```

**Rate Limit**: 100 requests/minute per API key. Returns `429` when exceeded.

---

### 3.2 Get Notifications

Fetch notifications for a specific user. Used by your frontend to show notification list.

```
GET /api/notifications?userId=user-123&channel=IN_APP&limit=20&offset=0
```

**Headers**:
```
x-api-key: ns_live_YOUR_API_KEY
```

**Query Parameters**:

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `userId` | string | Yes | — | User whose notifications to fetch |
| `channel` | string | No | — | Filter: `EMAIL`, `SMS`, `PUSH`, `IN_APP` |
| `status` | string | No | — | Filter: `PENDING`, `QUEUED`, `SENT`, `DELIVERED`, `FAILED` |
| `limit` | number | No | 20 | Max 100 |
| `offset` | number | No | 0 | For pagination |

**Response** `200`:
```json
{
  "success": true,
  "data": {
    "notifications": [
      {
        "_id": "665abc003",
        "event": "POST_LIKED",
        "channel": "IN_APP",
        "userId": "user-123",
        "status": "SENT",
        "renderedSubject": "Post Liked",
        "renderedBody": "John liked your post \"My vacation\"",
        "readAt": null,
        "createdAt": "2025-06-15T10:30:00.000Z"
      }
    ],
    "total": 45,
    "unreadCount": 3
  }
}
```

---

### 3.3 Mark as Read

Mark an in-app notification as read.

```
PATCH /api/notifications/:id/read
```

**Headers**:
```
x-api-key: ns_live_YOUR_API_KEY
```

**Response** `200`:
```json
{
  "success": true,
  "data": {
    "_id": "665abc003",
    "readAt": "2025-06-15T11:00:00.000Z"
  }
}
```

**Error** `404` — Notification not found or already read.

---

### 3.4 Register Push Token

Register a device's FCM token for push notifications. Call this from your mobile/web app after getting the Firebase token.

```
POST /api/push-tokens/register
```

**Headers**:
```
Content-Type: application/json
x-api-key: ns_live_YOUR_API_KEY
```

**Body**:
```json
{
  "userId": "user-123",
  "token": "fMd8s9Kj2p:APA91bH...",
  "platform": "android",
  "deviceId": "unique-device-uuid"
}
```

**Fields**:

| Field | Type | Required | Values | Description |
|-------|------|----------|--------|-------------|
| `userId` | string | Yes | — | Your app's user ID |
| `token` | string | Yes | — | FCM device token from Firebase SDK |
| `platform` | string | Yes | `android`, `ios`, `web` | Device platform |
| `deviceId` | string | No | — | Unique device ID. If provided, old tokens for same device are deactivated (prevents duplicates when token refreshes). |

**Response** `200`:
```json
{
  "success": true,
  "data": {
    "_id": "665def001",
    "userId": "user-123",
    "token": "fMd8s9Kj2p:APA91bH...",
    "platform": "android",
    "isActive": true
  }
}
```

**Behavior**:
- Same token re-registered → updates userId/platform, reactivates if inactive
- Same deviceId with different token → old token deactivated, new one saved
- User can have multiple tokens (phone + tablet + web browser)

---

### 3.5 Unregister Push Token

Remove a device from push notifications. Call this on logout.

```
POST /api/push-tokens/unregister
```

**Body**:
```json
{
  "token": "fMd8s9Kj2p:APA91bH..."
}
```

**Response** `200`:
```json
{
  "success": true,
  "message": "Push token unregistered."
}
```

---

### 3.6 Health Check

```
GET /health
```

**Response** `200`:
```json
{
  "status": "ok",
  "timestamp": "2025-06-15T10:00:00.000Z"
}
```

---

### 3.7 Error Codes

All errors follow this format:
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Description"
  }
}
```

| Code | HTTP | When |
|------|------|------|
| `VALIDATION_ERROR` | 400 | Bad request body, missing required fields |
| `UNAUTHORIZED` | 401 | Missing/invalid API key or JWT |
| `FORBIDDEN` | 403 | API key valid but app is revoked/inactive |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Duplicate (e.g., template already exists for same event+channel) |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |

---

## 4. Channel Guide

### 4.1 EMAIL

Sends branded HTML emails via SMTP.

**Requirements**:
- SMTP credentials configured in admin panel (Credentials → SMTP)
- `user.email` provided in send request
- `body` provided in send request (always required)

**Template (optional)**:
If an email template exists for the event, it renders the template with your `data` variables and wraps it in the base layout. If no template exists, the `body` from your request is wrapped in the default branded email layout with your client's branding (logo, colors, footer).

**How it works**:
1. Worker picks up EMAIL job
2. Loads client's SMTP credentials (decrypted from DB)
3. Looks for an email template for this event
4. **If template exists**: Renders template with `data` → inserts into base layout
5. **If no template**: Uses `body` as content → wraps in base layout with branding
6. Uses `title` as subject (or template subject, or event name as fallback)
7. Sends via Nodemailer

**Example with template** (create template in admin panel):
```
Event:   INVOICE_CREATED
Channel: EMAIL
Subject: Invoice #{{invoiceNumber}} — {{amount}}
Body:    <h2>Hi {{userName}},</h2>
         <p>Your invoice <b>#{{invoiceNumber}}</b> for <b>{{amount}}</b> is ready.</p>
         <p><a href="{{invoiceUrl}}">View Invoice</a></p>
```

**Send request**:
```json
{
  "event": "INVOICE_CREATED",
  "user": { "id": "user-123", "email": "john@example.com" },
  "channels": ["EMAIL"],
  "body": "Your invoice #INV-2025-001 for $1,500.00 is ready.",
  "title": "Invoice Created",
  "data": {
    "userName": "John Doe",
    "invoiceNumber": "INV-2025-001",
    "amount": "$1,500.00",
    "invoiceUrl": "https://erp.example.com/invoices/123"
  }
}
```

**Result**: If the template exists, John receives a branded email with subject "Invoice #INV-2025-001 — $1,500.00" using the template. If no template exists, the `body` text is wrapped in the branded layout with subject "Invoice Created".

---

### 4.2 PUSH

Sends push notifications to mobile (Android/iOS) and web browsers via Firebase Cloud Messaging.

**Requirements**:
- FCM service account configured in admin panel (Credentials → FCM)
- User's device registered via `POST /api/push-tokens/register`
- `body` provided in send request
- Only `user.id` needed in send request (tokens are looked up from DB)

**No template needed** — uses `title` and `body` from your request directly.

**How it works**:
1. Worker picks up PUSH job
2. Loads client's Firebase service account (cached per tenant)
3. Fetches all active push tokens for this `user.id`
4. Sends push with `title` (or event name) and `body` from request
5. `data` values are stringified and sent as FCM data payload
6. Invalid tokens auto-deactivated (uninstalled apps, expired tokens)

**Send request**:
```json
{
  "event": "POST_LIKED",
  "user": { "id": "user-456" },
  "channels": ["PUSH"],
  "body": "Sarah liked \"My vacation photos\"",
  "title": "Sarah liked your post",
  "data": {
    "likerName": "Sarah",
    "postTitle": "My vacation photos"
  }
}
```

**Result**: User 456 gets push on all registered devices:
```
┌────────────────────────────────┐
│ Sarah liked your post          │
│ Sarah liked "My vacation..."   │
└────────────────────────────────┘
```

**Push payload sent to Firebase**:
```json
{
  "notification": {
    "title": "Sarah liked your post",
    "body": "Sarah liked \"My vacation photos\""
  },
  "data": {
    "notificationId": "665abc002",
    "event": "POST_LIKED",
    "likerName": "Sarah",
    "postTitle": "My vacation photos"
  },
  "android": { "priority": "high" },
  "apns": { "payload": { "aps": { "sound": "default" } } }
}
```

---

### 4.3 IN_APP

Delivers real-time notifications via Socket.IO WebSocket. Also stored in DB for later retrieval.

**Requirements**:
- `body` provided in send request
- Frontend connected to Socket.IO with `{ clientId, appId, userId }`
- Only `user.id` needed in send request

**No template needed** — uses `title` and `body` from your request directly.

**How it works**:
1. Worker picks up IN_APP job
2. Uses `title` (or event name) and `body` from request
3. Saves content to Notification document
4. Emits via Socket.IO to room `clientId:appId:userId`
5. If user is online → instant delivery. If offline → stored for later fetch via GET API.

**Send request**:
```json
{
  "event": "NEW_FOLLOWER",
  "user": { "id": "user-789" },
  "channels": ["IN_APP"],
  "body": "Alex started following you",
  "title": "New Follower",
  "data": {
    "followerName": "Alex",
    "followerAvatar": "https://example.com/alex.jpg"
  }
}
```

**Socket.IO event received by frontend**:
```json
{
  "id": "665abc003",
  "event": "NEW_FOLLOWER",
  "subject": "New Follower",
  "body": "Alex started following you",
  "data": {
    "followerName": "Alex",
    "followerAvatar": "https://example.com/alex.jpg"
  },
  "createdAt": "2025-06-15T10:30:00.000Z"
}
```

---

### 4.4 SMS

Sends text messages via your configured SMS provider.

**Supported Providers**: Twilio, MSG91, Vonage, Textlocal, Custom Webhook

**Requirements**:
- SMS credentials configured in admin panel (Credentials → SMS tab)
- `user.mobile` provided in send request (with country code)
- `body` provided in send request

**No template needed** — uses `body` from your request directly as the SMS text.

**How it works**:
1. Worker picks up SMS job
2. Loads client's SMS credentials (decrypted from DB)
3. Routes to the correct provider (Twilio, MSG91, Vonage, Textlocal, or Custom Webhook)
4. Sends `body` as the SMS message text

**Send request**:
```json
{
  "event": "OTP_LOGIN",
  "user": { "id": "user@email.com", "mobile": "+919876543210" },
  "channels": ["SMS"],
  "body": "Your OTP is 482910. Valid for 5 minutes. Do not share."
}
```

**Result**: User receives SMS: `Your OTP is 482910. Valid for 5 minutes. Do not share.`

> **Tip**: Keep SMS body under 160 characters for a single SMS segment. Longer messages may be split into multiple segments by the provider.

---

### 4.5 Multi-Channel Example

Send to all channels with one API call:

```json
{
  "event": "ORDER_PLACED",
  "user": {
    "id": "user-123",
    "email": "john@example.com",
    "mobile": "+919876543210"
  },
  "channels": ["EMAIL", "PUSH", "IN_APP", "SMS"],
  "body": "Your order #ORD-001 for $99.99 has been confirmed!",
  "title": "Order Confirmed",
  "data": {
    "userName": "John",
    "orderNumber": "ORD-001",
    "total": "$99.99",
    "orderUrl": "https://store.com/orders/123"
  }
}
```

**What happens**:
- **EMAIL**: If an `ORDER_PLACED` template exists → renders with `data`. If not → wraps `body` in branded layout with subject "Order Confirmed".
- **PUSH**: Shows push notification with title "Order Confirmed" and body "Your order #ORD-001 for $99.99 has been confirmed!"
- **IN_APP**: Delivers via Socket.IO with subject "Order Confirmed" and body text. Stored for later retrieval.
- **SMS**: Sends "Your order #ORD-001 for $99.99 has been confirmed!" as SMS text.

---

### 4.6 Channel Comparison

| | EMAIL | PUSH | IN_APP | SMS |
|---|---|---|---|---|
| **user field needed** | `email` | only `id` | only `id` | `mobile` |
| **Credential needed** | SMTP | FCM service account | None | SMS provider |
| **Device registration** | No | Yes (`/push-tokens/register`) | No (Socket.IO connect) | No |
| **Template support** | Yes (optional, EMAIL-only) | No (uses body/title directly) | No (uses body/title directly) | No (uses body directly) |
| **`body` usage** | Fallback if no template | Push body text | Notification body | SMS text |
| **`title` usage** | Fallback subject | Push title | Notification subject | Not used |
| **`data` usage** | Fills template `{{vars}}` | FCM data payload | Passed in event | Not used |
| **Delivery** | SMTP server | Firebase → device | Socket.IO → browser | SMS provider → phone |
| **Stored in DB** | Yes | Yes | Yes (with read tracking) | Yes |
| **Retry on fail** | 3 attempts | 3 attempts | 3 attempts | 3 attempts |

---

## 5. Template System

### 5.1 Overview

Templates are **EMAIL-only** and **optional**. They provide rich HTML email formatting with Handlebars variable substitution.

For non-email channels (SMS, PUSH, IN_APP), content is sent directly via `body` and `title` — no templates are needed or supported.

### 5.2 How Email Templates Work

Templates use **Handlebars** syntax. You create templates in the admin panel, and the service fills in `{{variables}}` with data from your API call.

```
Template:  "Hi {{userName}}, your order #{{orderNumber}} is confirmed."
   +
Data:      { "userName": "John", "orderNumber": "ORD-001" }
   =
Output:    "Hi John, your order #ORD-001 is confirmed."
```

### 5.3 Email Fallback Behavior

When your backend sends an EMAIL notification:

1. **Template exists** → Template is rendered with `data`, wrapped in base layout
2. **No template, `body` provided** → `body` is wrapped in the branded base layout, `title` (or event name) used as subject
3. **No template, no `body`** → Notification is marked as SENT silently (no email sent)

This means you can start sending emails immediately without configuring templates — just provide `body` and `title`.

### 5.4 Template Variables

Use `{{variableName}}` for text (auto-escaped):
```
Hello {{userName}}
```

Use `{{{rawHtml}}}` for unescaped HTML (email bodies only):
```
{{{customHtmlContent}}}
```

### 5.5 Template Uniqueness

Each template is unique per: **Client + App + Event** (channel is always EMAIL).

```
App: Sadana ERP    + Event: INVOICE_CREATED  → "Invoice #{{num}} ready"
App: Sadana ERP    + Event: PAYMENT_RECEIVED → "Payment of {{amount}} confirmed"
App: E-Commerce    + Event: ORDER_PLACED     → "Order #{{orderNumber}} confirmed"
```

### 5.6 Base Templates (Email Layouts)

You can create a **base layout** — the outer HTML wrapper with header, footer, branding. The event template body gets inserted via `{{{content}}}`.

```html
<!-- Base template (created once per client) -->
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f5f5f5;">
  <div style="max-width:600px;margin:0 auto;background:#fff;">
    <div style="background:{{brandColor}};padding:20px;text-align:center;">
      <img src="{{logoUrl}}" alt="{{companyName}}" height="40"/>
    </div>
    <div style="padding:30px;">
      {{{content}}}    ← event template body goes here
    </div>
    <div style="padding:20px;text-align:center;color:#999;font-size:12px;">
      {{footerText}}
    </div>
  </div>
</body>
</html>
```

The `{{brandColor}}`, `{{logoUrl}}`, `{{companyName}}`, `{{footerText}}` come from client branding config (set in Clients page).

A default base layout is built-in, so you don't need to create one unless you want a custom design.

### 5.7 Example Email Templates

| Event | Subject | Body Template |
|-------|---------|---------------|
| `INVOICE_CREATED` | `Invoice #{{invoiceNumber}} — {{amount}}` | `<h2>Hi {{userName}},</h2><p>Your invoice <b>#{{invoiceNumber}}</b> for <b>{{amount}}</b> is ready.</p><p><a href="{{invoiceUrl}}">View Invoice</a></p>` |
| `OTP_LOGIN` | `Login OTP: {{otp}}` | `<h2>Your OTP</h2><p style="font-size:32px;letter-spacing:8px;font-weight:bold;text-align:center;">{{otp}}</p><p>Expires in {{validMinutes}} minutes.</p>` |
| `PASSWORD_RESET` | `Reset your password` | `<p>Hi {{userName}},</p><p>Click to reset:</p><p><a href="{{resetUrl}}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;display:inline-block;text-decoration:none;">Reset Password</a></p>` |
| `ORDER_PLACED` | `Order Confirmed #{{orderNumber}}` | `<h2>Thank you {{userName}}!</h2><p>Order <b>#{{orderNumber}}</b> placed. Total: <b>{{total}}</b></p><p><a href="{{orderUrl}}">Track Order</a></p>` |
| `ORDER_SHIPPED` | `Order Shipped #{{orderNumber}}` | `<p>Hi {{userName}},</p><p>Your order has shipped!</p><p>Tracking: <a href="{{trackingUrl}}">{{trackingNumber}}</a></p>` |

---

## 6. Backend Integration

### 6.1 Node.js / Express

```typescript
// lib/notify.ts — one file, reuse everywhere

const NOTIFY_URL = process.env.NOTIFICATION_URL || 'http://localhost:3000';
const API_KEY = process.env.NOTIFICATION_API_KEY!;

export async function sendNotification(
  event: string,
  user: { id: string; email?: string; mobile?: string },
  channels: ('EMAIL' | 'SMS' | 'PUSH' | 'IN_APP')[],
  body: string,
  title?: string,
  data: Record<string, string> = {}
) {
  const res = await fetch(`${NOTIFY_URL}/api/notifications/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
    body: JSON.stringify({ event, user, channels, body, title, data }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err?.error?.message || `Notification failed: ${res.status}`);
  }
  return res.json();
}
```

```typescript
// Usage examples

// Social: post liked — no template needed
await sendNotification(
  'POST_LIKED',
  { id: post.authorId },
  ['PUSH', 'IN_APP'],
  `${liker.name} liked your post "${post.title}"`,
  `${liker.name} liked your post`,
  { likerName: liker.name, postTitle: post.title }
);

// OTP — body is the SMS text, data fills email template if it exists
await sendNotification(
  'OTP_LOGIN',
  { id: user.id, email: user.email, mobile: user.phone },
  ['SMS', 'EMAIL'],
  `Your OTP is ${otp}. Valid for 5 minutes. Do not share.`,
  `Login OTP: ${otp}`,
  { otp, validMinutes: '5' }
);

// Invoice — email template renders with data, other channels use body/title
await sendNotification(
  'INVOICE_CREATED',
  { id: user.id, email: user.email },
  ['EMAIL', 'PUSH', 'IN_APP'],
  `Invoice #${inv.number} for ${inv.amount} is ready.`,
  'Invoice Created',
  { userName: user.name, invoiceNumber: inv.number, amount: inv.amount, invoiceUrl: inv.url }
);
```

---

### 6.2 Python

```python
# notify.py

import os, requests

NOTIFY_URL = os.getenv("NOTIFICATION_URL", "http://localhost:3000")
API_KEY = os.getenv("NOTIFICATION_API_KEY")

def send_notification(event, user, channels, body, title=None, data=None):
    payload = {
        "event": event,
        "user": user,
        "channels": channels,
        "body": body,
    }
    if title:
        payload["title"] = title
    if data:
        payload["data"] = data

    resp = requests.post(
        f"{NOTIFY_URL}/api/notifications/send",
        json=payload,
        headers={"Content-Type": "application/json", "x-api-key": API_KEY},
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()
```

```python
# Usage

# Post liked
send_notification(
    "POST_LIKED",
    {"id": author_id},
    ["PUSH", "IN_APP"],
    body=f"{liker.name} liked your post \"{post.title}\"",
    title=f"{liker.name} liked your post",
)

# OTP
send_notification(
    "OTP_LOGIN",
    {"id": email, "email": email, "mobile": phone},
    ["SMS", "EMAIL"],
    body=f"Your OTP is {otp}. Valid for 5 minutes. Do not share.",
    title=f"Login OTP: {otp}",
    data={"otp": otp, "validMinutes": "5"},
)
```

---

### 6.3 Go

```go
// notify.go
package notify

import (
    "bytes"
    "encoding/json"
    "fmt"
    "net/http"
    "os"
    "time"
)

var client = &http.Client{Timeout: 10 * time.Second}

func Send(event string, user map[string]string, channels []string, body string, title string, data map[string]string) error {
    payload, _ := json.Marshal(map[string]any{
        "event": event, "user": user, "channels": channels,
        "body": body, "title": title, "data": data,
    })
    req, _ := http.NewRequest("POST", os.Getenv("NOTIFICATION_URL")+"/api/notifications/send",
        bytes.NewReader(payload))
    req.Header.Set("Content-Type", "application/json")
    req.Header.Set("x-api-key", os.Getenv("NOTIFICATION_API_KEY"))
    resp, err := client.Do(req)
    if err != nil { return err }
    defer resp.Body.Close()
    if resp.StatusCode >= 400 { return fmt.Errorf("notify: HTTP %d", resp.StatusCode) }
    return nil
}
```

---

### 6.4 PHP

```php
// notify.php
function sendNotification($event, $user, $channels, $body, $title = null, $data = []) {
    $payload = [
        'event' => $event, 'user' => $user,
        'channels' => $channels, 'body' => $body, 'data' => $data,
    ];
    if ($title) $payload['title'] = $title;

    $ch = curl_init(getenv('NOTIFICATION_URL') . '/api/notifications/send');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'x-api-key: ' . getenv('NOTIFICATION_API_KEY'),
        ],
        CURLOPT_POSTFIELDS => json_encode($payload),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 10,
    ]);
    $response = curl_exec($ch);
    curl_close($ch);
    return json_decode($response, true);
}
```

---

### 6.5 Java (Spring Boot)

```java
@Service
public class NotifyService {
    @Value("${notification.url}") private String baseUrl;
    @Value("${notification.apiKey}") private String apiKey;
    private final RestTemplate rest = new RestTemplate();

    public void send(String event, Map<String,String> user, List<String> channels,
                     String body, String title, Map<String,String> data) {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        h.set("x-api-key", apiKey);
        rest.postForObject(baseUrl + "/api/notifications/send",
            new HttpEntity<>(Map.of(
                "event", event, "user", user, "channels", channels,
                "body", body, "title", title, "data", data
            ), h),
            String.class);
    }
}
```

---

### 6.6 curl (Testing)

```bash
# Send to all channels
curl -X POST http://localhost:3000/api/notifications/send \
  -H "Content-Type: application/json" \
  -H "x-api-key: ns_live_YOUR_KEY" \
  -d '{
    "event": "INVOICE_CREATED",
    "user": { "id": "user-123", "email": "john@example.com" },
    "channels": ["EMAIL", "PUSH", "IN_APP"],
    "body": "Your invoice #INV-001 for $1500 is ready.",
    "title": "Invoice Created",
    "data": {
      "userName": "John",
      "invoiceNumber": "INV-001",
      "amount": "$1500",
      "invoiceUrl": "https://erp.example.com/invoices/123"
    }
  }'

# Send OTP via SMS (no template needed)
curl -X POST http://localhost:3000/api/notifications/send \
  -H "Content-Type: application/json" \
  -H "x-api-key: ns_live_YOUR_KEY" \
  -d '{
    "event": "OTP_LOGIN",
    "user": { "id": "u1", "email": "a@b.com", "mobile": "+919876543210" },
    "channels": ["SMS", "EMAIL"],
    "body": "Your OTP is 482910. Valid for 5 minutes. Do not share.",
    "title": "Login OTP: 482910",
    "data": { "otp": "482910", "validMinutes": "5" }
  }'

# Send push + in-app (no template needed)
curl -X POST http://localhost:3000/api/notifications/send \
  -H "Content-Type: application/json" \
  -H "x-api-key: ns_live_YOUR_KEY" \
  -d '{
    "event": "POST_LIKED",
    "user": { "id": "user-456" },
    "channels": ["PUSH", "IN_APP"],
    "body": "Sarah liked your post \"My vacation photos\"",
    "title": "Sarah liked your post"
  }'

# Get user notifications
curl "http://localhost:3000/api/notifications?userId=user-123&channel=IN_APP&limit=20" \
  -H "x-api-key: ns_live_YOUR_KEY"

# Mark as read
curl -X PATCH http://localhost:3000/api/notifications/NOTIFICATION_ID/read \
  -H "x-api-key: ns_live_YOUR_KEY"

# Register push token
curl -X POST http://localhost:3000/api/push-tokens/register \
  -H "Content-Type: application/json" \
  -H "x-api-key: ns_live_YOUR_KEY" \
  -d '{
    "userId": "user-123",
    "token": "FCM_TOKEN_HERE",
    "platform": "android",
    "deviceId": "device-uuid"
  }'
```

---

## 7. Mobile App Integration

### 7.1 React Native

#### Setup Push Notifications

```typescript
// services/notifications.ts
import messaging from '@react-native-firebase/messaging';
import { Platform } from 'react-native';

const API_URL = 'https://notify.yourdomain.com';  // your notification service
const API_KEY = 'ns_live_YOUR_KEY';

// Call this after user logs in
export async function setupPushNotifications(userId: string) {
  // 1. Request permission (iOS needs this, Android auto-grants)
  const status = await messaging().requestPermission();
  if (status !== messaging.AuthorizationStatus.AUTHORIZED &&
      status !== messaging.AuthorizationStatus.PROVISIONAL) {
    console.log('Push permission denied');
    return;
  }

  // 2. Get FCM token
  const token = await messaging().getToken();

  // 3. Register with notification service
  await fetch(`${API_URL}/api/push-tokens/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
    body: JSON.stringify({
      userId,
      token,
      platform: Platform.OS,     // 'android' or 'ios'
      deviceId: getDeviceId(),   // from react-native-device-info
    }),
  });

  // 4. Listen for token refresh (happens when app data cleared, etc.)
  const unsubscribe = messaging().onTokenRefresh(async (newToken) => {
    await fetch(`${API_URL}/api/push-tokens/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
      body: JSON.stringify({
        userId,
        token: newToken,
        platform: Platform.OS,
        deviceId: getDeviceId(),
      }),
    });
  });

  return unsubscribe;
}

// Call this on logout
export async function removePushToken() {
  const token = await messaging().getToken();
  await fetch(`${API_URL}/api/push-tokens/unregister`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
    body: JSON.stringify({ token }),
  });
}
```

#### Handle Incoming Push

```typescript
// App.tsx
import messaging from '@react-native-firebase/messaging';

// Foreground — app is open
messaging().onMessage(async (remoteMessage) => {
  // Show in-app alert or update bell icon
  console.log('Push received:', remoteMessage.notification?.title);
});

// Background — app in background, user taps notification
messaging().onNotificationOpenedApp((remoteMessage) => {
  // Navigate to relevant screen
  const data = remoteMessage.data;
  if (data?.postId) navigation.navigate('Post', { id: data.postId });
  if (data?.orderId) navigation.navigate('Order', { id: data.orderId });
});

// Killed — app was closed, user taps notification to open
messaging().getInitialNotification().then((remoteMessage) => {
  if (remoteMessage) {
    // Navigate based on data
  }
});
```

#### Fetch In-App Notifications

```typescript
// services/notifications.ts

export async function getNotifications(userId: string, limit = 20, offset = 0) {
  const res = await fetch(
    `${API_URL}/api/notifications?userId=${userId}&channel=IN_APP&limit=${limit}&offset=${offset}`,
    { headers: { 'x-api-key': API_KEY } }
  );
  const json = await res.json();
  return json.data;  // { notifications: [...], total: 45, unreadCount: 3 }
}

export async function markAsRead(notificationId: string) {
  await fetch(`${API_URL}/api/notifications/${notificationId}/read`, {
    method: 'PATCH',
    headers: { 'x-api-key': API_KEY },
  });
}

export async function getUnreadCount(userId: string): Promise<number> {
  const data = await getNotifications(userId, 1);
  return data.unreadCount || 0;
}
```

#### Notification Bell Component

```tsx
// components/NotificationBell.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { getNotifications, markAsRead, getUnreadCount } from '../services/notifications';

export function NotificationBell({ userId }: { userId: string }) {
  const [count, setCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [showList, setShowList] = useState(false);

  useEffect(() => {
    getUnreadCount(userId).then(setCount);
    const interval = setInterval(() => getUnreadCount(userId).then(setCount), 30000);
    return () => clearInterval(interval);
  }, [userId]);

  const loadNotifications = async () => {
    const data = await getNotifications(userId);
    setNotifications(data.notifications);
    setShowList(true);
  };

  const handleRead = async (id: string) => {
    await markAsRead(id);
    setCount((c) => Math.max(0, c - 1));
    setNotifications((prev) => prev.map((n) =>
      n._id === id ? { ...n, readAt: new Date().toISOString() } : n
    ));
  };

  return (
    <View>
      <TouchableOpacity onPress={loadNotifications}>
        <Text>Bell {count > 0 && `(${count})`}</Text>
      </TouchableOpacity>

      {showList && (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => handleRead(item._id)}
              style={{ opacity: item.readAt ? 0.5 : 1, padding: 12 }}
            >
              <Text style={{ fontWeight: 'bold' }}>{item.renderedSubject}</Text>
              <Text>{item.renderedBody}</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}
```

---

### 7.2 Flutter / Dart

#### Setup Push

```dart
// lib/services/push_service.dart
import 'dart:convert';
import 'dart:io';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:http/http.dart' as http;
import 'package:device_info_plus/device_info_plus.dart';

class PushService {
  static const _apiUrl = 'https://notify.yourdomain.com';
  static const _apiKey = 'ns_live_YOUR_KEY';
  static final _headers = {
    'Content-Type': 'application/json',
    'x-api-key': _apiKey,
  };

  // Call after login
  static Future<void> register(String userId) async {
    final fcm = FirebaseMessaging.instance;

    // Request permission
    final settings = await fcm.requestPermission();
    if (settings.authorizationStatus != AuthorizationStatus.authorized) return;

    // Get token
    final token = await fcm.getToken();
    if (token == null) return;

    // Get device ID
    final deviceInfo = DeviceInfoPlugin();
    String deviceId;
    if (Platform.isAndroid) {
      final info = await deviceInfo.androidInfo;
      deviceId = info.id;
    } else {
      final info = await deviceInfo.iosInfo;
      deviceId = info.identifierForVendor ?? '';
    }

    // Register with notification service
    await http.post(
      Uri.parse('$_apiUrl/api/push-tokens/register'),
      headers: _headers,
      body: jsonEncode({
        'userId': userId,
        'token': token,
        'platform': Platform.isAndroid ? 'android' : 'ios',
        'deviceId': deviceId,
      }),
    );

    // Handle refresh
    fcm.onTokenRefresh.listen((newToken) async {
      await http.post(
        Uri.parse('$_apiUrl/api/push-tokens/register'),
        headers: _headers,
        body: jsonEncode({
          'userId': userId,
          'token': newToken,
          'platform': Platform.isAndroid ? 'android' : 'ios',
          'deviceId': deviceId,
        }),
      );
    });
  }

  // Call on logout
  static Future<void> unregister() async {
    final token = await FirebaseMessaging.instance.getToken();
    if (token == null) return;
    await http.post(
      Uri.parse('$_apiUrl/api/push-tokens/unregister'),
      headers: _headers,
      body: jsonEncode({'token': token}),
    );
  }
}
```

#### Fetch Notifications

```dart
// lib/services/notification_service.dart
class NotificationService {
  static const _apiUrl = 'https://notify.yourdomain.com';
  static const _headers = {'x-api-key': 'ns_live_YOUR_KEY'};

  static Future<Map<String, dynamic>> getNotifications(String userId, {int limit = 20}) async {
    final res = await http.get(
      Uri.parse('$_apiUrl/api/notifications?userId=$userId&channel=IN_APP&limit=$limit'),
      headers: _headers,
    );
    return jsonDecode(res.body)['data'];
    // Returns: { notifications: [...], total: 45, unreadCount: 3 }
  }

  static Future<void> markAsRead(String notificationId) async {
    await http.patch(
      Uri.parse('$_apiUrl/api/notifications/$notificationId/read'),
      headers: _headers,
    );
  }
}
```

---

## 8. Web App Integration

### 8.1 Real-Time Notifications (Socket.IO)

```typescript
// hooks/useNotifications.ts (React / Next.js)
import { useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

const API_URL = 'https://notify.yourdomain.com';
const API_KEY = 'ns_live_YOUR_KEY';

interface Notification {
  id: string;
  event: string;
  subject: string;
  body: string;
  data: Record<string, unknown>;
  createdAt: string;
}

export function useNotifications(clientId: string, appId: string, userId: string) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Socket.IO for real-time
  useEffect(() => {
    const socket: Socket = io(API_URL, {
      query: { clientId, appId, userId },
    });

    socket.on('notification', (data: Notification) => {
      setNotifications((prev) => [data, ...prev]);
      setUnreadCount((c) => c + 1);

      // Browser notification (if permitted)
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(data.subject || data.event, { body: data.body });
      }
    });

    return () => { socket.disconnect(); };
  }, [clientId, appId, userId]);

  // Fetch initial notifications
  const fetchNotifications = useCallback(async () => {
    const res = await fetch(
      `${API_URL}/api/notifications?userId=${userId}&channel=IN_APP&limit=20`,
      { headers: { 'x-api-key': API_KEY } }
    );
    const json = await res.json();
    setNotifications(json.data.notifications);
    setUnreadCount(json.data.unreadCount || 0);
  }, [userId]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  // Mark as read
  const markAsRead = useCallback(async (notificationId: string) => {
    await fetch(`${API_URL}/api/notifications/${notificationId}/read`, {
      method: 'PATCH',
      headers: { 'x-api-key': API_KEY },
    });
    setUnreadCount((c) => Math.max(0, c - 1));
    setNotifications((prev) =>
      prev.map((n) => n.id === notificationId ? { ...n, readAt: new Date().toISOString() } : n)
    );
  }, []);

  return { notifications, unreadCount, markAsRead, refresh: fetchNotifications };
}
```

### 8.2 Notification Bell Component

```tsx
// components/NotificationBell.tsx
'use client';

import { useState } from 'react';
import { useNotifications } from '@/hooks/useNotifications';
import { Bell } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export function NotificationBell({ clientId, appId, userId }: {
  clientId: string; appId: string; userId: string;
}) {
  const { notifications, unreadCount, markAsRead } = useNotifications(clientId, appId, userId);
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="relative p-2">
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white border rounded-lg shadow-lg max-h-96 overflow-y-auto z-50">
          <div className="p-3 border-b font-semibold">Notifications</div>
          {notifications.length === 0 ? (
            <div className="p-4 text-center text-gray-500">No notifications</div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                onClick={() => markAsRead(n.id)}
                className={`p-3 border-b cursor-pointer hover:bg-gray-50 ${!n.readAt ? 'bg-blue-50' : ''}`}
              >
                <p className="font-medium text-sm">{n.subject}</p>
                <p className="text-sm text-gray-600">{n.body}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
```

### 8.3 Web Push (Browser Notifications via FCM)

```typescript
// services/webPush.ts
import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

const firebaseApp = initializeApp({
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "project.firebaseapp.com",
  projectId: "your-project-id",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123",
});

const API_URL = 'https://notify.yourdomain.com';
const API_KEY = 'ns_live_YOUR_KEY';

export async function registerWebPush(userId: string) {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return;

  const messaging = getMessaging(firebaseApp);
  const token = await getToken(messaging, { vapidKey: 'YOUR_VAPID_KEY' });

  await fetch(`${API_URL}/api/push-tokens/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
    body: JSON.stringify({ userId, token, platform: 'web' }),
  });

  // Handle foreground messages
  onMessage(messaging, (payload) => {
    new Notification(payload.notification?.title || 'Notification', {
      body: payload.notification?.body,
      icon: '/icon.png',
    });
  });
}
```

---

## 9. Real-World Scenarios

### 9.1 Complete OTP Flow

```
User App                    Your Backend                Notification Service
  │                            │                              │
  │  POST /auth/send-otp       │                              │
  │  { email, mobile }         │                              │
  │───────────────────────────→│                              │
  │                            │  Generate OTP: "482910"      │
  │                            │  Store in Redis (5 min TTL)  │
  │                            │                              │
  │                            │  POST /api/notifications/send│
  │                            │  event: "OTP_LOGIN"          │
  │                            │  channels: ["SMS", "EMAIL"]  │
  │                            │  body: "Your OTP is 482910.  │
  │                            │    Valid for 5 min. Don't     │
  │                            │    share."                   │
  │                            │  title: "Login OTP: 482910"  │
  │                            │  data: { otp: "482910",      │
  │                            │    validMinutes: "5" }       │
  │                            │─────────────────────────────→│
  │                            │                              │  Queue SMS job
  │                            │                              │  Queue EMAIL job
  │                            │         202 Accepted         │
  │                            │←─────────────────────────────│
  │         { sent: true }     │                              │
  │←───────────────────────────│                              │
  │                            │                              │  Worker: Send SMS
  │  SMS: "Your OTP is        │                              │  body sent directly
  │      482910. Valid 5 min"  │                              │  via SMS provider
  │                            │                              │
  │  Email: Branded OTP       │                              │  Worker: Send EMAIL
  │      email with 482910     │                              │  template (if exists)
  │                            │                              │  or body in layout
  │                            │                              │
  │  POST /auth/verify-otp    │                              │
  │  { email, otp: "482910" } │                              │
  │───────────────────────────→│                              │
  │                            │  Compare with Redis          │
  │                            │  Match! Delete OTP           │
  │                            │  Generate JWT                │
  │      { token: "jwt..." }   │                              │
  │←───────────────────────────│                              │
```

---

### 9.2 Social Media — Post Liked

```
User B                      Your Backend                Notification Service
  │                            │                              │
  │  POST /posts/123/like      │                              │
  │───────────────────────────→│                              │
  │                            │  Save like to DB             │
  │                            │  Get post author (User A)    │
  │                            │                              │
  │                            │  POST /api/notifications/send│
  │                            │  event: "POST_LIKED"         │
  │                            │  user: { id: "user-A" }      │
  │                            │  channels: ["PUSH", "IN_APP"]│
  │                            │  body: "User B liked         │
  │                            │    \"My photo\""             │
  │                            │  title: "User B liked        │
  │                            │    your post"                │
  │                            │─────────────────────────────→│
  │                            │                              │
  │                            │                              │  PUSH: Send title +
  │                            │                              │    body directly via
  │                            │                              │    Firebase → devices
  │                            │                              │
  │                            │                              │  IN_APP: Socket.IO
  │                            │                              │    emit title + body
  │                            │                              │    to User A's room
  │                            │                              │
User A's Phone:                                               │
  ┌────────────────────────────┐                              │
  │ User B liked your post     │  ← title                     │
  │ User B liked "My photo"    │  ← body                      │
  └────────────────────────────┘                              │
                                                              │
User A's Browser:                                             │
  Bell (1) ← In-app notification via Socket.IO                │
```

---

### 9.3 E-Commerce — Full Order Lifecycle

```
Order Placed → Your backend calls:
  event: "ORDER_PLACED"
  channels: ["EMAIL", "PUSH", "IN_APP"]
  body: "Your order #ORD-001 for $99.99 has been confirmed!"
  title: "Order Confirmed"
  data: { userName, orderNumber, total, orderUrl }

  → EMAIL: Renders template (if exists) or wraps body in branded layout
  → PUSH: Shows "Order Confirmed" / "Your order #ORD-001 for $99.99..."
  → IN_APP: Real-time notification with same title/body

Order Shipped → Your backend calls:
  event: "ORDER_SHIPPED"
  channels: ["EMAIL", "PUSH"]
  body: "Your order #ORD-001 has shipped! Track: https://track.example.com/123"
  title: "Order Shipped!"
  data: { userName, orderNumber, trackingNumber, trackingUrl, estimatedDate }

  → EMAIL: Template with tracking link or body in layout
  → PUSH: "Order Shipped!" notification

Order Delivered → Your backend calls:
  event: "ORDER_DELIVERED"
  channels: ["PUSH"]
  body: "Your order #ORD-001 has been delivered!"
  title: "Order Delivered"

  → PUSH only, no template needed

Cart Abandoned (cron job, 2 hours later):
  event: "CART_ABANDONED"
  channels: ["EMAIL"]
  body: "You have 3 items worth $249.99 in your cart. Complete your purchase!"
  title: "You forgot something!"
  data: { userName, itemCount, cartTotal, cartUrl }

  → EMAIL only, template renders rich HTML or body wraps in layout
```

---

## 10. Deployment

### 10.1 Docker (Recommended)

```bash
# Set production .env
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/notification_db
REDIS_PASSWORD=strong-password-here
ADMIN_JWT_SECRET=$(openssl rand -hex 32)
CREDENTIAL_ENCRYPTION_KEY=$(openssl rand -hex 32)
ADMIN_DEFAULT_EMAIL=admin@yourcompany.com
ADMIN_DEFAULT_PASSWORD=strong-admin-password
FRONTEND_URL=https://notify-admin.yourdomain.com
NODE_ENV=production

# Deploy
docker compose -f docker-compose.prod.yml up -d

# Seed admin (first time)
docker compose -f docker-compose.prod.yml --profile setup run --rm seed

# Scale workers
docker compose -f docker-compose.prod.yml up -d --scale worker=3
```

### 10.2 Without Docker

```bash
# Install Redis
sudo apt install redis-server

# Build
npm ci && npm run build

# Configure .env
cp .env.example .env  # edit with production values

# Seed admin
npm run seed

# Run with PM2
npm install -g pm2
pm2 start dist/server.js --name notify-api
pm2 start dist/worker.js --name notify-worker -i 2
pm2 save && pm2 startup

# Admin panel
cd admin-panel
npm ci && npm run build
pm2 start npm --name notify-admin -- start -- -p 3001
```

### 10.3 Nginx Reverse Proxy

```nginx
server {
    listen 443 ssl;
    server_name notify-api.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";    # needed for Socket.IO
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}

server {
    listen 443 ssl;
    server_name notify-admin.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 10.4 Environment Variables Your Apps Need

Each backend that sends notifications only needs 2 env vars:

```env
NOTIFICATION_URL=https://notify-api.yourdomain.com
NOTIFICATION_API_KEY=ns_live_YOUR_KEY_FROM_ADMIN_PANEL
```

Each mobile/web app that receives notifications needs:
```
API URL:  https://notify-api.yourdomain.com
API KEY:  ns_live_YOUR_KEY
Firebase config (for push)
Client ID + App ID (for Socket.IO)
```

---

## Quick Reference Card

| Action | Method | Endpoint | Auth |
|--------|--------|----------|------|
| Send notification | POST | `/api/notifications/send` | API Key |
| Get notifications | GET | `/api/notifications?userId=x` | API Key |
| Mark as read | PATCH | `/api/notifications/:id/read` | API Key |
| Register push token | POST | `/api/push-tokens/register` | API Key |
| Unregister push token | POST | `/api/push-tokens/unregister` | API Key |
| Health check | GET | `/health` | None |
| Admin login | POST | `/api/admin/auth/login` | None |
| All admin endpoints | * | `/api/admin/*` | JWT |

### Notification Lifecycle

```
PENDING → QUEUED → SENT → DELIVERED
                     ↘ FAILED (retried 3 times with exponential backoff)
```

### Channel Requirements

| Channel | user.email | user.mobile | user.id | Push Token | Credential | Template |
|---------|-----------|-------------|---------|------------|------------|----------|
| EMAIL | Required | — | Required | — | SMTP | Optional (fallback to body) |
| SMS | — | Required | Required | — | SMS provider | Not used |
| PUSH | — | — | Required | Must be registered | FCM | Not used |
| IN_APP | — | — | Required | — | None | Not used |

### SMS Providers

| Provider | Config Fields |
|----------|---------------|
| Twilio | accountSid, authToken, fromNumber |
| MSG91 | authKey, senderId, route |
| Vonage | apiKey, apiSecret, fromNumber |
| Textlocal | apiKey, sender |
| Custom Webhook | webhookUrl, method (POST/PUT), headers (optional) |
