import { C2S, S2C } from '/shared/events.js';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Socket.IO istemcisi yüklenemedi: ' + src));
    document.head.appendChild(s);
  });
}

function makeToken() {
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Basit olay yayıcı + Socket.IO sarmalayıcı.
export class Network {
  constructor() {
    this.handlers = new Map();
    this.socket = null;
    this.status = 'connecting';
    this.roomCode = null;
    this.name = '';
    this.myId = null;
    // Gizli token sadece bu tarayıcıda durur; sunucu bundan herkese açık kimlik türetir.
    try {
      this.token = localStorage.getItem('dto_token') || makeToken();
      localStorage.setItem('dto_token', this.token);
    } catch { this.token = makeToken(); }
  }

  on(ev, fn) {
    if (!this.handlers.has(ev)) this.handlers.set(ev, []);
    this.handlers.get(ev).push(fn);
  }

  emit(ev, data) { for (const fn of this.handlers.get(ev) ?? []) fn(data); }

  setStatus(s) { this.status = s; this.emit('status', s); }

  async connect() {
    const base = (window.GAME_CONFIG && window.GAME_CONFIG.serverUrl) || '';
    await loadScript(base + '/socket.io/socket.io.js');
    this.socket = window.io(base || undefined, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 800,
      reconnectionDelayMax: 5000,
    });
    const s = this.socket;
    s.on('connect', () => {
      this.setStatus('connected');
      if (this.roomCode) this.rejoin();
    });
    s.on('disconnect', () => this.setStatus('reconnecting'));
    s.on('connect_error', () => this.setStatus(this.roomCode ? 'reconnecting' : 'error'));
    s.io.on('reconnect_attempt', () => this.setStatus('reconnecting'));

    s.on(S2C.ROOM, (room) => this.emit('room', room));
    s.on(S2C.NOTICE, (n) => {
      if (n.type === 'replaced') { this.roomCode = null; }
      this.emit('notice', n);
    });
    s.on(S2C.PLAYERS, (list) => this.emit('players', list));
    s.on(S2C.CORRECT, (p) => this.emit('correct', p));
    s.on(S2C.ACTION, (a) => this.emit('action', a));
    s.on(S2C.CHAT, (m) => this.emit('chat', m));
  }

  request(ev, payload, timeout = 8000) {
    return new Promise((resolve) => {
      if (!this.socket || !this.socket.connected) {
        resolve({ ok: false, error: 'OFFLINE', message: 'Sunucuya bağlı değilsin.' });
        return;
      }
      const timer = setTimeout(() => resolve({ ok: false, error: 'TIMEOUT', message: 'Sunucu yanıt vermedi.' }), timeout);
      this.socket.emit(ev, payload, (res) => { clearTimeout(timer); resolve(res); });
    });
  }

  async createRoom(name) {
    const res = await this.request(C2S.CREATE, { name, token: this.token });
    if (res.ok) { this.roomCode = res.room.code; this.name = name; this.myId = res.you; }
    return res;
  }

  async joinRoom(code, name) {
    const res = await this.request(C2S.JOIN, { code, name, token: this.token });
    if (res.ok) { this.roomCode = res.room.code; this.name = name; this.myId = res.you; }
    return res;
  }

  async rejoin() {
    const res = await this.request(C2S.JOIN, { code: this.roomCode, name: this.name, token: this.token });
    if (res.ok) { this.emit('rejoined', res); }
    else { this.roomCode = null; this.emit('rejoinFailed', res); }
  }

  async leaveRoom() {
    this.roomCode = null;
    this.myId = null;
    await this.request(C2S.LEAVE, {});
  }

  sendMove(x, z, r) { this.socket?.volatile.emit(C2S.MOVE, { x, z, r }); }
  sendInteract(station) { this.socket?.emit(C2S.INTERACT, { station }); }
  sendChat(text) { this.socket?.emit(C2S.CHAT, { text }); }
  sendRole(role) { this.socket?.emit(C2S.ROLE, { role }); }
}
