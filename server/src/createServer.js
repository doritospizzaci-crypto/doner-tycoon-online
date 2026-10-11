import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { RoomManager } from './rooms/RoomManager.js';
import { RateLimiter } from './middleware/rateLimit.js';
import { attachGame } from './socket/gameSocket.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function createGameServer({ port = 0, corsOrigin = '', publicServerUrl = '' } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'same-origin');
    next();
  });

  app.get('/healthz', (_req, res) => res.json({ ok: true, uptime: process.uptime() }));
  // Istemci canli backend adresini buradan alir (bos = ayni adres).
  app.get('/config.js', (_req, res) => {
    res.type('application/javascript').set('Cache-Control', 'no-store')
      .send(`window.GAME_CONFIG=${JSON.stringify({ serverUrl: publicServerUrl })};`);
  });

  app.use('/vendor/three/build', express.static(path.join(ROOT, 'node_modules/three/build'), { maxAge: '7d' }));
  app.use('/shared', express.static(path.join(ROOT, 'shared')));
  app.use(express.static(path.join(ROOT, 'client')));

  const httpServer = http.createServer(app);
  const origins = corsOrigin.split(',').map((s) => s.trim()).filter(Boolean);
  const io = new Server(httpServer, {
    cors: origins.length ? { origin: origins } : undefined,
    maxHttpBufferSize: 1e4,
    pingInterval: 10000,
    pingTimeout: 10000,
  });

  const rooms = new RoomManager();
  const limiter = new RateLimiter();
  const stopTick = attachGame(io, { rooms, limiter });

  return {
    app, httpServer, io, rooms,
    start: () => new Promise((resolve) => {
      httpServer.listen(port, () => resolve(httpServer.address().port));
    }),
    stop: () => new Promise((resolve) => {
      stopTick();
      limiter.close();
      for (const room of rooms.rooms.values()) for (const p of room.players.values()) clearTimeout(p.graceTimer);
      io.close(() => resolve());
    }),
  };
}
