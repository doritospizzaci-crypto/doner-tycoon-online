import * as THREE from 'three';
import { PLAYER_SPEED, PLAYER_RADIUS, MOVE_SEND_HZ } from '/shared/constants.js';
import { STATIONS, SPAWN_POINTS } from '/shared/layout.js';
import { resolveCollisions, nearestStation } from '/shared/collision.js';
import { Network } from './network/Network.js';
import { Input, setupJoystick } from './game/controls/Input.js';
import { IsoCamera } from './game/camera/IsoCamera.js';
import { Character } from './game/entities/Character.js';
import { buildRestaurant } from './game/world/restaurant.js';
import { UI } from './game/ui/UI.js';

const ui = new UI();
const canvas = document.getElementById('game');

// ---- WebGL 2 kontrolü ----
const probe = document.createElement('canvas');
if (!probe.getContext('webgl2')) {
  ui.fatal('Bu cihaz veya tarayıcı WebGL 2 desteklemiyor. Güncel Chrome, Edge, Firefox veya Safari ile dene.');
  throw new Error('WebGL2 yok');
}

// ---- sahne ----
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !ui.isTouch, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#8fb3c9');
const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 120);
const world = buildRestaurant(scene);
const cam = new IsoCamera(camera, canvas);
const input = new Input();
setupJoystick(input, document.getElementById('joystick'), document.getElementById('knob'));

// ---- ayarlar ----
const QUALITY = {
  low: { shadows: false, size: 512, pr: 1 },
  medium: { shadows: true, size: 1024, pr: 1.5 },
  high: { shadows: true, size: 2048, pr: 2 },
};
const settings = { quality: ui.isTouch ? 'low' : 'medium', fx: !ui.isTouch };
try { Object.assign(settings, JSON.parse(localStorage.getItem('dto_settings') || '{}')); } catch { /* yok say */ }
if (!QUALITY[settings.quality]) settings.quality = 'low';

function applySettings() {
  const q = QUALITY[settings.quality];
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pr));
  world.setShadows(q.shadows, q.size);
  world.setEffects(settings.fx);
  ui.el.quality.value = settings.quality;
  ui.el.fx.checked = settings.fx;
  resize();
  try { localStorage.setItem('dto_settings', JSON.stringify(settings)); } catch { /* yok say */ }
}
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // dar (dikey) ekranlarda görüş alanını biraz aç
  camera.fov = w / h < 0.8 ? 52 : 40;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
ui.el.quality.addEventListener('change', (e) => { settings.quality = e.target.value; applySettings(); });
ui.el.fx.addEventListener('change', (e) => { settings.fx = e.target.checked; applySettings(); });
applySettings();

// ---- oyun durumu ----
const net = new Network();
const state = {
  inGame: false,
  me: null,            // yerel Character
  pos: { x: 0, z: 0 },
  rot: 0,
  remotes: new Map(),  // id -> { char, tx, tz, tr, lastX, lastZ }
  lastSent: { x: 1e9, z: 1e9, r: 0, t: 0 },
  sendAcc: 0,
  actCooldown: 0,
  room: null,
};

function addRemote(p) {
  if (state.remotes.has(p.id)) return;
  const char = new Character({ name: p.name, color: p.color });
  char.setPosition(p.x, p.z);
  char.setFacing(p.r);
  scene.add(char.group);
  state.remotes.set(p.id, { char, tx: p.x, tz: p.z, tr: p.r, lastX: p.x, lastZ: p.z });
}
function removeRemote(id) {
  const r = state.remotes.get(id);
  if (!r) return;
  scene.remove(r.char.group);
  r.char.dispose();
  state.remotes.delete(id);
}
function clearWorldPlayers() {
  for (const id of [...state.remotes.keys()]) removeRemote(id);
  if (state.me) { scene.remove(state.me.group); state.me.dispose(); state.me = null; }
}

function syncRoom(room) {
  state.room = room;
  const ids = new Set(room.players.map((p) => p.id));
  for (const id of [...state.remotes.keys()]) if (!ids.has(id)) removeRemote(id);
  for (const p of room.players) if (p.id !== net.myId) addRemote(p);
  ui.renderPlayers(room, net.myId);
  const mine = room.players.find((p) => p.id === net.myId);
  if (mine && ui.el.role.value !== (mine.role || '')) ui.el.role.value = mine.role || '';
}

function enterGame(res) {
  clearWorldPlayers();
  const me = res.room.players.find((p) => p.id === res.you);
  state.me = new Character({ name: me.name + ' (sen)', color: me.color });
  scene.add(state.me.group);
  state.pos = { x: me.x, z: me.z };
  state.rot = 0;
  state.me.setPosition(me.x, me.z);
  cam.follow(me.x, me.z);
  cam.snap();
  syncRoom(res.room);
  ui.showGame(res.room.code);
  ui.addChat('Odaya girdin. Kodu arkadaşlarınla paylaş: ' + res.room.code, { system: true });
  state.inGame = true;
  state.lastSent.x = 1e9;
  startLoop();
}

function leaveToLobby(message) {
  state.inGame = false;
  clearWorldPlayers();
  state.room = null;
  ui.showLobby();
  ui.lobbyMessage(message);
}

// ---- ağ olayları ----
net.on('status', (s) => ui.setStatus(s));
net.on('room', (room) => { if (state.inGame) syncRoom(room); });
net.on('players', (list) => {
  for (const p of list) {
    if (p.id === net.myId) continue;
    const r = state.remotes.get(p.id);
    if (r) { r.tx = p.x; r.tz = p.z; r.tr = p.r; }
  }
});
net.on('correct', (p) => {
  state.pos.x = p.x; state.pos.z = p.z;
  state.me?.setPosition(p.x, p.z);
  state.lastSent.x = 1e9;
});
net.on('action', (a) => state.remotes.get(a.id)?.char.playWork(1.2));
net.on('chat', (m) => ui.addChat(m.text, { name: m.name }));
net.on('notice', (n) => {
  const t = {
    join: `${n.name} odaya katıldı`,
    leave: `${n.name} ayrıldı`,
    timeout: `${n.name} bağlantısı koptu ve odadan çıkarıldı`,
    disconnect: `${n.name} bağlantısı koptu, bekleniyor…`,
    reconnect: `${n.name} geri döndü`,
    host: `${n.name} artık oda lideri 👑`,
  }[n.type];
  if (n.type === 'replaced') { leaveToLobby('Bu hesap başka bir sekmede açıldı.'); return; }
  if (t && state.inGame) ui.addChat(t, { system: true });
});
net.on('rejoined', (res) => {
  if (!state.inGame) return;
  syncRoom(res.room);
  const me = res.room.players.find((p) => p.id === res.you);
  if (me) { state.pos.x = me.x; state.pos.z = me.z; }
  ui.addChat('Bağlantı yeniden kuruldu', { system: true });
});
net.on('rejoinFailed', () => leaveToLobby('Bağlantı koptu ve oda artık yok. Yeni oda kur veya tekrar katıl.'));

net.connect().catch((e) => ui.fatal('Sunucu istemcisi yüklenemedi. Sunucu çalışıyor mu? ' + e.message));

// ---- lobi düğmeleri ----
async function lobbyAction(kind) {
  const name = ui.el.name.value.trim();
  if (!name) { ui.lobbyMessage('Önce bir isim yaz.'); return; }
  try { localStorage.setItem('dto_name', name); } catch { /* yok say */ }
  ui.lobbyMessage('');
  const res = kind === 'create' ? await net.createRoom(name) : await net.joinRoom(ui.el.code.value, name);
  if (!res.ok) { ui.lobbyMessage(res.message || 'İşlem başarısız.'); return; }
  enterGame(res);
}
document.getElementById('btn-create').addEventListener('click', () => lobbyAction('create'));
document.getElementById('btn-join').addEventListener('click', () => lobbyAction('join'));
ui.el.code.addEventListener('keydown', (e) => { if (e.key === 'Enter') lobbyAction('join'); });

// ---- HUD düğmeleri ----
document.getElementById('btn-share').addEventListener('click', async () => {
  const code = state.room?.code;
  if (!code) return;
  const url = `${location.origin}/?oda=${code}`;
  const text = `Döner Tycoon'da dükkânıma gel! Oda kodu: ${code}`;
  try {
    if (navigator.share) await navigator.share({ title: 'Döner Tycoon', text, url });
    else { await navigator.clipboard.writeText(`${text}\n${url}`); ui.addChat('Davet bağlantısı kopyalandı', { system: true }); }
  } catch { /* kullanıcı vazgeçti */ }
});
const toggleMenu = () => {
  if (!state.inGame) return;
  const open = !ui.menuOpen;
  ui.setMenu(open);
  input.enabled = !open;
  cam.setEnabled(!open);
  input.joy.x = 0; input.joy.y = 0;
};
const toggleChat = () => { if (state.inGame && !ui.menuOpen) ui.setChat(!ui.chatOpen); };
input.onMenu = () => { if (ui.chatOpen) ui.setChat(false); else toggleMenu(); };
input.onChat = toggleChat;
document.getElementById('btn-menu').addEventListener('click', toggleMenu);
document.getElementById('btn-resume').addEventListener('click', toggleMenu);
document.getElementById('btn-chat').addEventListener('click', toggleChat);
document.getElementById('btn-leave').addEventListener('click', async () => {
  toggleMenu();
  await net.leaveRoom();
  leaveToLobby('');
});
ui.el.chatform.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = ui.el.chatinput.value.trim();
  if (text) net.sendChat(text);
  ui.el.chatinput.value = '';
  if (!ui.isTouch) ui.setChat(false);
});
ui.el.role.addEventListener('change', (e) => net.sendRole(e.target.value || null));

function interact() {
  if (!state.inGame || state.actCooldown > 0 || ui.menuOpen) return;
  const st = nearestStation(state.pos.x, state.pos.z, STATIONS);
  if (!st) return;
  state.actCooldown = 1.0;
  state.me.playWork(1.2);
  net.sendInteract(st.id);
}
input.onInteract = interact;
document.getElementById('btn-act').addEventListener('pointerdown', (e) => { e.preventDefault(); interact(); });

// ---- ana döngü ----
const clock = new THREE.Clock();
let rafId = 0;
const MOVE_DT = 1 / MOVE_SEND_HZ;
const playerList = [];

function angleLerp(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function frame() {
  rafId = requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.1);
  if (!state.inGame) {
    // Lobi: restoran arkada yavaşça dönerek görünür.
    cam.yaw += dt * 0.08;
    cam.update(dt);
    world.update(dt, camera.position, []);
    renderer.render(scene, camera);
    return;
  }

  // yerel hareket (kameraya göre)
  const mv = input.getMove();
  const f = cam.forward(), r = cam.right();
  let dx = f.x * mv.y + r.x * mv.x;
  let dz = f.z * mv.y + r.z * mv.x;
  const len = Math.hypot(dx, dz);
  let speed = 0;
  if (len > 0.01) {
    const k = Math.min(1, len);
    const nx = state.pos.x + (dx / len) * PLAYER_SPEED * k * dt;
    const nz = state.pos.z + (dz / len) * PLAYER_SPEED * k * dt;
    const fixed = resolveCollisions(nx, nz, PLAYER_RADIUS);
    speed = Math.hypot(fixed.x - state.pos.x, fixed.z - state.pos.z) / dt;
    state.pos.x = fixed.x; state.pos.z = fixed.z;
    if (speed > 0.3) state.rot = angleLerp(state.rot, Math.atan2(dx, dz), 1 - Math.exp(-18 * dt));
  }
  state.actCooldown = Math.max(0, state.actCooldown - dt);
  const me = state.me;
  me.setPosition(state.pos.x, state.pos.z);
  me.setFacing(state.rot);
  me.update(dt, speed);

  // sunucuya düzenli gönder (değişim varsa)
  state.sendAcc += dt;
  if (state.sendAcc >= MOVE_DT) {
    state.sendAcc = 0;
    const s = state.lastSent;
    const moved = Math.hypot(state.pos.x - s.x, state.pos.z - s.z) > 0.01 || Math.abs(state.rot - s.r) > 0.05;
    if (moved && net.socket?.connected) {
      net.sendMove(state.pos.x, state.pos.z, state.rot);
      s.x = state.pos.x; s.z = state.pos.z; s.r = state.rot;
    }
  }

  // diğer oyuncular: yumuşatma / interpolasyon
  playerList.length = 0;
  playerList.push(state.pos);
  const a = 1 - Math.exp(-12 * dt);
  for (const rp of state.remotes.values()) {
    const g = rp.char.group.position;
    const nx = g.x + (rp.tx - g.x) * a;
    const nz = g.z + (rp.tz - g.z) * a;
    const sp = Math.hypot(nx - g.x, nz - g.z) / dt;
    g.x = nx; g.z = nz;
    rp.char.setFacing(angleLerp(rp.char.model.rotation.y, rp.tr, a));
    rp.char.update(dt, sp);
    playerList.push({ x: g.x, z: g.z });
  }

  // etkileşim ipucu
  ui.setHint(nearestStation(state.pos.x, state.pos.z, STATIONS));

  cam.follow(state.pos.x, state.pos.z);
  cam.update(dt);
  world.update(dt, camera.position, playerList);
  renderer.render(scene, camera);
}

function startLoop() {
  if (!rafId) { clock.getDelta(); rafId = requestAnimationFrame(frame); }
}
// Sekme arka plana alınınca çizimi durdur (pil ve işlemci tasarrufu).
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { cancelAnimationFrame(rafId); rafId = 0; }
  else startLoop();
});

// Lobi arkasında restoranı göster ve döngüyü başlat
cam.follow(SPAWN_POINTS[2].x, SPAWN_POINTS[2].z);
cam.snap();
startLoop();
