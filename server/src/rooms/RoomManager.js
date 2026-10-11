import crypto from 'node:crypto';
import {
  MAX_PLAYERS, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, PLAYER_COLORS, PLAYER_RADIUS,
} from '../../../shared/constants.js';
import { SPAWN_POINTS } from '../../../shared/layout.js';

// Gizli token'dan herkese acik kimlik turetilir. Token asla baskasina gonderilmez.
export const publicId = (token) => crypto.createHash('sha256').update(token).digest('hex').slice(0, 12);

export class Room {
  constructor(code) {
    this.code = code;
    this.players = new Map();
    this.hostId = null;
    this.createdAt = Date.now();
    this.dirty = false;
  }

  get connectedCount() {
    let n = 0;
    for (const p of this.players.values()) if (p.connected) n++;
    return n;
  }

  get isFull() { return this.players.size >= MAX_PLAYERS; }

  pickColor() {
    const used = new Set([...this.players.values()].map((p) => p.color));
    return PLAYER_COLORS.find((c) => !used.has(c)) ?? PLAYER_COLORS[0];
  }

  pickSpawn() {
    const taken = [...this.players.values()];
    for (const s of SPAWN_POINTS) {
      if (!taken.some((p) => Math.hypot(p.x - s.x, p.z - s.z) < PLAYER_RADIUS * 2.2)) return s;
    }
    return SPAWN_POINTS[0];
  }

  addPlayer({ id, name, socketId }) {
    const spawn = this.pickSpawn();
    const p = {
      id, name, socketId, connected: true, role: null,
      color: this.pickColor(), x: spawn.x, z: spawn.z, r: 0,
      joinedAt: Date.now(), lastMoveAt: Date.now(), graceTimer: null,
    };
    this.players.set(id, p);
    if (!this.hostId) this.hostId = id;
    return p;
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return { removed: false };
    if (p.graceTimer) clearTimeout(p.graceTimer);
    this.players.delete(id);
    let newHost = null;
    if (this.hostId === id) {
      const rest = [...this.players.values()].sort((a, b) => a.joinedAt - b.joinedAt);
      const next = rest.find((q) => q.connected) ?? rest[0] ?? null;
      this.hostId = next ? next.id : null;
      newHost = next;
    }
    return { removed: true, player: p, newHost, empty: this.players.size === 0 };
  }

  publicPlayer(p) {
    return { id: p.id, name: p.name, color: p.color, role: p.role, connected: p.connected, x: p.x, z: p.z, r: p.r };
  }

  snapshot() {
    return {
      code: this.code,
      hostId: this.hostId,
      maxPlayers: MAX_PLAYERS,
      players: [...this.players.values()].map((p) => this.publicPlayer(p)),
    };
  }
}

export class RoomManager {
  constructor() { this.rooms = new Map(); }

  generateCode() {
    for (let i = 0; i < 50; i++) {
      let code = '';
      for (let j = 0; j < ROOM_CODE_LENGTH; j++) code += ROOM_CODE_ALPHABET[crypto.randomInt(ROOM_CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
    throw new Error('Oda kodu uretilemedi');
  }

  create() {
    const room = new Room(this.generateCode());
    this.rooms.set(room.code, room);
    return room;
  }

  get(code) { return this.rooms.get(code); }
  delete(code) { this.rooms.delete(code); }
}
