// Entegrasyon testleri: gercek Socket.IO sunucusu + gercek Socket.IO istemcileri.
// Calistirma: npm install && npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { io as ioc } from 'socket.io-client';
import { createGameServer } from '../server/src/createServer.js';

let srv, url;
const sockets = [];
test.before(async () => {
  srv = createGameServer({ port: 0 });
  const port = await srv.start();
  url = `http://127.0.0.1:${port}`;
});
test.after(async () => {
  for (const s of sockets) s.close();
  await srv.stop();
});

const token = () => Array.from({ length: 32 }, () => 'abcdef0123456789'[Math.floor(Math.random() * 16)]).join('');

async function client() {
  const s = ioc(url, { transports: ['websocket'], reconnection: false });
  sockets.push(s);
  await new Promise((res, rej) => { s.on('connect', res); s.on('connect_error', rej); });
  s.token = token();
  return s;
}
const ask = (s, ev, payload) => new Promise((res) => s.emit(ev, payload, res));
const waitFor = (s, ev, pred = () => true, ms = 2000) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error(`zaman asimi: ${ev}`)), ms);
  const h = (d) => { if (pred(d)) { clearTimeout(t); s.off(ev, h); res(d); } };
  s.on(ev, h);
});
const create = (s, name = 'Ali') => ask(s, 'room:create', { name, token: s.token });
const join = (s, code, name = 'Veli') => ask(s, 'room:join', { code, name, token: s.token });

test('1. sunucu basliyor (healthz)', async () => {
  const r = await fetch(`${url}/healthz`);
  assert.equal((await r.json()).ok, true);
});

test('2. istemci sunucuya baglaniyor', async () => {
  const s = await client();
  assert.equal(s.connected, true);
});

test('3. iki istemci ayni odaya katiliyor', async () => {
  const a = await client(), b = await client();
  const ra = await create(a);
  assert.equal(ra.ok, true);
  const rb = await join(b, ra.room.code);
  assert.equal(rb.ok, true);
  assert.equal(rb.room.players.length, 2);
});

test('4. bir oyuncunun hareketi digerinde goruluyor', async () => {
  const a = await client(), b = await client();
  const ra = await create(a);
  const rb = await join(b, ra.room.code);
  const me = ra.room.players[0];
  const got = waitFor(b, 'state:players', (l) => l.some((p) => p.id === ra.you && Math.abs(p.x - (me.x + 0.2)) < 0.02));
  a.emit('player:move', { x: me.x + 0.2, z: me.z, r: 1 });
  await got;
  assert.ok(rb.ok);
});

test('4b. isinlanma / duvar ici hareket reddediliyor', async () => {
  const a = await client();
  const ra = await create(a);
  const fix = waitFor(a, 'player:correct');
  a.emit('player:move', { x: -3, z: -1.5, r: 0 }); // servis tezgahinin icine
  const c = await fix;
  const me = ra.room.players[0];
  assert.ok(Math.abs(c.x - me.x) < 0.01 && Math.abs(c.z - me.z) < 0.01);
  const fix2 = waitFor(a, 'player:correct');
  a.emit('player:move', { x: me.x + 9, z: me.z, r: 0 }); // cok hizli
  await fix2;
});

test('5. oda kapasitesi (6) uygulaniyor', async () => {
  const host = await client();
  const r = await create(host);
  for (let i = 0; i < 5; i++) assert.equal((await join(await client(), r.room.code, 'P' + i)).ok, true);
  const extra = await join(await client(), r.room.code, 'Fazla');
  assert.equal(extra.ok, false);
  assert.equal(extra.error, 'ROOM_FULL');
});

test('6. gecersiz oda kodu reddediliyor', async () => {
  const s = await client();
  assert.equal((await join(s, 'ZZZZZ')).error, 'ROOM_NOT_FOUND');
  assert.equal((await join(s, 'ab')).error, 'BAD_CODE');
  assert.equal((await join(s, 12345)).error, 'BAD_CODE');
});

test('10a. ayrilan oyuncu listeden dusuyor, lider devrediliyor', async () => {
  const a = await client(), b = await client();
  const ra = await create(a, 'Lider');
  await join(b, ra.room.code, 'Ikinci');
  const upd = waitFor(b, 'room:state', (r) => r.players.length === 1);
  await ask(a, 'room:leave', {});
  const room = await upd;
  assert.equal(room.hostId, room.players[0].id);
});

test('10b. baglanti kopunca oyuncu beklemeye aliniyor ve ayni token ile geri donebiliyor', async () => {
  const a = await client(), b = await client();
  const ra = await create(a, 'Gelen');
  await join(b, ra.room.code, 'Giden');
  const off = waitFor(a, 'room:state', (r) => r.players.some((p) => !p.connected));
  b.close();
  await off;
  const b2 = await client();
  b2.token = b.token;
  const back = await join(b2, ra.room.code, 'Giden');
  assert.equal(back.ok, true);
  assert.equal(back.room.players.length, 2);
  assert.ok(back.room.players.every((p) => p.connected));
});

test('sohbet sadece ayni odaya gidiyor', async () => {
  const a = await client(), b = await client(), outsider = await client();
  const ra = await create(a);
  await join(b, ra.room.code);
  await create(outsider, 'Disarida');
  let leaked = false;
  outsider.on('chat:msg', () => { leaked = true; });
  const got = waitFor(b, 'chat:msg');
  a.emit('chat:send', { text: 'merhaba' });
  assert.equal((await got).text, 'merhaba');
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(leaked, false);
});
