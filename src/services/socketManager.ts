import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import Redis from 'ioredis';
import { config } from '../config';
import { getRedisConfig } from '../config/redis';

let io: SocketIOServer | null = null;

const SOCKET_CHANNEL = 'socket:emit';

interface SocketEmitMessage {
  room: string;
  event: string;
  data: unknown;
}

export function initSocketIO(httpServer: HttpServer): SocketIOServer {
  const origin = config.frontendUrl === '*' ? '*' : config.frontendUrl.split(',').map(s => s.trim());

  io = new SocketIOServer(httpServer, {
    cors: {
      origin,
      methods: ['GET', 'POST'],
    },
    path: '/socket.io',
  });

  io.on('connection', (socket: Socket) => {
    const { clientId, appId, userId } = socket.handshake.query;

    if (!clientId || !appId || !userId) {
      socket.disconnect(true);
      return;
    }

    // Room format: clientId:appId:userId — strict isolation
    const room = `${clientId}:${appId}:${userId}`;
    socket.join(room);

    console.log(`[Socket] User joined room: ${room}`);

    socket.on('disconnect', () => {
      console.log(`[Socket] User left room: ${room}`);
    });
  });

  // Subscribe to Redis for cross-process emit (worker -> API)
  const redisConfig = getRedisConfig();
  const subscriber = new Redis({
    host: redisConfig.host,
    port: redisConfig.port,
    password: redisConfig.password,
    maxRetriesPerRequest: null,
  });

  subscriber.subscribe(SOCKET_CHANNEL, (err) => {
    if (err) {
      console.error('[Socket.IO] Failed to subscribe to Redis channel:', err.message);
    } else {
      console.log('[Socket.IO] Subscribed to Redis channel for cross-process emit');
    }
  });

  subscriber.on('message', (_channel: string, message: string) => {
    try {
      const { room, event, data } = JSON.parse(message) as SocketEmitMessage;
      io?.to(room).emit(event, data);
    } catch (err) {
      console.error('[Socket.IO] Failed to process Redis message:', err);
    }
  });

  console.log('[Socket.IO] Initialized');
  return io;
}

export function getIO(): SocketIOServer | null {
  return io;
}

/**
 * Emit a real-time notification to a specific user.
 * If Socket.IO is initialized (API server), emits directly.
 * If not (worker process), publishes to Redis so the API server can emit.
 */
export function emitToUser(
  clientId: string,
  appId: string,
  userId: string,
  event: string,
  data: unknown
): void {
  const room = `${clientId}:${appId}:${userId}`;

  if (io) {
    // Direct emit (API server process)
    io.to(room).emit(event, data);
    return;
  }

  // Publish to Redis (worker process) — lazy-init publisher
  if (!redisPublisher) {
    const redisConfig = getRedisConfig();
    redisPublisher = new Redis({
      host: redisConfig.host,
      port: redisConfig.port,
      password: redisConfig.password,
      maxRetriesPerRequest: null,
    });
  }

  const message: SocketEmitMessage = { room, event, data };
  redisPublisher.publish(SOCKET_CHANNEL, JSON.stringify(message)).catch((err) => {
    console.error('[Socket.IO] Failed to publish to Redis:', err.message);
  });
}

let redisPublisher: Redis | null = null;
