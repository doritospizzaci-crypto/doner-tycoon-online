import crypto from 'node:crypto';
import {
  MAX_PLAYERS, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, PLAYER_COLORS, PLAYER_RADIUS,
} from '../../../shared/constants.js';
import { SPAWN_POINTS, TABLES, CASHIER_QUEUE } from '../../../shared/layout.js';
import {
  START_STOCK, MAX_STOCK, MAX_ACTIVE_ORDERS, MAX_CUSTOMERS,
  CUSTOMER_SPAWN_INTERVAL, randomRecipe, canFulfill, consumeNeeds,
  STATION_ACTIONS, HAND_SLOTS, handsCount, emptyHands,
  EAT_TIME, CUSTOMER_COLORS, CUSTOMER_NAMES, AMBIENT_LINES,
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
    this.streak = 0;
    this.bestStreak = 0;
    this.stock = { ...START_STOCK };
    this.orders = [];
    this.customers = [];
    this.spawnAcc = 2;
    this.ambientAcc = 8;
    this.day = 1;
    this.hands = new Map();
    // tableId -> array of customerIds per seat index (length 4, null = empty)
    this.seats = {};
    for (const t of TABLES) this.seats[t.id] = [null, null, null, null];
    this.lastAmbient = null; // { text, customerId, t }
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

  // Boş sandalye bul (önce dolu masaları doldur — canlı görünüm)
  freeSeat() {
    // Önce kısmen dolu masalar
    for (const t of TABLES) {
      const arr = this.seats[t.id];
      const filled = arr.filter(Boolean).length;
      if (filled > 0 && filled < 4) {
        for (let i = 0; i < 4; i++) {
          if (!arr[i]) return { table: t, seat: t.seats[i], seatIndex: i };
        }
      }
    }
    // Sonra tamamen boş
    for (const t of TABLES) {
      const arr = this.seats[t.id];
      if (arr.every((x) => !x)) {
        return { table: t, seat: t.seats[0], seatIndex: 0 };
      }
    }
    // Herhangi boş
    for (const t of TABLES) {
      for (let i = 0; i < 4; i++) {
        if (!this.seats[t.id][i]) return { table: t, seat: t.seats[i], seatIndex: i };
      }
    }
    return null;
  }

  seatCount() {
    let n = 0;
    for (const t of TABLES) n += this.seats[t.id].filter(Boolean).length;
    return n;
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
      streak: this.streak,
      bestStreak: this.bestStreak,
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
        status: o.status,
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
        seatIndex: c.seatIndex,
        orderId: c.orderId,
        patience: Math.max(0, Math.round(c.patience || 0)),
        eatLeft: c.eatLeft != null ? Math.max(0, Math.round(c.eatLeft)) : null,
        hasFood: !!c.hasFood,
        bubble: c.bubble || null,
      })),
      day: this.day,
      ambient: this.lastAmbient,
    };
  }

  getHands(pid) { return this.hands.get(pid) || emptyHands(); }
  setHands(pid, arr) { this.hands.set(pid, arr); this.gameDirty = true; }

  clearSeat(c) {
    if (c.tableId != null && c.seatIndex != null && this.seats[c.tableId]) {
      if (this.seats[c.tableId][c.seatIndex] === c.id) {
        this.seats[c.tableId][c.seatIndex] = null;
      }
    }
  }

  tick(dt) {
    // spawn — grup şansı
    this.spawnAcc -= dt;
    if (this.spawnAcc <= 0 && this.customers.length < MAX_CUSTOMERS) {
      const free = this.freeSeat();
      if (free) {
        // %35 şans 2 kişi, %10 şans 3 kişi aynı masaya
        let group = 1;
        const roll = Math.random();
        if (roll < 0.1) group = 3;
        else if (roll < 0.45) group = 2;
        for (let g = 0; g < group; g++) {
          if (this.customers.length >= MAX_CUSTOMERS) break;
          const seat = this.freeSeat();
          if (!seat) break;
          // aynı masayı tercih et (ilk kişi hangi masadaysa)
          if (g > 0) {
            const same = TABLES.find((t) => t.id === free.table.id);
            const arr = this.seats[same.id];
            let idx = arr.findIndex((x) => !x);
            if (idx < 0) break;
            this.spawnCustomer(same, same.seats[idx], idx);
          } else {
            this.spawnCustomer(seat.table, seat.seat, seat.seatIndex);
          }
        }
        const fill = this.seatCount() / MAX_CUSTOMERS;
        const jitter = 0.65 + Math.random() * 0.55;
        this.spawnAcc = CUSTOMER_SPAWN_INTERVAL * jitter * (0.7 + fill * 0.8);
        if (this.reputation > 85) this.spawnAcc *= 0.8;
        if (this.reputation < 35) this.spawnAcc *= 1.35;
      } else {
        this.spawnAcc = 1.5;
      }
    }

    // ambient konuşma
    this.ambientAcc -= dt;
    if (this.ambientAcc <= 0) {
      this.ambientAcc = 6 + Math.random() * 10;
      const talkers = this.customers.filter((c) =>
        c.state === 'seated' || c.state === 'ordered' || c.state === 'eating');
      if (talkers.length) {
        const c = talkers[Math.floor(Math.random() * talkers.length)];
        const line = AMBIENT_LINES[Math.floor(Math.random() * AMBIENT_LINES.length)];
        c.bubble = line;
        c.bubbleT = 3.5;
        this.lastAmbient = { text: `${c.name}: ${line}`, t: Date.now() };
        this.gameDirty = true;
      }
    }

    // sipariş sabır
    for (const o of [...this.orders]) {
      if (o.status !== 'waiting_food') continue;
      o.patience -= dt;
      if (o.patience <= 0) this.failOrder(o.id, 'patience');
    }

    // müşteri hareket
    for (const c of this.customers) {
      if (c.bubbleT != null) {
        c.bubbleT -= dt;
        if (c.bubbleT <= 0) { c.bubble = null; c.bubbleT = null; }
      }

      if (c.state === 'enter' || c.state === 'to_pay' || c.state === 'leave') {
        const dx = c.targetX - c.x;
        const dz = c.targetZ - c.z;
        const dist = Math.hypot(dx, dz);
        const speed = c.state === 'leave' ? 2.7 : (c.state === 'to_pay' ? 2.4 : 2.2);
        if (dist < 0.12) {
          c.x = c.targetX; c.z = c.targetZ;
          if (c.state === 'enter') {
            c.state = 'seated';
            c.r = c.face;
            c.patience = 0;
            // oturunca ara sıra laf
            if (Math.random() < 0.4) {
              c.bubble = AMBIENT_LINES[Math.floor(Math.random() * AMBIENT_LINES.length)];
              c.bubbleT = 3;
            }
          } else if (c.state === 'to_pay') {
            c.state = 'paying';
            c.r = -Math.PI / 2;
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
          this.clearSeat(c);
          c.hasFood = false;
          c.state = 'to_pay';
          // kuyrukta boş yer
          const qIdx = this.customers.filter((x) => x.state === 'to_pay' || x.state === 'paying').length;
          const slot = CASHIER_QUEUE[Math.min(qIdx, CASHIER_QUEUE.length - 1)];
          c.targetX = slot.x + (Math.random() - 0.5) * 0.25;
          c.targetZ = slot.z + (Math.random() - 0.5) * 0.2;
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

  spawnCustomer(table, seat, seatIndex) {
    const name = CUSTOMER_NAMES[Math.floor(Math.random() * CUSTOMER_NAMES.length)];
    const color = CUSTOMER_COLORS[Math.floor(Math.random() * CUSTOMER_COLORS.length)];
    const id = 'c' + (custSeq++);
    this.seats[table.id][seatIndex] = id;
    // kapıdan hafif rastgele
    const entryX = (Math.random() - 0.5) * 1.2;
    this.customers.push({
      id, name, color,
      state: 'enter',
      x: entryX, z: 8.4,
      r: Math.PI,
      targetX: seat.x,
      targetZ: seat.z,
      face: seat.face,
      tableId: table.id,
      seatIndex,
      orderId: null,
      patience: 0,
      eatLeft: null,
      hasFood: false,
      bubble: null,
      bubbleT: null,
    });
  }

  // Masadaki öncelikli müşteri: seated > ordered
  tableCustomer(tableId, prefer) {
    const list = this.customers.filter((c) => c.tableId === tableId);
    if (prefer === 'seated') {
      return list.find((c) => c.state === 'seated')
        || list.find((c) => c.state === 'ordered')
        || null;
    }
    if (prefer === 'ordered') {
      return list.find((c) => c.state === 'ordered')
        || list.find((c) => c.state === 'seated')
        || null;
    }
    return list.find((c) => c.state === 'seated')
      || list.find((c) => c.state === 'ordered')
      || list.find((c) => c.state === 'eating')
      || null;
  }

  takeOrder(playerId, tableId) {
    const cust = this.customers.find((c) => c.tableId === tableId && c.state === 'seated');
    if (!cust) return { ok: false, message: 'Sipariş bekleyen müşteri yok (oturmuş olmalı).' };
    if (this.orders.length >= MAX_ACTIVE_ORDERS) {
      return { ok: false, message: 'Çok fazla açık sipariş var.' };
    }
    const recipe = randomRecipe();
    const id = 'o' + (orderSeq++);
    const patience = recipe.time * (0.85 + Math.random() * 0.3);
    const order = {
      id, recipeId: recipe.id, label: recipe.label,
      needs: { ...recipe.needs }, price: recipe.price,
      patience, maxPatience: patience, createdAt: Date.now(),
      customerId: cust.id, tableId, status: 'waiting_food',
    };
    this.orders.push(order);
    cust.state = 'ordered';
    cust.orderId = id;
    cust.patience = patience;
    cust.bubble = recipe.label + ' lütfen!';
    cust.bubbleT = 2.5;
    this.gameDirty = true;
    return { ok: true, kind: 'take_order', label: order.label, customer: cust.name, tableId };
  }

  deliverFood(playerId, tableId) {
    const cust = this.customers.find((c) => c.tableId === tableId && c.state === 'ordered');
    if (!cust) return { ok: false, message: 'Yemek bekleyen müşteri yok.' };
    const order = this.orders.find((o) => o.id === cust.orderId && o.status === 'waiting_food');
    if (!order) return { ok: false, message: 'Sipariş bulunamadı.' };

    const hands = this.getHands(playerId);
    const combined = { ...this.stock };
    for (const h of hands) combined[h.type] = (combined[h.type] || 0) + (h.qty || 1);
    if (!canFulfill(combined, order.needs)) {
      const missing = Object.entries(order.needs)
        .filter(([k, v]) => (combined[k] || 0) < v)
        .map(([k]) => k)
        .join(', ');
      return { ok: false, message: 'Eksik malzeme: ' + missing };
    }

    let remaining = { ...order.needs };
    const newHands = [];
    for (const h of hands) {
      const need = remaining[h.type] || 0;
      if (need > 0) {
        const take = Math.min(need, h.qty || 1);
        remaining[h.type] = need - take;
        const left = (h.qty || 1) - take;
        if (left > 0) newHands.push({ type: h.type, qty: left });
      } else newHands.push(h);
    }
    this.stock = consumeNeeds(this.stock, remaining);
    this.setHands(playerId, newHands);

    cust.state = 'eating';
    cust.hasFood = true;
    cust.eatLeft = EAT_TIME * (0.8 + Math.random() * 0.4);
    cust.patience = 0;
    cust.bubble = 'Afiyet olsun!';
    cust.bubbleT = 2;
    this.gameDirty = true;
    return { ok: true, kind: 'deliver', label: order.label, customer: cust.name, tableId };
  }

  takePayment(playerId) {
    // en öndeki (en eski) paying müşteri
    const payingList = this.customers.filter((c) => c.state === 'paying');
    if (!payingList.length) return { ok: false, message: 'Kasada ödeme bekleyen yok.' };
    const paying = payingList[0];
    const order = this.orders.find((o) => o.id === paying.orderId);
    if (!order) {
      paying.state = 'leave';
      paying.targetX = (Math.random() - 0.5) * 0.8;
      paying.targetZ = 9.3;
      this.gameDirty = true;
      return { ok: false, message: 'Sipariş kaydı yok.' };
    }

    const ratio = Math.max(0, Math.min(1, order.patience / order.maxPatience));
    let tip = 0;
    if (ratio > 0.55) tip = Math.round(order.price * 0.15);
    else if (ratio > 0.3) tip = Math.round(order.price * 0.06);

    // streak bonusu
    this.streak += 1;
    if (this.streak > this.bestStreak) this.bestStreak = this.streak;
    const streakBonus = this.streak >= 3 ? Math.round(order.price * 0.05 * Math.min(5, this.streak - 2)) : 0;

    const earned = order.price + tip + streakBonus;
    this.money += earned;
    this.served++;
    this.reputation = Math.min(100, this.reputation + (ratio > 0.5 ? 2.5 : 1.2));

    this.orders = this.orders.filter((o) => o.id !== order.id);
    paying.state = 'leave';
    paying.targetX = (Math.random() - 0.5) * 1.0;
    paying.targetZ = 9.4;
    paying.orderId = null;
    paying.bubble = tip ? 'Teşekkürler!' : 'İyi günler';
    paying.bubbleT = 2;
    this.gameDirty = true;
    return {
      ok: true, kind: 'payment', label: order.label,
      earned, tip, streakBonus, streak: this.streak,
      customer: paying.name,
    };
  }

  failOrder(orderId) {
    const idx = this.orders.findIndex((o) => o.id === orderId);
    if (idx < 0) return null;
    const order = this.orders[idx];
    this.orders.splice(idx, 1);
    this.failed++;
    this.streak = 0;
    this.reputation = Math.max(0, this.reputation - 6);
    const cust = this.customers.find((c) => c.id === order.customerId);
    if (cust) {
      this.clearSeat(cust);
      cust.state = 'leave';
      cust.targetX = (Math.random() - 0.5) * 1.2;
      cust.targetZ = 9.4;
      cust.orderId = null;
      cust.hasFood = false;
      cust.bubble = 'Çok bekledim!';
      cust.bubbleT = 2.5;
    }
    this.gameDirty = true;
    return { order };
  }

  doStation(playerId, stationId) {
    const action = STATION_ACTIONS[stationId];
    if (!action) return { ok: false, message: 'Bilinmeyen istasyon' };
    const hands = this.getHands(playerId);
    const count = handsCount(hands);

    if (stationId === 'table1' || stationId === 'table2' || stationId === 'table3') {
      // Önce sipariş al, yoksa yemek koy
      const seated = this.customers.find((c) => c.tableId === stationId && c.state === 'seated');
      if (seated) return this.takeOrder(playerId, stationId);
      const ordered = this.customers.find((c) => c.tableId === stationId && c.state === 'ordered');
      if (ordered) return this.deliverFood(playerId, stationId);
      const eating = this.customers.find((c) => c.tableId === stationId && c.state === 'eating');
      if (eating) return { ok: false, message: 'Müşteriler yemek yiyor…' };
      return { ok: false, message: 'Bu masa boş.' };
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
      if (this.stock.spit >= MAX_STOCK.spit) return { ok: false, message: 'Izgara dolu, önce kes!' };
      // tek basışta 1-2 dilim (canlı tempo)
      const add = Math.random() < 0.35 ? 2 : 1;
      this.stock.spit = Math.min(MAX_STOCK.spit, this.stock.spit + add);
      this.gameDirty = true;
      return { ok: true, kind: 'cook', spit: this.stock.spit };
    }

    if (stationId === 'cut') {
      if (this.stock.spit < 1) return { ok: false, message: 'Kesilecek et yok. Izgarada pişir.' };
      this.stock.spit -= 1;
      if (count < HAND_SLOTS) {
        hands.push({ type: 'meat', qty: 1 });
        this.setHands(playerId, hands);
        return { ok: true, kind: 'pickup', item: 'meat', hands };
      }
      if (this.stock.meat >= MAX_STOCK.meat) {
        this.stock.spit += 1;
        return { ok: false, message: 'El ve stok dolu!' };
      }
      this.stock.meat += 1;
      this.gameDirty = true;
      return { ok: true, kind: 'stock', item: 'meat', stock: this.stock.meat };
    }

    const produce = action.produce;
    if (produce) {
      if (count >= HAND_SLOTS) {
        if ((this.stock[produce] || 0) >= MAX_STOCK[produce]) {
          return { ok: false, message: 'El ve stok dolu!' };
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

    return { ok: false, message: 'Burada bir şey yok.' };
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
    if ((this.stock[t] || 0) >= MAX_STOCK[t]) return { ok: false, message: 'Raf dolu.' };
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
