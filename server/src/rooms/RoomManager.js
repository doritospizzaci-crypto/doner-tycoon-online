import crypto from 'node:crypto';
import {
  MAX_PLAYERS, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, PLAYER_COLORS, PLAYER_RADIUS,
} from '../../../shared/constants.js';
import { SPAWN_POINTS, TABLES, CASHIER_WAIT } from '../../../shared/layout.js';
import {
  START_STOCK, MAX_STOCK, MAX_ACTIVE_ORDERS, MAX_CUSTOMERS,
  CUSTOMER_SPAWN_INTERVAL, randomRecipe, canFulfill, consumeNeeds,
  STATION_ACTIONS, HAND_SLOTS, handsCount, emptyHands,
  EAT_TIME, CUSTOMER_COLORS, CUSTOMER_NAMES,
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

    this.money = 500;
    this.served = 0;
    this.failed = 0;
    this.reputation = 70;
    this.stock = { ...START_STOCK };
    this.orders = [];
    this.customers = [];
    this.spawnAcc = 3;
    this.day = 1;
    this.hands = new Map();
    // masa -> customerId veya null
    this.tableOccupant = { table1: null, table2: null, table3: null };
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

  freeTable() {
    for (const t of TABLES) {
      if (!this.tableOccupant[t.id]) return t;
    }
    return null;
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
        tableId: o.tableId,
        customerId: o.customerId,
        status: o.status, // waiting_food | ready_pay
      })),
      customers: this.customers.map((c) => ({
        id: c.id,
        name: c.name,
        color: c.color,
        state: c.state,
        x: Math.round(c.x * 100) / 100,
        z: Math.round(c.z * 100) / 100,
        r: Math.round(c.r * 100) / 100,
        tableId: c.tableId,
        orderId: c.orderId,
        patience: Math.max(0, Math.round(c.patience || 0)),
        eatLeft: c.eatLeft != null ? Math.max(0, Math.round(c.eatLeft)) : null,
        hasFood: !!c.hasFood,
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
    // spawn
    this.spawnAcc -= dt;
    if (this.spawnAcc <= 0 && this.customers.length < MAX_CUSTOMERS) {
      const table = this.freeTable();
      if (table) {
        this.spawnCustomer(table);
        const jitter = 0.7 + Math.random() * 0.6;
        this.spawnAcc = CUSTOMER_SPAWN_INTERVAL * jitter;
        if (this.reputation > 80) this.spawnAcc *= 0.85;
        if (this.reputation < 40) this.spawnAcc *= 1.25;
      } else {
        this.spawnAcc = 2;
      }
    }

    // sipariş sabır (sadece yemek bekleyenler)
    for (const o of [...this.orders]) {
      if (o.status !== 'waiting_food') continue;
      o.patience -= dt;
      if (o.patience <= 0) this.failOrder(o.id, 'patience');
    }

    // müşteri hareket + durum
    for (const c of this.customers) {
      if (c.state === 'enter' || c.state === 'to_pay' || c.state === 'leave') {
        const dx = c.targetX - c.x;
        const dz = c.targetZ - c.z;
        const dist = Math.hypot(dx, dz);
        const speed = c.state === 'leave' ? 2.6 : 2.3;
        if (dist < 0.12) {
          c.x = c.targetX;
          c.z = c.targetZ;
          if (c.state === 'enter') {
            c.state = 'seated';
            c.r = c.face || Math.PI;
            c.patience = 0;
          } else if (c.state === 'to_pay') {
            c.state = 'paying';
            c.r = -Math.PI / 2; // kasaya bak
          } else if (c.state === 'leave') {
            c.dead = true;
          }
        } else {
          c.x += (dx / dist) * speed * dt;
          c.z += (dz / dist) * speed * dt;
          c.r = Math.atan2(dx, dz);
        }
      } else if (c.state === 'eating') {
        c.eatLeft -= dt;
        if (c.eatLeft <= 0) {
          // masayı boşalt, kasaya yürü
          if (c.tableId) this.tableOccupant[c.tableId] = null;
          c.hasFood = false;
          c.state = 'to_pay';
          c.targetX = CASHIER_WAIT.x + (Math.random() - 0.5) * 0.6;
          c.targetZ = CASHIER_WAIT.z + (Math.random() - 0.5) * 0.4;
          // siparişi ödeme bekliyor yap
          const o = this.orders.find((x) => x.id === c.orderId);
          if (o) o.status = 'ready_pay';
        }
      } else if (c.state === 'ordered') {
        const o = this.orders.find((x) => x.id === c.orderId);
        if (o) c.patience = o.patience;
      }
    }
    this.customers = this.customers.filter((c) => !c.dead);
    this.gameDirty = true;
  }

  spawnCustomer(table) {
    const name = CUSTOMER_NAMES[Math.floor(Math.random() * CUSTOMER_NAMES.length)];
    const color = CUSTOMER_COLORS[Math.floor(Math.random() * CUSTOMER_COLORS.length)];
    const id = 'c' + (custSeq++);
    this.tableOccupant[table.id] = id;
    this.customers.push({
      id,
      name,
      color,
      state: 'enter',
      x: 0,
      z: 8.3,
      r: Math.PI,
      targetX: table.seatX,
      targetZ: table.seatZ,
      face: table.face,
      tableId: table.id,
      orderId: null,
      patience: 0,
      eatLeft: null,
      hasFood: false,
    });
  }

  // Masada sipariş al
  takeOrder(playerId, tableId) {
    const cust = this.customers.find((c) => c.tableId === tableId && c.state === 'seated');
    if (!cust) return { ok: false, message: 'Bu masada sipariş bekleyen müşteri yok.' };
    if (this.orders.length >= MAX_ACTIVE_ORDERS) {
      return { ok: false, message: 'Çok fazla açık sipariş var.' };
    }
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
      customerId: cust.id,
      tableId,
      status: 'waiting_food',
    };
    this.orders.push(order);
    cust.state = 'ordered';
    cust.orderId = id;
    cust.patience = patience;
    this.gameDirty = true;
    return { ok: true, kind: 'take_order', label: order.label, customer: cust.name, tableId };
  }

  // Masaya yemek koy
  deliverFood(playerId, tableId) {
    const cust = this.customers.find((c) => c.tableId === tableId && c.state === 'ordered');
    if (!cust) return { ok: false, message: 'Bu masada yemek bekleyen müşteri yok.' };
    const order = this.orders.find((o) => o.id === cust.orderId && o.status === 'waiting_food');
    if (!order) return { ok: false, message: 'Sipariş bulunamadı.' };

    const hands = this.getHands(playerId);
    const combined = { ...this.stock };
    for (const h of hands) combined[h.type] = (combined[h.type] || 0) + (h.qty || 1);
    if (!canFulfill(combined, order.needs)) {
      return { ok: false, message: 'Sipariş için malzeme eksik (el + stok).' };
    }

    // ellerden sonra stoktan tüket
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
    this.stock = consumeNeeds(this.stock, remaining);
    this.setHands(playerId, newHands);

    cust.state = 'eating';
    cust.hasFood = true;
    cust.eatLeft = EAT_TIME * (0.85 + Math.random() * 0.3);
    cust.patience = 0;
    this.gameDirty = true;
    return {
      ok: true,
      kind: 'deliver',
      label: order.label,
      customer: cust.name,
      tableId,
    };
  }

  // Kasada ödeme al
  takePayment(playerId) {
    const paying = this.customers.find((c) => c.state === 'paying');
    if (!paying) return { ok: false, message: 'Kasada ödeme bekleyen müşteri yok.' };
    const order = this.orders.find((o) => o.id === paying.orderId);
    if (!order) {
      // sipariş yoksa yine de gönder
      paying.state = 'leave';
      paying.targetX = 0;
      paying.targetZ = 9.2;
      this.gameDirty = true;
      return { ok: false, message: 'Sipariş kaydı bulunamadı.' };
    }

    // yemek teslim süresi ne kadar iyiydi (patience kalanı)
    const ratio = Math.max(0, Math.min(1, order.patience / order.maxPatience));
    const tip = ratio > 0.5 ? Math.round(order.price * 0.12) : (ratio > 0.25 ? Math.round(order.price * 0.05) : 0);
    const earned = order.price + tip;
    this.money += earned;
    this.served++;
    this.reputation = Math.min(100, this.reputation + (ratio > 0.5 ? 3 : 1.5));

    // siparişi sil
    this.orders = this.orders.filter((o) => o.id !== order.id);

    paying.state = 'leave';
    paying.targetX = 0;
    paying.targetZ = 9.2;
    paying.orderId = null;
    this.gameDirty = true;
    return {
      ok: true,
      kind: 'payment',
      label: order.label,
      earned,
      tip,
      customer: paying.name,
    };
  }

  failOrder(orderId, reason) {
    const idx = this.orders.findIndex((o) => o.id === orderId);
    if (idx < 0) return null;
    const order = this.orders[idx];
    this.orders.splice(idx, 1);
    this.failed++;
    this.reputation = Math.max(0, this.reputation - 7);
    const cust = this.customers.find((c) => c.id === order.customerId);
    if (cust) {
      if (cust.tableId) this.tableOccupant[cust.tableId] = null;
      cust.state = 'leave';
      cust.targetX = 0;
      cust.targetZ = 9.2;
      cust.orderId = null;
      cust.hasFood = false;
    }
    this.gameDirty = true;
    return { order, reason };
  }

  doStation(playerId, stationId) {
    const action = STATION_ACTIONS[stationId];
    if (!action) return { ok: false, message: 'Bilinmeyen istasyon' };
    const hands = this.getHands(playerId);
    const count = handsCount(hands);

    // Masa etkileşimi
    if (stationId === 'table1' || stationId === 'table2' || stationId === 'table3') {
      const custSeated = this.customers.find((c) => c.tableId === stationId && c.state === 'seated');
      if (custSeated) return this.takeOrder(playerId, stationId);
      const custOrdered = this.customers.find((c) => c.tableId === stationId && c.state === 'ordered');
      if (custOrdered) return this.deliverFood(playerId, stationId);
      const any = this.customers.find((c) => c.tableId === stationId);
      if (any?.state === 'eating') return { ok: false, message: 'Müşteri yemek yiyor…' };
      return { ok: false, message: 'Bu masa boş veya hazır değil.' };
    }

    if (stationId === 'storage_l' || stationId === 'storage_r') {
      return { ok: true, kind: 'storage', stock: { ...this.stock } };
    }

    if (stationId === 'orderboard') {
      return { ok: true, kind: 'orders', orders: this.orders };
    }

    if (stationId === 'cashier') {
      return this.takePayment(playerId);
    }

    if (stationId === 'grill') {
      if (this.stock.spit >= MAX_STOCK.spit) {
        return { ok: false, message: 'Izgara dolu, önce kes!' };
      }
      this.stock.spit = Math.min(MAX_STOCK.spit, this.stock.spit + 1);
      this.gameDirty = true;
      return { ok: true, kind: 'cook', spit: this.stock.spit };
    }

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
      if (this.stock.meat >= MAX_STOCK.meat) {
        this.stock.spit += 1;
        return { ok: false, message: 'Hem elin hem stok dolu!' };
      }
      this.stock.meat += 1;
      this.gameDirty = true;
      return { ok: true, kind: 'stock', item: 'meat', stock: this.stock.meat };
    }

    const produce = action.produce;
    if (produce) {
      if (count >= HAND_SLOTS) {
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
