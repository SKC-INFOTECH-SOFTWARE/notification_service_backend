import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';

import { config } from './config';
import { connectDatabase } from './config/database';
import { errorHandler } from './middleware/errorHandler';
import { initSocketIO } from './services/socketManager';

import notificationRoutes from './routes/notification';
import pushTokenRoutes from './routes/pushToken';
import adminRoutes from './routes/admin';

async function bootstrap(): Promise<void> {
  // Connect to MongoDB
  await connectDatabase();

  const app = express();
  const server = http.createServer(app);

  // Initialize Socket.IO
  initSocketIO(server);

  // Global middleware
  app.use(helmet());
  app.use(cors({
    origin: config.frontendUrl === '*' ? '*' : config.frontendUrl.split(',').map(s => s.trim()),
  }));
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(morgan(config.env === 'production' ? 'combined' : 'short'));

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Routes
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/push-tokens', pushTokenRoutes);
  app.use('/api/admin', adminRoutes);

  // Error handler (must be last)
  app.use(errorHandler);

  server.listen(config.port, () => {
    console.log(`[Server] Notification service running on port ${config.port}`);
    console.log(`[Server] Environment: ${config.env}`);
  });
}

bootstrap().catch((err) => {
  console.error('[Server] Failed to start:', err);
  process.exit(1);
});
