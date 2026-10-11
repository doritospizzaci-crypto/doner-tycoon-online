// Basit token-bucket hiz siniri. Anahtar: ornegin "socketId:move" veya "ip:join".
export class RateLimiter {
  constructor() {
    this.buckets = new Map();
    this.cleaner = setInterval(() => this.cleanup(), 60000);
    this.cleaner.unref?.();
  }

  allow(key, capacity, refillPerSec, now = Date.now()) {
    let b = this.buckets.get(key);
    if (!b) {
      b = { tokens: capacity, last: now };
      this.buckets.set(key, b);
    }
    b.tokens = Math.min(capacity, b.tokens + ((now - b.last) / 1000) * refillPerSec);
    b.last = now;
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }

  drop(prefix) {
    for (const k of this.buckets.keys()) if (k.startsWith(prefix)) this.buckets.delete(k);
  }

  cleanup(now = Date.now()) {
    for (const [k, b] of this.buckets) if (now - b.last > 120000) this.buckets.delete(k);
  }

  close() { clearInterval(this.cleaner); }
}

export const LIMITS = {
  move: [40, 30],
  chat: [3, 1.2],
  interact: [3, 1.5],
  role: [3, 0.5],
  room: [6, 0.3],
  roomIp: [40, 0.7],
};
