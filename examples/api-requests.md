# Notification Service — API Examples

All examples use `curl`. Replace `localhost:3000` with your deployment URL.

---

## 1. Admin Auth

### Login

```bash
curl -X POST http://localhost:3000/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@notification.local",
    "password": "change-this-password"
  }'
```

Response includes a JWT `token`. Use it as `Authorization: Bearer <token>` in all admin requests below.

---

## 2. Client Onboarding Flow

### Step 1: Create a Client

```bash
curl -X POST http://localhost:3000/api/admin/clients \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme Corp",
    "slug": "acme",
    "branding": {
      "logoUrl": "https://acme.com/logo.png",
      "brandColor": "#FF5722",
      "companyName": "Acme Corporation",
      "footerText": "© 2025 Acme Corp. All rights reserved."
    }
  }'
```

### Step 2: Create an App under that Client

```bash
curl -X POST http://localhost:3000/api/admin/apps \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "<CLIENT_ID>",
    "name": "ERP System",
    "slug": "erp"
  }'
```

**IMPORTANT**: The response contains `apiKey` — store it securely. It is shown only once.

### Step 3: Store Email Credentials

```bash
curl -X POST http://localhost:3000/api/admin/credentials \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "<CLIENT_ID>",
    "channel": "EMAIL",
    "provider": "smtp",
    "config": {
      "host": "smtp.gmail.com",
      "port": 587,
      "secure": false,
      "auth": {
        "user": "noreply@acme.com",
        "pass": "app-password-here"
      },
      "fromName": "Acme Corp",
      "fromEmail": "noreply@acme.com"
    }
  }'
```

### Step 4: Create a Base Email Layout (optional, a default is built-in)

```bash
curl -X POST http://localhost:3000/api/admin/templates/base \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "<CLIENT_ID>",
    "name": "Default Layout",
    "isDefault": true,
    "htmlTemplate": "<!DOCTYPE html><html><body style=\"font-family: sans-serif;\"><div style=\"background:{{brandColor}}; padding:20px; text-align:center;\"><img src=\"{{logoUrl}}\" height=\"40\"><h2 style=\"color:#fff;\">{{companyName}}</h2></div><div style=\"padding:24px;\">{{{content}}}</div><div style=\"padding:16px; text-align:center; font-size:12px; color:#999;\">{{footerText}}</div></body></html>"
  }'
```

### Step 5: Create Event Templates

```bash
# Email template for INVOICE_CREATED event
curl -X POST http://localhost:3000/api/admin/templates \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "<CLIENT_ID>",
    "appId": "<APP_ID>",
    "event": "INVOICE_CREATED",
    "channel": "EMAIL",
    "subject": "Invoice #{{invoiceNumber}} Created",
    "bodyTemplate": "<h2>New Invoice</h2><p>Hi {{userName}},</p><p>Invoice <strong>#{{invoiceNumber}}</strong> has been created for <strong>{{currency}} {{amount}}</strong>.</p><p>Due date: {{dueDate}}</p><p><a href=\"{{invoiceUrl}}\" style=\"background:{{brandColor}};color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;\">View Invoice</a></p>"
  }'

# In-app template for the same event
curl -X POST http://localhost:3000/api/admin/templates \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "<CLIENT_ID>",
    "appId": "<APP_ID>",
    "event": "INVOICE_CREATED",
    "channel": "IN_APP",
    "subject": "New Invoice #{{invoiceNumber}}",
    "bodyTemplate": "Invoice #{{invoiceNumber}} for {{currency}} {{amount}} has been created."
  }'
```

---

## 3. Sending Notifications (from your App's backend)

This is what the ERP / Matrimony / Attendance app calls:

```bash
curl -X POST http://localhost:3000/api/notifications/send \
  -H "x-api-key: ns_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "INVOICE_CREATED",
    "user": {
      "id": "user-123",
      "email": "john@example.com"
    },
    "channels": ["EMAIL", "IN_APP"],
    "data": {
      "userName": "John Doe",
      "invoiceNumber": "INV-2025-001",
      "amount": "15,000.00",
      "currency": "INR",
      "dueDate": "2025-02-28",
      "invoiceUrl": "https://erp.acme.com/invoices/INV-2025-001"
    }
  }'
```

Note: The app sends **only data**. No HTML, no design, no branding.

---

## 4. Fetching User Notifications

```bash
curl http://localhost:3000/api/notifications?userId=user-123 \
  -H "x-api-key: ns_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

---

## 5. Mark as Read

```bash
curl -X PATCH http://localhost:3000/api/notifications/<NOTIFICATION_ID>/read \
  -H "x-api-key: ns_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

---

## 6. Firebase Push Notifications (Multi-Tenant)

### Step A: Store FCM Credentials per Client (Admin)

Each client brings their own Firebase project. Download the service-account JSON
from Firebase Console → Project Settings → Service Accounts → Generate New Private Key.
Then store it encrypted via the credentials API:

```bash
curl -X POST http://localhost:3000/api/admin/credentials \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "<CLIENT_ID>",
    "channel": "PUSH",
    "provider": "fcm",
    "config": {
      "type": "service_account",
      "project_id": "acme-firebase-project",
      "private_key_id": "key-id-here",
      "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEv...\n-----END PRIVATE KEY-----\n",
      "client_email": "firebase-adminsdk-xxx@acme-firebase-project.iam.gserviceaccount.com",
      "client_id": "1234567890",
      "auth_uri": "https://accounts.google.com/o/oauth2/auth",
      "token_uri": "https://oauth2.googleapis.com/token"
    }
  }'
```

### Step B: Create a PUSH Template for an Event

```bash
curl -X POST http://localhost:3000/api/admin/templates \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "<CLIENT_ID>",
    "appId": "<APP_ID>",
    "event": "ORDER_SHIPPED",
    "channel": "PUSH",
    "subject": "Order {{orderNumber}} Shipped!",
    "bodyTemplate": "Your order #{{orderNumber}} has been shipped and will arrive by {{estimatedDate}}."
  }'
```

### Step C: Register Device Token (from Mobile/Web App)

Called by the app frontend after obtaining the FCM token from Firebase client SDK:

```bash
curl -X POST http://localhost:3000/api/push-tokens/register \
  -H "x-api-key: ns_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-123",
    "token": "fcm-device-token-from-firebase-sdk...",
    "platform": "android",
    "deviceId": "unique-device-id-optional"
  }'
```

### Step D: Send a Push Notification (from App Backend)

```bash
curl -X POST http://localhost:3000/api/notifications/send \
  -H "x-api-key: ns_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "ORDER_SHIPPED",
    "user": {
      "id": "user-123",
      "email": "john@example.com"
    },
    "channels": ["PUSH", "IN_APP"],
    "data": {
      "orderNumber": "ORD-2025-789",
      "estimatedDate": "Feb 25, 2025"
    }
  }'
```

The worker will:
1. Load the client's Firebase service-account (cached per tenant)
2. Find all active device tokens for user-123 under this client+app
3. Send via Firebase Cloud Messaging to all devices
4. Auto-deactivate any invalid/expired tokens

### Step E: Unregister Token (on Logout)

```bash
curl -X POST http://localhost:3000/api/push-tokens/unregister \
  -H "x-api-key: ns_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "fcm-device-token-from-firebase-sdk..."
  }'
```

---

## 7. Regenerate API Key (Admin)

```bash
curl -X POST http://localhost:3000/api/admin/apps/<APP_ID>/regenerate-key \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

---

## 7. Preview a Template

```bash
curl -X POST http://localhost:3000/api/admin/templates/<TEMPLATE_ID>/preview \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "sampleData": {
      "userName": "Jane Smith",
      "invoiceNumber": "INV-PREVIEW-001",
      "amount": "5,000.00",
      "currency": "USD",
      "dueDate": "2025-03-15",
      "invoiceUrl": "https://example.com"
    }
  }'
```

---

## 8. Socket.IO Connection (In-App Notifications)

```javascript
import { io } from "socket.io-client";

const socket = io("http://localhost:3000", {
  query: {
    clientId: "<CLIENT_ID>",
    appId: "<APP_ID>",
    userId: "user-123",
  },
});

socket.on("notification", (data) => {
  console.log("New notification:", data);
  // { id, event, subject, body, data, createdAt }
});
```

---

## 9. Logs & Stats

```bash
# Audit logs
curl http://localhost:3000/api/admin/logs/audit \
  -H "Authorization: Bearer <ADMIN_TOKEN>"

# Notification delivery logs
curl "http://localhost:3000/api/admin/logs/notifications?clientId=<ID>&status=FAILED" \
  -H "Authorization: Bearer <ADMIN_TOKEN>"

# Aggregate stats
curl http://localhost:3000/api/admin/logs/stats \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```
