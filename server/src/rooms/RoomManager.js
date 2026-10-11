import crypto from 'node:crypto';
import {
  MAX_PLAYERS, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, PLAYER_COLORS, PLAYER_RADIUS,
} from '../../../shared/constants.js';
import { SPAWN_POINTS } from '../../../shared/layout.js';
import {
  START_STOCK, MAX_STOCK, MAX_ACTIVE_ORDERS, MAX_CUSTOMERS,
  CUSTOMER_SPAWN_INTERVAL, randomRecipe, canFulfill, consumeNeeds,
  STATION_ACTIONS, HAND_SLOTS, handsCount, emptyHands,
} from '../../../shared/gameLogic.js';

export const publicId = (token) => crypto.createHash('sha256').update(token).digest('hex').slice(0, 12);

let orderSeq = 1;
let custSeq = 1;

export class Room {
  constructor(code) {
    this.code = code;
    this.players = new Map();
    this.hostId = null;
    this.createdAt = Date.now();
    this.dirty = false;
    this.gameDirty = false;

    // ---- oyun durumu ----
    this.money = 500;
    this.served = 0;
    this.failed = 0;
    this.reputation = 70; // 0-100
    this.stock = { ...START_STOCK };
    this.orders = []; // { id, recipeId, label, needs, price, patience, maxPatience, createdAt, customerId }
    this.customers = []; // { id, name, state, x, z, targetX, targetZ, orderId, patience }
    this.spawnAcc = 2; // ilk müşteri biraz erken gelsin
    this.day = 1;
    this.hands = new Map(); // playerId -> [{type, qty}]
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
      budget: 1,
    };
    this.players.set(id, p);
    this.hands.set(id, emptyHands());
    if (!this.hostId) this.hostId = id;
    this.gameDirty = true;
    return p;
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return { removed: false };
    if (p.graceTimer) clearTimeout(p.graceTimer);
    this.players.delete(id);
    this.hands.delete(id);
    let newHost = null;
    if (this.hostId === id) {
      const rest = [...this.players.values()].sort((a, b) => a.joinedAt - b.joinedAt);
      const next = rest.find((q) => q.connected) ?? rest[0] ?? null;
      this.hostId = next ? next.id : null;
      newHost = next;
    }
    this.gameDirty = true;
    return { removed: true, player: p, newHost, empty: this.players.size === 0 };
  }

  publicPlayer(p) {
    return {
      id: p.id, name: p.name, color: p.color, role: p.role,
      connected: p.connected, x: p.x, z: p.z, r: p.r,
      hands: this.hands.get(p.id) || [],
    };
  }

  snapshot() {
    return {
      code: this.code,
      hostId: this.hostId,
      maxPlayers: MAX_PLAYERS,
      players: [...this.players.values()].map((p) => this.publicPlayer(p)),
    };
  }

  gameSnapshot() {
    return {
      money: this.money,
      served: this.served,
      failed: this.failed,
      reputation: Math.round(this.reputation),
      stock: { ...this.stock },
      orders: this.orders.map((o) => ({
        id: o.id,
        recipeId: o.recipeId,
        label: o.label,
        needs: { ...o.needs },
        price: o.price,
        patience: Math.max(0, Math.round(o.patience)),
        maxPatience: o.maxPatience,
      })),
      customers: this.customers.map((c) => ({
        id: c.id, name: c.name, state: c.state,
        x: Math.round(c.x * 100) / 100,
        z: Math.round(c.z * 100) / 100,
        orderId: c.orderId,
        patience: Math.max(0, Math.round(c.patience)),
      })),
      day: this.day,
    };
  }

  getHands(pid) {
    return this.hands.get(pid) || emptyHands();
  }

  setHands(pid, arr) {
    this.hands.set(pid, arr);
    this.gameDirty = true;
  }

  // ---- oyun mantığı ----
  tick(dt) {
    // müşteri spawn
    this.spawnAcc -= dt;
    if (this.spawnAcc <= 0 && this.customers.length < MAX_CUSTOMERS && this.orders.length < MAX_ACTIVE_ORDERS) {
      this.spawnCustomer();
      const jitter = 0.6 + Math.random() * 0.8;
      this.spawnAcc = CUSTOMER_SPAWN_INTERVAL * jitter * (1 + this.customers.length * 0.15);
      // itibar yüksekse biraz daha sık
      if (this.reputation > 80) this.spawnAcc *= 0.85;
      if (this.reputation < 40) this.spawnAcc *= 1.3;
    }

    // sipariş / müşteri sabır
    for (const o of this.orders) {
      o.patience -= dt;
    }
    const failedOrders = this.orders.filter((o) => o.patience <= 0);
    for (const o of failedOrders) {
      this.failOrder(o.id, 'patience');
    }

    // müşteri hareket (basit)
    for (const c of this.customers) {
      if (c.state === 'enter' || c.state === 'leave') {
        const dx = c.targetX - c.x;
        const dz = c.targetZ - c.z;
        const dist = Math.hypot(dx, dz);
        const speed = c.state === 'leave' ? 2.8 : 2.2;
        if (dist < 0.15) {
          c.x = c.targetX; c.z = c.targetZ;
          if (c.state === 'enter') {
            c.state = 'wait';
            this.createOrderFor(c);
          } else if (c.state === 'leave') {
            c.dead = true;
          }
        } else {
          c.x += (dx / dist) * speed * dt;
          c.z += (dz / dist) * speed * dt;
        }
      }
      if (c.state === 'wait' && c.orderId) {
        const o = this.orders.find((x) => x.id === c.orderId);
        if (o) c.patience = o.patience;
      }
    }
    this.customers = this.customers.filter((c) => !c.dead);
    this.gameDirty = true;
  }

  spawnCustomer() {
    const names = [
      'Ahmet', 'Ayşe', 'Mehmet', 'Fatma', 'Can', 'Zeynep', 'Emre', 'Elif',
      'Burak', 'Selin', 'Deniz', 'Cem', 'Nur', 'Kaan', 'İrem', 'Yusuf',
      'Merve', 'Oğuz', 'Seda', 'Hakan',
    ];
    const name = names[Math.floor(Math.random() * names.length)];
    const id = 'c' + (custSeq++);
    // kapıdan (0, 8) gir, kasa / bekleme alanına git
    const slot = this.customers.length % 4;
    const targetX = 6.5 + (slot % 2) * 1.2;
    const targetZ = 2.8 + Math.floor(slot / 2) * 1.1;
    this.customers.push({
      id, name,
      state: 'enter',
      x: 0, z: 8.2,
      targetX, targetZ,
      orderId: null,
      patience: 50,
    });
  }

  createOrderFor(customer) {
    if (this.orders.length >= MAX_ACTIVE_ORDERS) return;
    const recipe = randomRecipe();
    const id = 'o' + (orderSeq++);
    const patience = recipe.time * (0.9 + Math.random() * 0.25);
    const order = {
      id,
      recipeId: recipe.id,
      label: recipe.label,
      needs: { ...recipe.needs },
      price: recipe.price,
      patience,
      maxPatience: patience,
      createdAt: Date.now(),
      customerId: customer.id,
    };
    this.orders.push(order);
    customer.orderId = id;
    customer.patience = patience;
  }

  failOrder(orderId, reason) {
    const idx = this.orders.findIndex((o) => o.id === orderId);
    if (idx < 0) return null;
    const order = this.orders[idx];
    this.orders.splice(idx, 1);
    this.failed++;
    this.reputation = Math.max(0, this.reputation - 6);
    const cust = this.customers.find((c) => c.id === order.customerId);
    if (cust) {
      cust.state = 'leave';
      cust.targetX = 0;
      cust.targetZ = 9;
      cust.orderId = null;
    }
    this.gameDirty = true;
    return { order, reason };
  }

  serveOrder(playerId) {
    const hands = this.getHands(playerId);
    // En eski siparişi elindeki ürünlerle karşılamaya çalış
    for (let i = 0; i < this.orders.length; i++) {
      const order = this.orders[i];
      // Önce stoktan, yoksa ellerden dene
      const combined = { ...this.stock };
      for (const h of hands) {
        combined[h.type] = (combined[h.type] || 0) + (h.qty || 1);
      }
      if (!canFulfill(combined, order.needs)) continue;

      // Önce ellerden tüket, kalanı stoktan
      let remaining = { ...order.needs };
      const newHands = [];
      for (const h of hands) {
        const need = remaining[h.type] || 0;
        if (need > 0) {
          const take = Math.min(need, h.qty || 1);
          remaining[h.type] = need - take;
          const left = (h.qty || 1) - take;
          if (left > 0) newHands.push({ type: h.type, qty: left });
        } else {
          newHands.push(h);
        }
      }
      // kalanı stoktan düş
      this.stock = consumeNeeds(this.stock, remaining);
      this.setHands(playerId, newHands);

      // para + itibar
      const patienceRatio = order.patience / order.maxPatience;
      const tip = patienceRatio > 0.6 ? Math.round(order.price * 0.12) : 0;
      const earned = order.price + tip;
      this.money += earned;
      this.served++;
      this.reputation = Math.min(100, this.reputation + (patienceRatio > 0.5 ? 3 : 1));

      this.orders.splice(i, 1);
      const cust = this.customers.find((c) => c.id === order.customerId);
      if (cust) {
        cust.state = 'leave';
        cust.targetX = 0;
        cust.targetZ = 9;
        cust.orderId = null;
      }
      this.gameDirty = true;
      return { order, earned, tip, patienceRatio };
    }
    return null;
  }

  // İstasyon etkileşimi sonucu
  doStation(playerId, stationId) {
    const action = STATION_ACTIONS[stationId];
    if (!action) return { ok: false, message: 'Bilinmeyen istasyon' };
    const hands = this.getHands(playerId);
    const count = handsCount(hands);

    // Depo: stok bilgisini göster (üretim yok)
    if (stationId === 'storage_l' || stationId === 'storage_r') {
      return { ok: true, kind: 'storage', stock: { ...this.stock } };
    }

    // Sipariş panosu
    if (stationId === 'orderboard') {
      return { ok: true, kind: 'orders', orders: this.orders };
    }

    // Kasa: teslim et
    if (stationId === 'cashier') {
      const result = this.serveOrder(playerId);
      if (!result) {
        return { ok: false, message: 'Teslim edilecek uygun sipariş yok veya malzeme yetersiz.' };
      }
      return {
        ok: true,
        kind: 'serve',
        label: result.order.label,
        earned: result.earned,
        tip: result.tip,
      };
    }

    // Grill: spit doldur (pişir)
    if (stationId === 'grill') {
      if (this.stock.spit >= MAX_STOCK.spit) {
        return { ok: false, message: 'Izgara dolu, önce kes!' };
      }
      this.stock.spit = Math.min(MAX_STOCK.spit, this.stock.spit + 1);
      this.gameDirty = true;
      return { ok: true, kind: 'cook', spit: this.stock.spit };
    }

    // Kesme: spit → meat (ele veya stoka)
    if (stationId === 'cut') {
      if (this.stock.spit < 1) {
        return { ok: false, message: 'Kesilecek et yok. Önce ızgarada pişir.' };
      }
      this.stock.spit -= 1;
      if (count < HAND_SLOTS) {
        hands.push({ type: 'meat', qty: 1 });
        this.setHands(playerId, hands);
        return { ok: true, kind: 'pickup', item: 'meat', hands };
      }
      // el doluysa stoka
      if (this.stock.meat >= MAX_STOCK.meat) {
        this.stock.spit += 1; // geri koy
        return { ok: false, message: 'Hem elin hem stok dolu!' };
      }
      this.stock.meat += 1;
      this.gameDirty = true;
      return { ok: true, kind: 'stock', item: 'meat', stock: this.stock.meat };
    }

    // Üretim istasyonları (bread, veg, fryer, drinks)
    const produce = action.produce;
    if (produce) {
      if (count >= HAND_SLOTS) {
        // stoka dene
        if ((this.stock[produce] || 0) >= MAX_STOCK[produce]) {
          return { ok: false, message: 'Elin ve stok dolu!' };
        }
        this.stock[produce] = (this.stock[produce] || 0) + 1;
        this.gameDirty = true;
        return { ok: true, kind: 'stock', item: produce, stock: this.stock[produce] };
      }
      hands.push({ type: produce, qty: 1 });
      this.setHands(playerId, hands);
      this.gameDirty = true;
      return { ok: true, kind: 'pickup', item: produce, hands };
    }

    return { ok: false, message: 'Burada yapılabilecek bir şey yok.' };
  }

  dropHand(playerId) {
    const hands = this.getHands(playerId);
    if (!hands.length) return { ok: false, message: 'Elinde bir şey yok.' };
    hands.pop();
    this.setHands(playerId, hands);
    return { ok: true, hands };
  }

  // Elle stoka koy (storage yakınında)
  storeHand(playerId) {
    const hands = this.getHands(playerId);
    if (!hands.length) return { ok: false, message: 'Elinde bir şey yok.' };
    const last = hands[hands.length - 1];
    const t = last.type;
    if ((this.stock[t] || 0) >= MAX_STOCK[t]) {
      return { ok: false, message: 'Raf dolu.' };
    }
    this.stock[t] = (this.stock[t] || 0) + (last.qty || 1);
    hands.pop();
    this.setHands(playerId, hands);
    this.gameDirty = true;
    return { ok: true, item: t, stock: this.stock[t], hands };
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
