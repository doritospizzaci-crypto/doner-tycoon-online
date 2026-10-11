import { C2S, S2C } from '../../../shared/events.js';
import {
  PLAYER_SPEED, PLAYER_RADIUS, SERVER_TICK_HZ, RECONNECT_GRACE_MS, INTERACT_TOLERANCE,
} from '../../../shared/constants.js';
import { STATIONS } from '../../../shared/layout.js';
import { resolveCollisions } from '../../../shared/collision.js';
import { publicId } from '../rooms/RoomManager.js';
import { LIMITS } from '../middleware/rateLimit.js';
import {
  isObject, validName, validChat, validToken, validRole, validRoomCode, validMove,
} from '../validation/validate.js';

const STATION_BY_ID = new Map(STATIONS.map((s) => [s.id, s]));
const r2 = (n) => Math.round(n * 100) / 100;

export function attachGame(io, { rooms, limiter }) {
  const reply = (ack, payload) => { if (typeof ack === 'function') ack(payload); };
  const ipOf = (socket) => socket.handshake.address || 'unknown';
  const fail = (ack, code, message) => reply(ack, { ok: false, error: code, message });

  const ctxOf = (socket) => {
    const { roomCode, playerId } = socket.data;
    if (!roomCode || !playerId) return null;
    const room = rooms.get(roomCode);
    const p = room?.players.get(playerId);
    if (!room || !p || p.socketId !== socket.id) return null;
    return { room, p };
  };

  const broadcastRoom = (room) => io.to(room.code).emit(S2C.ROOM, room.snapshot());

  function removeAndNotify(room, id, type) {
    const res = room.removePlayer(id);
    if (!res.removed) return;
    if (res.empty) { rooms.delete(room.code); return; }
    io.to(room.code).emit(S2C.NOTICE, { type, name: res.player.name });
    if (res.newHost) io.to(room.code).emit(S2C.NOTICE, { type: 'host', name: res.newHost.name });
    broadcastRoom(room);
  }

  // explicit=true: oyuncu kendi cikti. false: baglanti koptu, yeniden baglanma suresi taninir.
  function leaveCurrent(socket, explicit) {
    const ctx = ctxOf(socket);
    const code = socket.data.roomCode;
    socket.data.roomCode = null;
    socket.data.playerId = null;
    if (code) socket.leave(code);
    if (!ctx) return;
    const { room, p } = ctx;
    if (explicit) {
      removeAndNotify(room, p.id, 'leave');
    } else {
      p.connected = false;
      io.to(room.code).emit(S2C.NOTICE, { type: 'disconnect', name: p.name });
      broadcastRoom(room);
      p.graceTimer = setTimeout(() => removeAndNotify(room, p.id, 'timeout'), RECONNECT_GRACE_MS);
      p.graceTimer.unref?.();
    }
  }

  function enter(socket, kind, payload, ack) {
    if (!limiter.allow(`${socket.id}:room`, ...LIMITS.room) || !limiter.allow(`${ipOf(socket)}:roomIp`, ...LIMITS.roomIp)) {
      return fail(ack, 'RATE_LIMIT', 'Çok fazla deneme. Biraz bekle.');
    }
    if (!isObject(payload) || !validToken(payload.token)) return fail(ack, 'BAD_REQUEST', 'Geçersiz istek.');
    const id = publicId(payload.token);
    const name = validName(payload.name);

    let room;
    if (kind === 'create') {
      if (!name) return fail(ack, 'BAD_NAME', 'Geçerli bir isim gir.');
      leaveCurrent(socket, true);
      room = rooms.create();
    } else {
      const code = validRoomCode(payload.code);
      if (!code) return fail(ack, 'BAD_CODE', 'Oda kodu geçersiz.');
      room = rooms.get(code);
      if (!room) return fail(ack, 'ROOM_NOT_FOUND', 'Bu kodla oda bulunamadı.');
      if (socket.data.roomCode && socket.data.roomCode !== code) leaveCurrent(socket, true);
    }

    let p = room.players.get(id);
    let notice = null;
    if (kind === 'create') {
      p = room.addPlayer({ id, name, socketId: socket.id });
    } else if (p) {
      // Yeniden baglanma: ayni gizli token.
      if (p.socketId && p.socketId !== socket.id) {
        const old = io.sockets.sockets.get(p.socketId);
        if (old) {
          old.data.roomCode = null;
          old.data.playerId = null;
          old.leave(room.code);
          old.emit(S2C.NOTICE, { type: 'replaced' });
        }
      }
      if (p.graceTimer) { clearTimeout(p.graceTimer); p.graceTimer = null; }
      p.socketId = socket.id;
      p.connected = true;
      p.lastMoveAt = Date.now();
      notice = { type: 'reconnect', name: p.name };
    } else {
      if (!name) return fail(ack, 'BAD_NAME', 'Geçerli bir isim gir.');
      if (room.isFull) return fail(ack, 'ROOM_FULL', 'Oda dolu (en fazla 6 oyuncu).');
      p = room.addPlayer({ id, name, socketId: socket.id });
      notice = { type: 'join', name: p.name };
    }
    p.budget = 1;

    socket.data.roomCode = room.code;
    socket.data.playerId = id;
    socket.join(room.code);
    if (notice) socket.to(room.code).emit(S2C.NOTICE, notice);
    reply(ack, { ok: true, you: id, room: room.snapshot() });
    broadcastRoom(room);
  }

  io.on('connection', (socket) => {
    socket.data.roomCode = null;
    socket.data.playerId = null;

    socket.on(C2S.CREATE, (payload, ack) => enter(socket, 'create', payload, ack));
    socket.on(C2S.JOIN, (payload, ack) => enter(socket, 'join', payload, ack));
    socket.on(C2S.LEAVE, (_p, ack) => { leaveCurrent(socket, true); reply(ack, { ok: true }); });

    socket.on(C2S.MOVE, (msg) => {
      const ctx = ctxOf(socket);
      if (!ctx || !limiter.allow(`${socket.id}:move`, ...LIMITS.move)) return;
      const m = validMove(msg);
      if (!m) return;
      const { room, p } = ctx;
      const now = Date.now();
      const dt = Math.min(Math.max((now - p.lastMoveAt) / 1000, 0), 1);
      p.lastMoveAt = now;
      // Hiz butcesi: gecen sureye gore izin verilen mesafe birikir (en fazla 1.5 birim).
      const budget = Math.min(1.5, p.budget + PLAYER_SPEED * 1.15 * dt);
      const dist = Math.hypot(m.x - p.x, m.z - p.z);
      // Duvar/mobilya icine girmeyi de reddet (istemci ayni fonksiyonu kullanir).
      const fixed = resolveCollisions(m.x, m.z, PLAYER_RADIUS);
      const inWall = Math.hypot(fixed.x - m.x, fixed.z - m.z) > 0.1;
      if (dist > budget + 0.05 || inWall) {
        p.budget = budget;
        socket.emit(S2C.CORRECT, { x: p.x, z: p.z });
        return;
      }
      p.budget = budget - dist;
      p.x = m.x; p.z = m.z; p.r = m.r;
      room.dirty = true;
    });

    socket.on(C2S.INTERACT, (msg) => {
      const ctx = ctxOf(socket);
      if (!ctx || !limiter.allow(`${socket.id}:interact`, ...LIMITS.interact)) return;
      if (!isObject(msg) || typeof msg.station !== 'string') return;
      const st = STATION_BY_ID.get(msg.station);
      if (!st) return;
      const { room, p } = ctx;
      if (Math.hypot(p.x - st.x, p.z - st.z) > st.r + INTERACT_TOLERANCE) return;
      socket.to(room.code).emit(S2C.ACTION, { id: p.id, station: st.id });
    });

    socket.on(C2S.ROLE, (msg) => {
      const ctx = ctxOf(socket);
      if (!ctx || !limiter.allow(`${socket.id}:role`, ...LIMITS.role)) return;
      const role = isObject(msg) ? msg.role : undefined;
      if (role !== null && !validRole(role)) return;
      ctx.p.role = role;
      broadcastRoom(ctx.room);
    });

    socket.on(C2S.CHAT, (msg) => {
      const ctx = ctxOf(socket);
      if (!ctx || !limiter.allow(`${socket.id}:chat`, ...LIMITS.chat)) return;
      const text = validChat(isObject(msg) ? msg.text : undefined);
      if (!text) return;
      io.to(ctx.room.code).emit(S2C.CHAT, { id: ctx.p.id, name: ctx.p.name, text, t: Date.now() });
    });

    socket.on('disconnect', () => {
      leaveCurrent(socket, false);
      limiter.drop(`${socket.id}:`);
    });
  });

  // Hareketleri odalara toplu yayinla (sadece degisen odalar).
  const tick = setInterval(() => {
    for (const room of rooms.rooms.values()) {
      if (!room.dirty) continue;
      room.dirty = false;
      const list = [];
      for (const p of room.players.values()) list.push({ id: p.id, x: r2(p.x), z: r2(p.z), r: r2(p.r) });
      io.to(room.code).volatile.emit(S2C.PLAYERS, list);
    }
  }, 1000 / SERVER_TICK_HZ);
  tick.unref?.();
  return () => clearInterval(tick);
}
