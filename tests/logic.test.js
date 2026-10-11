// Mantik testleri: bagimlilik gerektirmez.
import { resolveCollisions } from '../shared/collision.js';
import { OBSTACLES, SPAWN_POINTS, STATIONS, BOUNDS } from '../shared/layout.js';
import { validRoomCode, validMove, validName, validChat, validToken } from '../server/src/validation/validate.js';
import { RoomManager, publicId } from '../server/src/rooms/RoomManager.js';
import { RateLimiter } from '../server/src/middleware/rateLimit.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const ok = (c, m) => assert.ok(c, m);
test('paylasilan mantik: carpisma, dogrulama, odalar, hiz siniri', () => {
// spawn noktalari ve istasyonlar carpisma icinde degil
for (const s of SPAWN_POINTS) { const f = resolveCollisions(s.x, s.z, 0.4); ok(Math.hypot(f.x-s.x,f.z-s.z) < 1e-6, `spawn ${s.x},${s.z} serbest`); }
for (const s of STATIONS) { const f = resolveCollisions(s.x, s.z, 0.4); ok(Math.hypot(f.x-s.x,f.z-s.z) < 1e-6, `istasyon ${s.id} ulasilabilir`); }
let f = resolveCollisions(-3, -1.5, 0.4); ok(Math.abs(f.z+1.5) > 0.5, 'servis tezgahi icine girilemez');
f = resolveCollisions(50, 50, 0.4); ok(f.x <= BOUNDS.maxX && f.z <= BOUNDS.maxZ, 'sinir disina cikilamaz');
ok(validRoomCode('abcde') === 'ABCDE' && validRoomCode('ABC0E') === null && validRoomCode('ABCD') === null, 'oda kodu dogrulama');
ok(validMove({x:1,z:2,r:3}) && !validMove({x:'1',z:2,r:3}) && !validMove({x:NaN,z:0,r:0}) && !validMove(null), 'hareket dogrulama');
ok(validName('  Ali  ') === 'Ali' && validName('') === null && validName('x'.repeat(40)) === null, 'isim dogrulama');
ok(validChat('merhaba') && !validChat('a'.repeat(200)), 'sohbet dogrulama');
ok(validToken('a'.repeat(32)) && !validToken('kisa') && !validToken('a b'.repeat(10)), 'token dogrulama');
const rm = new RoomManager(); const room = rm.create();
ok(/^[A-HJ-NP-Z2-9]{5}$/.test(room.code), 'oda kodu bicimi ' + room.code);
const ids = ['a','b','c','d','e','f'].map((c)=>publicId(c.repeat(20)));
ids.forEach((id,i)=>room.addPlayer({id,name:'P'+i,socketId:'s'+i}));
ok(room.isFull && room.players.size === 6, '6 oyuncuda oda dolu');
const colors = new Set([...room.players.values()].map(p=>p.color)); ok(colors.size === 6, 'renkler benzersiz');
const r = room.removePlayer(ids[0]); ok(r.newHost && room.hostId === ids[1], 'lider devri');
const lim = new RateLimiter(); let allowed = 0; for (let i=0;i<20;i++) if (lim.allow('k',3,0,1000)) allowed++; ok(allowed === 3, 'hiz siniri'); lim.close();

});
