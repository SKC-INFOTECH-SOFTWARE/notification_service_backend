# Notification Service — API Documentation

**Base URL**: `http://localhost:3000`
**Version**: 2.0.0

---

## Table of Contents

1. [Authentication](#authentication)
2. [Admin — Auth](#admin-auth)
3. [Admin — Clients](#admin-clients)
4. [Admin — Apps](#admin-apps)
5. [Admin — Credentials](#admin-credentials)
6. [Admin — Email Templates](#admin-email-templates)
7. [Admin — Logs & Stats](#admin-logs--stats)
8. [Notifications](#notifications)
9. [Push Tokens](#push-tokens)
10. [WebSocket (Socket.IO)](#websocket-socketio)
11. [Health Check](#health-check)
12. [Error Responses](#error-responses)

---

## Architecture Overview

- **Templates are EMAIL-only** — SMS, PUSH, and IN_APP channels use `body` and `title` sent directly from your backend.
- **`body` is required** — it is the primary content for all channels. For email, it serves as a fallback if no template exists.
- **No error on missing templates** — if no email template exists for an event, the `body` is wrapped in the branded base layout. Non-email channels never look up templates.
- **SMS supports multiple providers** — Twilio, MSG91, Vonage, Textlocal, and Custom Webhook.

---

## Authentication

### Admin Endpoints
All `/api/admin/*` endpoints (except `/api/admin/auth/login`) require a JWT Bearer token.

```
Authorization: Bearer <jwt_token>
```

### App/Client Endpoints
All `/api/notifications/*` and `/api/push-tokens/*` endpoints require an API key.

```
x-api-key: ns_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## Admin Auth

### POST `/api/admin/auth/login`

Login to the admin panel. Returns a JWT token valid for 24 hours.

**Rate Limit**: 30 requests/minute per IP

**Request Body**:
```json
{
  "email": "admin@notification.local",
  "password": "change-this-password"
}
```

**Response** `200 OK`:
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "admin": {
      "id": "6650a1b2c3d4e5f6a7b8c9d0",
      "email": "admin@notification.local",
      "role": "superadmin"
    }
  }
}
```

**Error** `401`:
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid email or password"
  }
}
```

---

## Admin Clients

### POST `/api/admin/clients`

Create a new tenant/client.

**Headers**: `Authorization: Bearer <token>`

**Request Body**:
```json
{
  "name": "Acme Corp",
  "slug": "acme-corp",
  "branding": {
    "logoUrl": "https://acme.com/logo.png",
    "brandColor": "#FF5733",
    "companyName": "Acme Corporation",
    "footerText": "© 2025 Acme Corp. All rights reserved."
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Display name |
| slug | string | Yes | Unique identifier (lowercase, alphanumeric + hyphens) |
| branding.logoUrl | string | No | Logo URL for email templates |
| branding.brandColor | string | No | Hex color for branding |
| branding.companyName | string | No | Company name in emails |
| branding.footerText | string | No | Footer text in emails |

**Response** `201 Created`:
```json
{
  "success": true,
  "data": {
    "_id": "6650a1b2c3d4e5f6a7b8c9d0",
    "name": "Acme Corp",
    "slug": "acme-corp",
    "branding": {
      "logoUrl": "https://acme.com/logo.png",
      "brandColor": "#FF5733",
      "companyName": "Acme Corporation",
      "footerText": "© 2025 Acme Corp. All rights reserved."
    },
    "isActive": true,
    "createdAt": "2025-01-15T10:30:00.000Z",
    "updatedAt": "2025-01-15T10:30:00.000Z"
  }
}
```

### GET `/api/admin/clients`

List all clients.

**Response** `200 OK`:
```json
{
  "success": true,
  "data": [
    {
      "_id": "6650a1b2c3d4e5f6a7b8c9d0",
      "name": "Acme Corp",
      "slug": "acme-corp",
      "branding": { ... },
      "isActive": true,
      "createdAt": "2025-01-15T10:30:00.000Z"
    }
  ]
}
```

### GET `/api/admin/clients/:id`

Get a single client by ID.

### PATCH `/api/admin/clients/:id`

Update a client.

**Request Body** (all fields optional):
```json
{
  "name": "Acme Corp Updated",
  "isActive": false,
  "branding": {
    "brandColor": "#3366FF"
  }
}
```

---

## Admin Apps

### POST `/api/admin/apps`

Create a new app under a client. Returns the raw API key (shown only once).

**Request Body**:
```json
{
  "clientId": "6650a1b2c3d4e5f6a7b8c9d0",
  "name": "ERP System",
  "slug": "erp"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| clientId | string | Yes | Parent client ID |
| name | string | Yes | App display name |
| slug | string | Yes | Unique per client (lowercase, alphanumeric + hyphens) |

**Response** `201 Created`:
```json
{
  "success": true,
  "data": {
    "app": {
      "_id": "6650b2c3d4e5f6a7b8c9d0e1",
      "clientId": "6650a1b2c3d4e5f6a7b8c9d0",
      "name": "ERP System",
      "slug": "erp",
      "apiKeyPrefix": "ns_live_abcd",
      "isActive": true,
      "createdAt": "2025-01-15T10:35:00.000Z"
    },
    "apiKey": "ns_live_abcdef1234567890abcdef1234567890abcdef12"
  },
  "message": "Store this API key securely — it will not be shown again."
}
```

### GET `/api/admin/apps`

List all apps. Optional query filter: `?clientId=<id>`

### GET `/api/admin/apps/:id`

Get a single app by ID.

### POST `/api/admin/apps/:id/regenerate-key`

Regenerate the API key for an app. The old key is immediately revoked.

**Response** `200 OK`:
```json
{
  "success": true,
  "data": {
    "app": { ... },
    "apiKey": "ns_live_new_key_here_1234567890abcdef1234567890"
  },
  "message": "New API key generated. The old key is now invalid."
}
```

### POST `/api/admin/apps/:id/revoke-key`

Revoke an app's API key. The app becomes inactive.

---

## Admin Credentials

### POST `/api/admin/credentials`

Store encrypted notification credentials for a client + channel. Any existing active credential for the same client+channel is automatically deactivated.

**Request Body (EMAIL/SMTP)**:
```json
{
  "clientId": "6650a1b2c3d4e5f6a7b8c9d0",
  "channel": "EMAIL",
  "provider": "smtp",
  "config": {
    "host": "smtp.gmail.com",
    "port": 587,
    "secure": false,
    "auth": {
      "user": "noreply@acme.com",
      "pass": "app-specific-password"
    },
    "fromName": "Acme Notifications"
  }
}
```

**Request Body (PUSH/FCM)**:
```json
{
  "clientId": "6650a1b2c3d4e5f6a7b8c9d0",
  "channel": "PUSH",
  "provider": "fcm",
  "config": {
    "type": "service_account",
    "project_id": "my-project",
    "private_key_id": "...",
    "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
    "client_email": "firebase-adminsdk@my-project.iam.gserviceaccount.com",
    "client_id": "...",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token"
  }
}
```

**Request Body (SMS/Twilio)**:
```json
{
  "clientId": "6650a1b2c3d4e5f6a7b8c9d0",
  "channel": "SMS",
  "provider": "twilio",
  "config": {
    "accountSid": "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "authToken": "your_auth_token",
    "fromNumber": "+1234567890"
  }
}
```

**Request Body (SMS/MSG91)**:
```json
{
  "clientId": "6650a1b2c3d4e5f6a7b8c9d0",
  "channel": "SMS",
  "provider": "msg91",
  "config": {
    "authKey": "your_auth_key",
    "senderId": "ACMECO",
    "route": "4"
  }
}
```

**Request Body (SMS/Vonage)**:
```json
{
  "clientId": "6650a1b2c3d4e5f6a7b8c9d0",
  "channel": "SMS",
  "provider": "vonage",
  "config": {
    "apiKey": "your_api_key",
    "apiSecret": "your_api_secret",
    "fromNumber": "+1234567890"
  }
}
```

**Request Body (SMS/Textlocal)**:
```json
{
  "clientId": "6650a1b2c3d4e5f6a7b8c9d0",
  "channel": "SMS",
  "provider": "textlocal",
  "config": {
    "apiKey": "your_api_key",
    "sender": "ACMECO"
  }
}
```

**Request Body (SMS/Custom Webhook)**:
```json
{
  "clientId": "6650a1b2c3d4e5f6a7b8c9d0",
  "channel": "SMS",
  "provider": "custom",
  "config": {
    "webhookUrl": "https://api.example.com/sms/send",
    "method": "POST",
    "headers": {
      "Authorization": "Bearer your_token"
    }
  }
}
```

| Field | Type | Required | Values |
|-------|------|----------|--------|
| clientId | string | Yes | Client ObjectId |
| channel | string | Yes | `EMAIL`, `SMS`, `PUSH` |
| provider | string | Yes | See table below |
| config | object | Yes | Provider-specific config (encrypted at rest) |

**Supported Providers**:

| Channel | Provider | Config Fields |
|---------|----------|---------------|
| EMAIL | `smtp` | host, port, secure, auth.user, auth.pass, fromName |
| PUSH | `fcm` | Firebase service account JSON fields |
| SMS | `twilio` | accountSid, authToken, fromNumber |
| SMS | `msg91` | authKey, senderId, route |
| SMS | `vonage` | apiKey, apiSecret, fromNumber |
| SMS | `textlocal` | apiKey, sender |
| SMS | `custom` | webhookUrl, method (POST/PUT), headers (optional) |

**Response** `201 Created`:
```json
{
  "success": true,
  "data": {
    "_id": "6650c3d4e5f6a7b8c9d0e1f2",
    "clientId": "6650a1b2c3d4e5f6a7b8c9d0",
    "channel": "SMS",
    "provider": "twilio",
    "isActive": true,
    "createdAt": "2025-01-15T10:40:00.000Z"
  }
}
```

### GET `/api/admin/credentials`

List credentials. Config is never returned for security.

**Query Params**: `?clientId=<id>&channel=EMAIL`

### DELETE `/api/admin/credentials/:id`

Deactivate a credential (soft delete).

---

## Admin Email Templates

> **Note:** Templates are only supported for the EMAIL channel. SMS, PUSH, and IN_APP channels use `body` and `title` sent directly in the notification request.

### Base Templates (Email Layouts)

#### POST `/api/admin/templates/base`

Create an email base layout template. Use `{{{content}}}` as the placeholder for event-specific content.

**Request Body**:
```json
{
  "clientId": "6650a1b2c3d4e5f6a7b8c9d0",
  "name": "Default Layout",
  "htmlTemplate": "<!DOCTYPE html><html><body><div style='max-width:600px;margin:0 auto;'><header style='background:{{brandColor}};padding:20px;'><img src='{{logoUrl}}' alt='{{companyName}}'/></header><main style='padding:20px;'>{{{content}}}</main><footer style='padding:10px;color:#999;'>{{footerText}}</footer></div></body></html>",
  "isDefault": true
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| clientId | string | Yes | Client ObjectId |
| name | string | Yes | Template name |
| htmlTemplate | string | Yes | Handlebars HTML with `{{{content}}}` placeholder |
| isDefault | boolean | No | If true, used when no explicit base template is assigned |

#### GET `/api/admin/templates/base`

List base templates. Query: `?clientId=<id>`

#### PATCH `/api/admin/templates/base/:id`

Update a base template.

---

### Notification Templates (Event-specific, EMAIL only)

#### POST `/api/admin/templates`

Create an email template for a specific event. Templates are optional — if no template exists for an event, the `body` from the notification request is wrapped in the base layout.

**Request Body**:
```json
{
  "clientId": "6650a1b2c3d4e5f6a7b8c9d0",
  "appId": "6650b2c3d4e5f6a7b8c9d0e1",
  "event": "INVOICE_CREATED",
  "channel": "EMAIL",
  "subject": "Invoice #{{invoiceNumber}} — {{amount}}",
  "bodyTemplate": "<h2>Hello {{userName}},</h2><p>Your invoice <strong>#{{invoiceNumber}}</strong> for <strong>{{amount}}</strong> has been created.</p><p><a href='{{invoiceUrl}}'>View Invoice</a></p>",
  "baseTemplateId": "6650d4e5f6a7b8c9d0e1f2a3"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| clientId | string | Yes | Client ObjectId |
| appId | string | Yes | App ObjectId |
| event | string | Yes | Event name (auto uppercased, e.g., `INVOICE_CREATED`) |
| channel | string | Yes | Must be `EMAIL` (only supported value) |
| subject | string | No | Handlebars subject template |
| bodyTemplate | string | Yes | Handlebars body template (HTML) |
| baseTemplateId | string | No | Email base layout ID (uses default if not specified) |

**Response** `201 Created`:
```json
{
  "success": true,
  "data": {
    "_id": "6650e5f6a7b8c9d0e1f2a3b4",
    "clientId": "6650a1b2c3d4e5f6a7b8c9d0",
    "appId": "6650b2c3d4e5f6a7b8c9d0e1",
    "event": "INVOICE_CREATED",
    "channel": "EMAIL",
    "subject": "Invoice #{{invoiceNumber}} — {{amount}}",
    "bodyTemplate": "<h2>Hello {{userName}},</h2>...",
    "baseTemplateId": "6650d4e5f6a7b8c9d0e1f2a3",
    "isActive": true,
    "createdAt": "2025-01-15T10:45:00.000Z"
  }
}
```

#### GET `/api/admin/templates`

List email templates. Filters: `?clientId=<id>&appId=<id>&event=INVOICE_CREATED`

#### GET `/api/admin/templates/:id`

Get a single template.

#### PATCH `/api/admin/templates/:id`

Update template fields: `subject`, `bodyTemplate`, `baseTemplateId`, `isActive`.

#### POST `/api/admin/templates/:id/preview`

Preview a rendered template with sample data.

**Request Body**:
```json
{
  "sampleData": {
    "userName": "John Doe",
    "invoiceNumber": "INV-001",
    "amount": "$150.00",
    "invoiceUrl": "https://app.acme.com/invoices/001"
  }
}
```

**Response** `200 OK`:
```json
{
  "success": true,
  "data": {
    "subject": "Invoice #INV-001 — $150.00",
    "body": "<h2>Hello John Doe,</h2><p>Your invoice <strong>#INV-001</strong>...</p>",
    "html": "<!DOCTYPE html><html>...(full rendered HTML with base layout)...</html>"
  }
}
```

---

## Admin Logs & Stats

### GET `/api/admin/logs/audit`

Fetch admin audit logs.

**Query Params**:

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| clientId | string | — | Filter by client |
| action | string | — | Filter by action (e.g., `CLIENT_CREATED`) |
| limit | number | 50 | Max 200 |
| offset | number | 0 | Pagination offset |

**Response** `200 OK`:
```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "_id": "...",
        "action": "CLIENT_CREATED",
        "actor": "admin:admin@notification.local",
        "resource": "Client",
        "resourceId": "6650a1b2c3d4e5f6a7b8c9d0",
        "details": { "slug": "acme-corp" },
        "ip": "192.168.1.100",
        "createdAt": "2025-01-15T10:30:00.000Z"
      }
    ],
    "total": 42
  }
}
```

### GET `/api/admin/logs/notifications`

Fetch notification delivery logs.

**Query Params**:

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| clientId | string | — | Filter by client |
| appId | string | — | Filter by app |
| status | string | — | `PENDING`, `QUEUED`, `SENT`, `DELIVERED`, `FAILED` |
| event | string | — | Filter by event name |
| channel | string | — | `EMAIL`, `SMS`, `PUSH`, `IN_APP` |
| userId | string | — | Filter by recipient user ID |
| limit | number | 50 | Max 200 |
| offset | number | 0 | Pagination offset |

**Response** `200 OK`:
```json
{
  "success": true,
  "data": {
    "notifications": [
      {
        "_id": "...",
        "clientId": "...",
        "appId": "...",
        "event": "INVOICE_CREATED",
        "channel": "EMAIL",
        "userId": "user-123",
        "userEmail": "john@example.com",
        "status": "SENT",
        "sentAt": "2025-01-15T10:50:00.000Z",
        "renderedSubject": "Invoice #INV-001 — $150.00",
        "createdAt": "2025-01-15T10:49:55.000Z"
      }
    ],
    "total": 156
  }
}
```

### GET `/api/admin/logs/stats`

Get aggregated notification statistics.

**Response** `200 OK`:
```json
{
  "success": true,
  "data": {
    "byStatus": [
      { "_id": "SENT", "count": 1234 },
      { "_id": "FAILED", "count": 12 },
      { "_id": "QUEUED", "count": 5 },
      { "_id": "DELIVERED", "count": 890 }
    ],
    "byChannel": [
      { "_id": "EMAIL", "count": 800 },
      { "_id": "PUSH", "count": 500 },
      { "_id": "IN_APP", "count": 700 },
      { "_id": "SMS", "count": 141 }
    ],
    "totalToday": 85
  }
}
```

---

## Notifications

### POST `/api/notifications/send`

Send a notification across one or more channels.

**Headers**: `x-api-key: ns_live_...`
**Rate Limit**: 100 requests/minute per API key

**Request Body**:
```json
{
  "event": "INVOICE_CREATED",
  "user": {
    "id": "user-123",
    "email": "john@example.com",
    "mobile": "+1234567890"
  },
  "channels": ["EMAIL", "PUSH", "IN_APP"],
  "body": "Your invoice #INV-001 for $150.00 is ready.",
  "title": "Invoice Created",
  "data": {
    "userName": "John Doe",
    "invoiceNumber": "INV-001",
    "amount": "$150.00",
    "invoiceUrl": "https://app.acme.com/invoices/001"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| event | string | Yes | Event name (auto uppercased) |
| user.id | string | Yes | Recipient user identifier |
| user.email | string | Conditional | Required when channels include `EMAIL` |
| user.mobile | string | Conditional | Required when channels include `SMS` |
| channels | string[] | Yes | Min 1: `EMAIL`, `SMS`, `PUSH`, `IN_APP` |
| body | string | **Yes** | Primary notification content. Used directly by SMS/PUSH/IN_APP. Fallback for EMAIL if no template. Max 5000 chars. |
| title | string | No | Notification title. Used as push title, in-app subject, email subject fallback. Falls back to event name. Max 200 chars. |
| data | object | No | Template variables for email Handlebars rendering. Also sent as FCM data payload. |

**Channel behavior**:

| Channel | Content Source | Template |
|---------|---------------|----------|
| EMAIL | Template rendered with `data` (if exists), otherwise `body` wrapped in branded layout | Optional |
| SMS | `body` sent as SMS text directly | Not used |
| PUSH | `title` + `body` sent as push notification | Not used |
| IN_APP | `title` + `body` delivered via Socket.IO and stored in DB | Not used |

**Response** `202 Accepted`:
```json
{
  "success": true,
  "data": {
    "notifications": [
      { "id": "6650f1...", "channel": "EMAIL", "status": "QUEUED" },
      { "id": "6650f2...", "channel": "PUSH", "status": "QUEUED" },
      { "id": "6650f3...", "channel": "IN_APP", "status": "QUEUED" }
    ]
  },
  "message": "3 notification(s) queued for delivery."
}
```

### GET `/api/notifications`

Fetch notifications for a user.

**Headers**: `x-api-key: ns_live_...`

**Query Params**:

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| userId | string | Yes | — | User identifier |
| channel | string | No | — | Filter by channel |
| status | string | No | — | Filter by status |
| limit | number | No | 20 | Max 100 |
| offset | number | No | 0 | Pagination offset |

**Response** `200 OK`:
```json
{
  "success": true,
  "data": {
    "notifications": [
      {
        "_id": "6650f1...",
        "event": "INVOICE_CREATED",
        "channel": "IN_APP",
        "userId": "user-123",
        "status": "SENT",
        "renderedSubject": "Invoice Created",
        "renderedBody": "Your invoice #INV-001 for $150.00 is ready.",
        "readAt": null,
        "createdAt": "2025-01-15T10:50:00.000Z"
      }
    ],
    "total": 25,
    "unreadCount": 5
  }
}
```

### PATCH `/api/notifications/:id/read`

Mark an in-app notification as read.

**Headers**: `x-api-key: ns_live_...`

**Response** `200 OK`:
```json
{
  "success": true,
  "data": {
    "_id": "6650f1...",
    "readAt": "2025-01-15T11:00:00.000Z",
    "status": "SENT"
  }
}
```

---

## Push Tokens

### POST `/api/push-tokens/register`

Register a device push token for FCM notifications.

**Headers**: `x-api-key: ns_live_...`

**Request Body**:
```json
{
  "userId": "user-123",
  "token": "fcm-device-token-string",
  "platform": "android",
  "deviceId": "device-unique-id"
}
```

| Field | Type | Required | Values |
|-------|------|----------|--------|
| userId | string | Yes | User identifier |
| token | string | Yes | FCM device token |
| platform | string | Yes | `android`, `ios`, `web` |
| deviceId | string | No | Unique device ID (deactivates old tokens for same device) |

**Response** `200 OK`:
```json
{
  "success": true,
  "data": {
    "_id": "...",
    "clientId": "...",
    "appId": "...",
    "userId": "user-123",
    "token": "fcm-device-token-string",
    "platform": "android",
    "isActive": true,
    "lastUsedAt": "2025-01-15T10:55:00.000Z"
  }
}
```

### POST `/api/push-tokens/unregister`

Deactivate a push token.

**Request Body**:
```json
{
  "token": "fcm-device-token-string"
}
```

**Response** `200 OK`:
```json
{
  "success": true,
  "message": "Push token unregistered."
}
```

---

## WebSocket (Socket.IO)

Connect to receive real-time in-app notifications.

**URL**: `ws://localhost:3000`
**Path**: `/socket.io`

**Connection Query Params**:
```javascript
const socket = io("http://localhost:3000", {
  query: {
    clientId: "6650a1b2c3d4e5f6a7b8c9d0",
    appId: "6650b2c3d4e5f6a7b8c9d0e1",
    userId: "user-123"
  }
});
```

**Events**:

| Event | Direction | Description |
|-------|-----------|-------------|
| `notification` | Server → Client | New in-app notification delivered |
| `connect` | — | Connection established |
| `disconnect` | — | Connection closed |

**Notification Event Payload**:
```json
{
  "id": "6650f3...",
  "event": "POST_LIKED",
  "subject": "Sarah liked your post",
  "body": "Sarah liked \"My vacation photos\"",
  "data": {
    "likerName": "Sarah",
    "postTitle": "My vacation photos"
  },
  "createdAt": "2025-01-15T10:50:00.000Z"
}
```

> **Note:** The `subject` and `body` fields come directly from the `title` and `body` in the send request. No template rendering is performed for IN_APP notifications.

---

## Health Check

### GET `/health`

**Response** `200 OK`:
```json
{
  "status": "ok",
  "timestamp": "2025-01-15T10:00:00.000Z"
}
```

---

## Error Responses

All errors follow a consistent format:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description"
  }
}
```

### Standard Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid request body / query params |
| `UNAUTHORIZED` | 401 | Missing or invalid authentication |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Duplicate resource (e.g., slug already exists) |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

### Validation Error Example

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      {
        "path": ["body"],
        "message": "Required"
      }
    ]
  }
}
```

---

## Rate Limits

| Endpoint Group | Limit | Window | Key |
|----------------|-------|--------|-----|
| App API (`/api/notifications`, `/api/push-tokens`) | 100 requests | 1 minute | API key |
| Admin API (`/api/admin/*`) | 30 requests | 1 minute | IP address |

When rate limited, the response includes:

```
HTTP 429 Too Many Requests
Retry-After: 60
```

---

## Notification Lifecycle

```
PENDING → QUEUED → SENT → DELIVERED
                     ↘ FAILED (retried up to 3 times)
```

| Status | Description |
|--------|-------------|
| `PENDING` | Created, not yet queued |
| `QUEUED` | Added to BullMQ job queue |
| `SENT` | Successfully sent via provider |
| `DELIVERED` | Delivery confirmed (channel-specific) |
| `FAILED` | All retry attempts exhausted |
