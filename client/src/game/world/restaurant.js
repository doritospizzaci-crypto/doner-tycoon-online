import * as THREE from 'three';
import { BOUNDS, OBSTACLES, DOOR } from '/shared/layout.js';

// ---- küçük yardımcılar: paylaşılan geometri ve malzemeler ----
const geos = new Map();
const cached = (key, make) => { if (!geos.has(key)) geos.set(key, make()); return geos.get(key); };
const boxG = (w, h, d) => cached(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const cylG = (rt, rb, h, s = 12) => cached(`c${rt},${rb},${h},${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s));
const sphG = (r, ws = 8, hs = 6) => cached(`s${r},${ws},${hs}`, () => new THREE.SphereGeometry(r, ws, hs));
const capG = (r, l) => cached(`k${r},${l}`, () => new THREE.CapsuleGeometry(r, l, 3, 8));

const mats = new Map();
const mat = (color) => { if (!mats.has(color)) mats.set(color, new THREE.MeshLambertMaterial({ color })); return mats.get(color); };
const glow = (color) => { const k = 'g' + color; if (!mats.has(k)) mats.set(k, new THREE.MeshBasicMaterial({ color })); return mats.get(k); };

function canvasTex(w, h, draw, rx = 1, ry = 1, repeat = false) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 4; }
  return t;
}

const FONT = '"Trebuchet MS", "Segoe UI", sans-serif';

export function buildRestaurant(scene) {
  const root = new THREE.Group();
  scene.add(root);
  const walls = [];
  const spinners = [];
  const doorPanes = [];
  let doorOpen = 0;

  const add = (parent, mesh, x = 0, y = 0, z = 0, cast = false) => {
    mesh.position.set(x, y, z);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const box = (p, w, h, d, color, x, y, z, cast = false) => add(p, new THREE.Mesh(boxG(w, h, d), mat(color)), x, y, z, cast);
  const cyl = (p, rt, rb, h, color, x, y, z, cast = false, s = 12) => add(p, new THREE.Mesh(cylG(rt, rb, h, s), mat(color)), x, y, z, cast);
  const sph = (p, r, color, x, y, z, sy = 1) => { const m = add(p, new THREE.Mesh(sphG(r), mat(color)), x, y, z); m.scale.y = sy; return m; };
  const group = (x, z) => { const g = new THREE.Group(); g.position.set(x, 0, z); root.add(g); return g; };

  function counter(o, body, top, h = 0.92) {
    const g = group(o.x, o.z);
    box(g, o.w - 0.1, h, o.d - 0.1, body, 0, h / 2, 0, true);
    box(g, o.w, 0.08, o.d, top, 0, h + 0.04, 0, true);
    return g;
  }

  function sign(w, h, lines, { bg = '#7d1d12', fg = '#ffd9a0', font = 64 } = {}) {
    const pw = 512, ph = Math.round(512 * (h / w));
    const tex = canvasTex(pw, ph, (g) => {
      g.fillStyle = bg; g.fillRect(0, 0, pw, ph);
      g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(10, 10, pw - 20, ph - 20);
      g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
      const n = lines.length;
      lines.forEach((t, i) => {
        const size = i === 0 ? font : font * 0.6;
        g.font = `bold ${size}px ${FONT}`;
        g.fillText(t, pw / 2, (ph / (n + 1)) * (i + 1), pw - 40);
      });
    });
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
  }

  // ---------- zemin ve dış alan ----------
  const outside = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), mat('#6d7a5c'));
  outside.rotation.x = -Math.PI / 2; outside.position.y = -0.03; outside.receiveShadow = true; root.add(outside);
  const sidewalk = new THREE.Mesh(new THREE.PlaneGeometry(40, 5), mat('#b5aea1'));
  sidewalk.rotation.x = -Math.PI / 2; sidewalk.position.set(0, -0.015, 11.2); sidewalk.receiveShadow = true; root.add(sidewalk);

  const W = BOUNDS.maxX - BOUNDS.minX;
  const tileTex = canvasTex(128, 128, (g) => {
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      g.fillStyle = (i + j) % 2 ? '#d9d2c3' : '#efe9dc'; g.fillRect(i * 64, j * 64, 64, 64);
    }
    g.strokeStyle = '#b9b09c'; g.lineWidth = 2; g.strokeRect(0, 0, 128, 128);
  }, (W + 0.6) / 2, 4, true);
  const kitchenFloor = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.6, 8), new THREE.MeshLambertMaterial({ map: tileTex }));
  kitchenFloor.rotation.x = -Math.PI / 2; kitchenFloor.position.set(0, 0, -4); kitchenFloor.receiveShadow = true; root.add(kitchenFloor);

  const woodTex = canvasTex(256, 256, (g) => {
    const cols = ['#a86f3f', '#9c6637', '#b07a49', '#a26a3a'];
    for (let i = 0; i < 4; i++) { g.fillStyle = cols[i]; g.fillRect(0, i * 64, 256, 64); g.fillStyle = '#6b4424'; g.fillRect(0, i * 64, 256, 3); }
    g.fillStyle = '#6b4424'; g.fillRect(90, 0, 3, 64); g.fillRect(190, 64, 3, 64); g.fillRect(40, 128, 3, 64); g.fillRect(150, 192, 3, 64);
  }, (W + 0.6) / 4, 2, true);
  const diningFloor = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.6, 8), new THREE.MeshLambertMaterial({ map: woodTex }));
  diningFloor.rotation.x = -Math.PI / 2; diningFloor.position.set(0, 0, 4); diningFloor.receiveShadow = true; root.add(diningFloor);

  // ---------- duvarlar (kamera arkasındaysa şeffaflaşır) ----------
  const WALL_H = 3.4;
  function wall(cx, cz, w, d, nx, nz) {
    const wm = new THREE.MeshLambertMaterial({ color: '#efe3c9' });
    const bm = new THREE.MeshLambertMaterial({ color: '#2f7480' });
    const g = new THREE.Group();
    const main = new THREE.Mesh(boxG(w, WALL_H, d), wm);
    main.position.set(cx, WALL_H / 2, cz); main.castShadow = true; main.receiveShadow = true;
    const band = new THREE.Mesh(boxG(nx ? w + 0.04 : w, 1.1, nz ? d + 0.04 : d), bm);
    band.position.set(cx, 0.55, cz);
    g.add(main, band);
    root.add(g);
    walls.push({ mats: [wm, bm], center: new THREE.Vector3(cx, 1.5, cz), normal: new THREE.Vector3(nx, 0, nz), op: 1 });
  }
  wall(0, BOUNDS.minZ - 0.15, W + 0.6, 0.3, 0, -1);
  wall(BOUNDS.minX - 0.15, 0, 0.3, 16.6, -1, 0);
  wall(BOUNDS.maxX + 0.15, 0, 0.3, 16.6, 1, 0);

  // ön cephe: alçak duvar + vitrin pervazı + kapı
  const fz = BOUNDS.maxZ + 0.15;
  const segW = (W + 0.6) / 2 - DOOR.halfWidth;
  for (const s of [-1, 1]) {
    const cx = s * (DOOR.halfWidth + segW / 2);
    box(root, segW, 0.9, 0.3, '#efe3c9', cx, 0.45, fz, true);
    box(root, segW, 0.5, 0.32, '#2f7480', cx, 0.25, fz);
    box(root, segW, 0.06, 0.4, '#8a5a30', cx, 0.93, fz);
    for (let i = 1; i < 4; i++) box(root, 0.1, 1.3, 0.1, '#3b2a22', cx - segW / 2 + (segW * i) / 4, 1.55, fz);
  }
  box(root, DOOR.halfWidth * 2 + 0.4, 0.25, 0.4, '#3b2a22', 0, 2.5, fz, true);
  const glassM = new THREE.MeshLambertMaterial({ color: '#9fd4e8', transparent: true, opacity: 0.35, depthWrite: false });
  for (const s of [-1, 1]) {
    const pane = new THREE.Mesh(boxG(DOOR.halfWidth, 2.2, 0.06), glassM);
    pane.position.set(s * DOOR.halfWidth / 2, 1.1, fz + 0.12);
    root.add(pane);
    doorPanes.push({ mesh: pane, s, baseX: s * DOOR.halfWidth / 2 });
  }
  const outSign = sign(3.2, 1.0, ['DÖNER', 'Sıcak • Taze • Bol'], { font: 90 });
  outSign.position.set(0, 3.0, fz + 0.2); root.add(outSign);

  // ---------- duvar süsleri ----------
  const bigSign = sign(5.6, 0.95, ['DÖNER TYCOON'], { font: 78 });
  bigSign.position.set(-6, 2.75, BOUNDS.minZ + 0.02); root.add(bigSign);

  const menu = sign(2.6, 1.5, ['MENÜ', 'Et Döner • Tavuk Döner', 'Lavaş • Ekmek Arası', 'Patates • Ayran'], { bg: '#1f3b2d', fg: '#f4ecd8', font: 70 });
  menu.position.set(-1.0, 2.55, BOUNDS.minZ + 0.02); root.add(menu);

  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.2), new THREE.MeshBasicMaterial({
    map: canvasTex(256, 170, (g, w, h) => {
      g.fillStyle = '#e30a17'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#fff'; g.beginPath(); g.arc(w * 0.38, h / 2, h * 0.3, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#e30a17'; g.beginPath(); g.arc(w * 0.44, h / 2, h * 0.24, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff'; g.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const r = i % 2 ? h * 0.06 : h * 0.13; g.lineTo(w * 0.58 + Math.cos(a) * r, h / 2 + Math.sin(a) * r); }
      g.closePath(); g.fill();
    }),
  }));
  flag.position.set(10.2, 2.4, BOUNDS.minZ + 0.02); root.add(flag);

  const nazar = new THREE.Mesh(new THREE.CircleGeometry(0.42, 24), new THREE.MeshBasicMaterial({
    map: canvasTex(128, 128, (g) => {
      [['#1e4fa8', 62], ['#fff', 44], ['#4aa8e0', 30], ['#101020', 15]].forEach(([c, r]) => { g.fillStyle = c; g.beginPath(); g.arc(64, 64, r, 0, Math.PI * 2); g.fill(); });
    }),
    transparent: true,
  }));
  nazar.rotation.y = Math.PI / 2; nazar.position.set(BOUNDS.minX + 0.02, 2.2, 5.2); root.add(nazar);

  const waitSign = sign(2.0, 0.6, ['Bekleme alanı'], { bg: '#2f7480', fg: '#fff', font: 56 });
  waitSign.rotation.y = -Math.PI / 2; waitSign.position.set(BOUNDS.maxX - 0.02, 2.2, 6.4); root.add(waitSign);

  for (const x of [-11, -2.6, 6.8]) { // duvar lambaları
    const l = new THREE.Mesh(sphG(0.14, 10, 8), glow('#ffd58a'));
    l.position.set(x, 2.1, BOUNDS.minZ + 0.2); root.add(l);
  }

  // ---------- döner ocağı ----------
  const grillO = OBSTACLES.find((o) => o.id === 'grill');
  const gg = counter(grillO, '#5d636b', '#2b2f34', 0.95);
  box(gg, 1.4, 1.6, 0.1, '#2a2a2a', 0, 1.8, -0.52, true);
  box(gg, 1.2, 1.4, 0.03, '#000', 0, 1.8, -0.45).material = glow('#ff7a2a');
  const meatTex = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#8f4f2a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      g.fillStyle = `rgba(${60 + Math.random() * 80},${25 + Math.random() * 30},10,${0.25 + Math.random() * 0.3})`;
      g.fillRect(Math.random() * w, Math.random() * h, 6 + Math.random() * 18, 3 + Math.random() * 7);
    }
    g.fillStyle = 'rgba(30,10,0,0.35)';
    for (let y = 0; y < h; y += 26) g.fillRect(0, y, w, 3);
  });
  const meatGroup = new THREE.Group();
  meatGroup.position.set(0, 1.08, 0.1);
  const meat = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.33, 1.25, 20), new THREE.MeshLambertMaterial({ map: meatTex }));
  meat.position.y = 0.63; meat.castShadow = true;
  const crust = new THREE.Mesh(sphG(0.42, 14, 8), mat('#6d3a1b'));
  crust.scale.set(1, 0.35, 1); crust.position.y = 1.26; crust.castShadow = true;
  meatGroup.add(meat, crust);
  gg.add(meatGroup);
  spinners.push(meatGroup);
  cyl(gg, 0.03, 0.03, 1.8, '#c9ccd1', 0, 1.9, 0.1);
  cyl(gg, 0.55, 0.55, 0.05, '#9aa0a6', 0, 1.03, 0.1);
  cyl(gg, 0.08, 0.08, 0.06, '#c9ccd1', 0.55, 1.03, 0.45);

  // buhar parçacıkları
  const puffTex = canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  });
  const STEAM_N = 26;
  const steamPos = new Float32Array(STEAM_N * 3);
  const steamAge = new Float32Array(STEAM_N);
  const steamGeo = new THREE.BufferGeometry();
  steamGeo.setAttribute('position', new THREE.BufferAttribute(steamPos, 3));
  const steam = new THREE.Points(steamGeo, new THREE.PointsMaterial({
    map: puffTex, size: 0.55, transparent: true, opacity: 0.45, depthWrite: false, color: '#ffffff',
  }));
  steam.frustumCulled = false;
  root.add(steam);
  const resetPuff = (i) => {
    steamPos[i * 3] = grillO.x + (Math.random() - 0.5) * 0.7;
    steamPos[i * 3 + 1] = 2.4 + Math.random() * 0.2;
    steamPos[i * 3 + 2] = grillO.z + 0.1 + (Math.random() - 0.5) * 0.7;
    steamAge[i] = Math.random() * 2;
  };
  for (let i = 0; i < STEAM_N; i++) { resetPuff(i); steamPos[i * 3 + 1] += Math.random() * 1.2; }

  // ---------- kesme tezgâhı ----------
  const cutG = counter(OBSTACLES.find((o) => o.id === 'cut'), '#8a8f96', '#d8dadd');
  box(cutG, 1.0, 0.07, 0.65, '#c99a62', -0.3, 1.04, 0.15);
  box(cutG, 0.5, 0.025, 0.1, '#e6e8ea', 0.1, 1.11, 0.12).rotation.y = 0.3;
  box(cutG, 0.18, 0.04, 0.08, '#2a2220', -0.2, 1.11, 0.1).rotation.y = 0.3;
  for (let i = 0; i < 3; i++) cyl(cutG, 0.26, 0.24, 0.03, '#ffffff', 0.85, 1.05 + i * 0.04, 0.1);
  for (let i = 0; i < 7; i++) sph(cutG, 0.1, '#8d4a28', -0.3 + (i % 3) * 0.14, 1.12, 0.05 + Math.floor(i / 3) * 0.14, 0.45);

  // ---------- ekmek / lavaş ----------
  const breadG = counter(OBSTACLES.find((o) => o.id === 'bread'), '#8a6b4a', '#c99a62');
  box(breadG, 0.9, 0.22, 0.6, '#7a5230', -0.6, 1.13, 0.05);
  for (let i = 0; i < 4; i++) {
    const loaf = add(breadG, new THREE.Mesh(capG(0.09, 0.4), mat('#e0b36c')), -0.82 + i * 0.15, 1.3, 0.05, false);
    loaf.rotation.z = Math.PI / 2; loaf.rotation.y = 0.2 * (i - 1.5);
  }
  for (let i = 0; i < 7; i++) cyl(breadG, 0.36, 0.36, 0.025, i % 2 ? '#f0dcae' : '#ead49a', 0.6, 1.03 + i * 0.027, 0.05, false, 18);

  // ---------- malzeme istasyonu ----------
  const vegG = counter(OBSTACLES.find((o) => o.id === 'veg'), '#8a8f96', '#d8dadd');
  const trays = [['#d63a2b', 'tomato'], ['#e8dcec', 'onion'], ['#79b34a', 'lettuce'], ['#4c7a2b', 'pickle'], ['#b9d65a', 'pepper']];
  trays.forEach(([c, kind], i) => {
    const tx = -1.2 + i * 0.6;
    box(vegG, 0.52, 0.1, 0.5, '#b8bcc2', tx, 1.05, 0.15, false);
    for (let k = 0; k < 6; k++) {
      const px = tx + (k % 3 - 1) * 0.14, pz = 0.15 + (Math.floor(k / 3) - 0.5) * 0.18;
      if (kind === 'pickle') { const p = add(vegG, new THREE.Mesh(capG(0.04, 0.14), mat(c)), px, 1.14, pz); p.rotation.z = Math.PI / 2; }
      else sph(vegG, kind === 'lettuce' ? 0.11 : 0.075, c, px, 1.14, pz, kind === 'onion' ? 0.7 : 0.8);
    }
  });
  for (const [i, c] of [[0, '#c92c1c'], [1, '#f4f0e6'], [2, '#d9a72c']]) {
    cyl(vegG, 0.06, 0.06, 0.28, c, -1.0 + i * 0.22, 1.14, -0.4);
    cyl(vegG, 0.025, 0.04, 0.08, '#2a2220', -1.0 + i * 0.22, 1.32, -0.4);
  }

  // ---------- patates kızartma ----------
  const fryG = counter(OBSTACLES.find((o) => o.id === 'fryer'), '#6a7077', '#2b2f34');
  for (const s of [-1, 1]) {
    box(fryG, 0.7, 0.12, 0.85, '#1e2024', s * 0.5, 1.05, 0.05);
    box(fryG, 0.6, 0.02, 0.75, '#c88a1c', s * 0.5, 1.12, 0.05).material = glow('#d99a2b');
    box(fryG, 0.5, 0.1, 0.5, '#9aa0a6', s * 0.5, 1.2, 0.05);
    box(fryG, 0.07, 0.07, 0.5, '#2a2220', s * 0.5, 1.22, 0.58);
  }
  for (let i = 0; i < 12; i++) box(fryG, 0.04, 0.04, 0.3, '#f0c040', -0.55 + (i % 4) * 0.07, 1.27 + Math.floor(i / 4) * 0.03, 0.05).rotation.y = i * 0.6;
  box(fryG, 1.7, 0.5, 0.9, '#9aa0a6', 0, 2.5, -0.2, true);
  box(fryG, 0.5, 1.2, 0.5, '#9aa0a6', 0, 3.1, -0.4, true);

  // ---------- içecek dolabı ----------
  const drinkO = OBSTACLES.find((o) => o.id === 'drinks');
  const dg = group(drinkO.x, drinkO.z);
  box(dg, 1.7, 2.1, 1.2, '#dfe9ee', 0, 1.05, 0, true);
  const fridgeGlass = new THREE.Mesh(new THREE.PlaneGeometry(1.45, 1.75), glow('#bfe9ff'));
  fridgeGlass.position.set(0, 1.12, 0.61); dg.add(fridgeGlass);
  for (let r = 0; r < 4; r++) {
    box(dg, 1.45, 0.03, 0.08, '#8aa0aa', 0, 0.45 + r * 0.45, 0.63);
    for (let k = 0; k < 5; k++) {
      const can = r === 3;
      cyl(dg, 0.07, 0.07, can ? 0.18 : 0.24, can ? '#c92c1c' : '#fbfbfb', -0.55 + k * 0.28, 0.58 + r * 0.45, 0.66, false, 8);
      if (!can) cyl(dg, 0.045, 0.06, 0.05, '#2e6fb5', -0.55 + k * 0.28, 0.72 + r * 0.45, 0.66, false, 8);
    }
  }
  box(dg, 1.5, 0.12, 0.06, '#2e6fb5', 0, 2.0, 0.62);

  // ---------- servis tezgâhı, kasa ----------
  const passG = counter(OBSTACLES.find((o) => o.id === 'pass'), '#b9482f', '#c8a26b');
  const bell = sph(passG, 0.1, '#d9a72c', 1.0, 1.05, 0.1, 0.7);
  bell.castShadow = false;
  const cashG = counter(OBSTACLES.find((o) => o.id === 'cashier'), '#b9482f', '#c8a26b');
  box(cashG, 0.55, 0.28, 0.42, '#2a2d33', -0.5, 1.2, 0, true);
  const scr = box(cashG, 0.4, 0.2, 0.03, '#000', -0.5, 1.45, 0.05);
  scr.material = glow('#7fe39a'); scr.rotation.x = -0.4;
  box(cashG, 0.2, 0.06, 0.14, '#3b3f47', 0.1, 1.07, 0.25);
  cyl(cashG, 0.1, 0.1, 0.2, '#d8e8ee', 0.7, 1.15, 0.1, false, 10);
  const kasa = sign(0.9, 0.34, ['KASA'], { font: 56 });
  kasa.position.set(0.55, 1.3, -0.3); cashG.add(kasa);

  // ---------- sipariş panosu ----------
  const ob = group(3, BOUNDS.minZ + 0.1);
  box(ob, 1.9, 1.4, 0.06, '#5b3a1e', 0, 2.1, 0);
  box(ob, 1.74, 1.24, 0.04, '#b98a58', 0, 2.1, 0.03);
  ['#fff6c8', '#ffd7e0', '#d6ecff', '#fff6c8', '#e2f5cf', '#ffd7e0'].forEach((c, i) => {
    const p = box(ob, 0.34, 0.42, 0.01, c, -0.55 + (i % 3) * 0.55, 2.3 - Math.floor(i / 3) * 0.55, 0.06);
    p.rotation.z = (i - 2.5) * 0.05;
  });

  // ---------- depo rafları ----------
  function shelf(o, flip) {
    const g = group(o.x, o.z);
    const crateColors = ['#a5703a', '#c28b4a', '#7d5a36'];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.06, 2.3, 0.06, '#4a3a2e', sx * (o.w / 2 - 0.05), 1.15, sz * (o.d / 2 - 0.05), true);
    for (let r = 0; r < 4; r++) {
      const y = 0.25 + r * 0.6;
      box(g, o.w, 0.05, o.d, '#8a6b4a', 0, y, 0, true);
      for (let k = 0; k < 3; k++) {
        const z = -o.d / 2 + 0.5 + k * ((o.d - 1) / 2);
        if ((r + k) % 3 === 0) cyl(g, 0.22, 0.2, 0.3, '#b87333', 0, y + 0.18, z); // bakır tencere
        else if ((r + k) % 3 === 1) box(g, o.w - 0.2, 0.3, 0.5, crateColors[(r + k) % 3], 0, y + 0.18, z, true);
        else sph(g, 0.22, '#e8dcc0', 0, y + 0.2, z, 0.8); // çuval
      }
    }
    if (flip) g.rotation.y = Math.PI;
  }
  shelf(OBSTACLES.find((o) => o.id === 'shelf_l'), false);
  shelf(OBSTACLES.find((o) => o.id === 'shelf_r'), false);

  // ---------- masalar, sandalyeler ----------
  const clothTex = canvasTex(64, 64, (g) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#d2381f';
    g.fillRect(0, 0, 32, 32); g.fillRect(32, 32, 32, 32);
  }, 3, 3, true);
  const clothM = new THREE.MeshLambertMaterial({ map: clothTex });
  const rugTex = canvasTex(128, 128, (g) => {
    g.fillStyle = '#7d1d12'; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#e8c27a'; g.lineWidth = 4; g.strokeRect(8, 8, 112, 112);
    g.fillStyle = '#2f7480'; g.beginPath(); g.moveTo(64, 22); g.lineTo(106, 64); g.lineTo(64, 106); g.lineTo(22, 64); g.closePath(); g.fill();
    g.fillStyle = '#e8c27a'; g.beginPath(); g.arc(64, 64, 14, 0, Math.PI * 2); g.fill();
  });
  const rugM = new THREE.MeshLambertMaterial({ map: rugTex });

  function chair(x, z, ox, oz) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = Math.atan2(-ox, -oz);
    root.add(g);
    box(g, 0.5, 0.06, 0.5, '#8a5a30', 0, 0.5, 0, true);
    box(g, 0.5, 0.55, 0.06, '#8a5a30', 0, 0.8, -0.22, true);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.05, 0.5, 0.05, '#4a3a2e', sx * 0.21, 0.25, sz * 0.21);
  }
  for (const o of OBSTACLES.filter((q) => q.id.startsWith('table'))) {
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), rugM);
    rug.rotation.x = -Math.PI / 2; rug.position.set(o.x, 0.012, o.z); rug.receiveShadow = true; root.add(rug);
    const g = group(o.x, o.z);
    const top = new THREE.Mesh(cylG(0.78, 0.78, 0.06, 20), clothM);
    add(g, top, 0, 0.82, 0, true);
    cyl(g, 0.08, 0.08, 0.8, '#3b2a22', 0, 0.4, 0, true, 8);
    cyl(g, 0.4, 0.4, 0.05, '#3b2a22', 0, 0.03, 0, false, 14);
    box(g, 0.14, 0.12, 0.1, '#cfd3d8', 0.2, 0.91, 0.1);
    cyl(g, 0.035, 0.035, 0.14, '#fbfbfb', -0.2, 0.92, -0.12, false, 8);
    for (const [ox, oz] of [[1.05, 0], [-1.05, 0], [0, 1.05], [0, -1.05]]) chair(o.x + ox, o.z + oz, ox, oz);
  }

  // ---------- bekleme alanı ----------
  const benchO = OBSTACLES.find((o) => o.id === 'bench');
  const bg = group(benchO.x, benchO.z);
  box(bg, 3.0, 0.12, 0.7, '#8a5a30', 0, 0.5, 0, true);
  box(bg, 3.0, 0.7, 0.1, '#8a5a30', 0, 0.9, 0.38, true);
  for (const sx of [-1.35, 1.35]) box(bg, 0.1, 0.5, 0.6, '#3b2a22', sx, 0.25, 0);
  for (const sx of [-0.8, 0.8]) box(bg, 0.9, 0.12, 0.6, '#d2381f', sx, 0.62, -0.02);

  function plant(x, z) {
    const g = group(x, z);
    cyl(g, 0.3, 0.22, 0.45, '#b4573a', 0, 0.22, 0, true);
    for (const [px, py, pz, r] of [[0, 0.8, 0, 0.4], [0.2, 1.1, 0.1, 0.3], [-0.2, 1.0, -0.1, 0.3]]) sph(g, r, '#3f8a3a', px, py, pz);
  }
  plant(-11.3, 7.3); plant(11.3, 3.4); plant(-11.3, 0.9);

  // ---------- ışıklar ----------
  const hemi = new THREE.HemisphereLight('#fff1dc', '#8a6a4e', 2.3);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff0d8', 2.6);
  sun.position.set(-8, 18, 10);
  sun.shadow.camera.left = -16; sun.shadow.camera.right = 16;
  sun.shadow.camera.top = 12; sun.shadow.camera.bottom = -12;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 50;
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun);
  const warm1 = new THREE.PointLight('#ffb35a', 14, 16, 2); warm1.position.set(-3, 2.9, -4); scene.add(warm1);
  const warm2 = new THREE.PointLight('#ffc98a', 10, 16, 2); warm2.position.set(2, 2.9, 5); scene.add(warm2);

  // ---------- API ----------
  const tmp = new THREE.Vector3();
  return {
    root,
    sun,
    setShadows(on, size) {
      sun.castShadow = on;
      if (on && sun.shadow.mapSize.x !== size) {
        sun.shadow.mapSize.set(size, size);
        sun.shadow.map?.dispose();
        sun.shadow.map = null;
      }
    },
    setEffects(on) { steam.visible = on; },
    setMeatLevel(f) { meatGroup.scale.y = 0.2 + 0.8 * Math.min(1, Math.max(0, f)); },
    update(dt, camPos, playerPositions) {
      for (const s of spinners) s.rotation.y += dt * 0.9;

      if (steam.visible) {
        for (let i = 0; i < STEAM_N; i++) {
          steamAge[i] += dt;
          steamPos[i * 3 + 1] += dt * 0.55;
          steamPos[i * 3] += Math.sin(steamAge[i] * 2 + i) * dt * 0.08;
          if (steamPos[i * 3 + 1] > 3.6) resetPuff(i);
        }
        steamGeo.attributes.position.needsUpdate = true;
      }

      let near = false;
      for (const p of playerPositions) if (Math.hypot(p.x - DOOR.x, p.z - DOOR.z) < 3.2) near = true;
      doorOpen += ((near ? 1 : 0) - doorOpen) * Math.min(1, dt * 5);
      for (const d of doorPanes) d.mesh.position.x = d.baseX + d.s * doorOpen * DOOR.halfWidth * 0.95;

      for (const w of walls) {
        tmp.copy(camPos).sub(w.center);
        const target = tmp.dot(w.normal) > 0 ? 0.1 : 1;
        w.op += (target - w.op) * Math.min(1, dt * 8);
        const solid = w.op > 0.98;
        for (const m of w.mats) { m.opacity = w.op; m.transparent = !solid; m.depthWrite = solid; }
      }
    },
  };
}
