import * as THREE from 'three';

// Paylaşılan geometri/malzemeler: her oyuncu için yeniden oluşturulmaz.
const G = {
  body: new THREE.BoxGeometry(0.62, 0.7, 0.36),
  head: new THREE.SphereGeometry(0.27, 14, 12),
  limb: new THREE.BoxGeometry(0.2, 0.62, 0.2),
  leg: new THREE.BoxGeometry(0.24, 0.55, 0.26),
  cap: new THREE.CylinderGeometry(0.25, 0.28, 0.2, 14),
  apron: new THREE.BoxGeometry(0.5, 0.52, 0.04),
  mustache: new THREE.BoxGeometry(0.22, 0.05, 0.05),
  eye: new THREE.SphereGeometry(0.035, 6, 6),
  shadow: new THREE.CircleGeometry(0.42, 16),
};
const M = {
  skin: new THREE.MeshLambertMaterial({ color: '#f1c7a0' }),
  white: new THREE.MeshLambertMaterial({ color: '#fbf7ee' }),
  dark: new THREE.MeshLambertMaterial({ color: '#2a2220' }),
  pants: new THREE.MeshLambertMaterial({ color: '#33363f' }),
  blob: new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.22, depthWrite: false }),
};

function makeLabel(text) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 30px "Trebuchet MS", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const w = Math.min(244, g.measureText(text).width + 28);
  g.fillStyle = 'rgba(30,18,12,0.78)';
  g.beginPath(); g.roundRect((256 - w) / 2, 8, w, 48, 14); g.fill();
  g.fillStyle = '#fff4e3';
  g.fillText(text, 128, 33, 230);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(1.9, 0.475, 1);
  spr.renderOrder = 10;
  return spr;
}

// Yürüme / çalışma / bekleme animasyonlu basit stilize dönerci karakteri.
export class Character {
  constructor({ name, color }) {
    this.group = new THREE.Group();
    this.model = new THREE.Group();
    this.group.add(this.model);
    this.shirtMat = new THREE.MeshLambertMaterial({ color });

    const blob = new THREE.Mesh(G.shadow, M.blob);
    blob.rotation.x = -Math.PI / 2; blob.position.y = 0.02;
    this.group.add(blob);

    this.legL = this.pivot(G.leg, M.pants, -0.15, 0.58, 0, -0.27);
    this.legR = this.pivot(G.leg, M.pants, 0.15, 0.58, 0, -0.27);
    const body = new THREE.Mesh(G.body, this.shirtMat);
    body.position.y = 0.93; body.castShadow = true;
    const apron = new THREE.Mesh(G.apron, M.white);
    apron.position.set(0, 0.88, 0.2);
    this.armL = this.pivot(G.limb, this.shirtMat, -0.42, 1.2, 0, -0.26);
    this.armR = this.pivot(G.limb, this.shirtMat, 0.42, 1.2, 0, -0.26);
    const head = new THREE.Mesh(G.head, M.skin);
    head.position.y = 1.55; head.castShadow = true;
    const cap = new THREE.Mesh(G.cap, M.white);
    cap.position.y = 1.78;
    const mus = new THREE.Mesh(G.mustache, M.dark);
    mus.position.set(0, 1.5, 0.25);
    const eyeL = new THREE.Mesh(G.eye, M.dark); eyeL.position.set(-0.09, 1.6, 0.25);
    const eyeR = new THREE.Mesh(G.eye, M.dark); eyeR.position.set(0.09, 1.6, 0.25);
    this.model.add(body, apron, head, cap, mus, eyeL, eyeR);

    this.label = makeLabel(name);
    this.label.position.y = 2.35;
    this.group.add(this.label);

    this.phase = 0;
    this.speed = 0;
    this.workT = 0;
    this.t = Math.random() * 10;
  }

  pivot(geo, mat, x, y, z, offY) {
    const p = new THREE.Group();
    p.position.set(x, y, z);
    const m = new THREE.Mesh(geo, mat);
    m.position.y = offY; m.castShadow = true;
    p.add(m);
    this.model.add(p);
    return p;
  }

  setColor(color) { this.shirtMat.color.set(color); }
  playWork(seconds = 1.2) { this.workT = seconds; }
  setPosition(x, z) { this.group.position.set(x, 0, z); }
  setFacing(r) { this.model.rotation.y = r; }

  // speed: gerçek yer hızı (birim/sn). Bacak salınımı hıza bağlı olduğu için kayma olmaz.
  update(dt, speed) {
    this.t += dt;
    this.speed += (speed - this.speed) * Math.min(1, dt * 12);
    const moving = this.speed > 0.25;
    if (moving) this.phase += dt * this.speed * 2.6;
    const swing = moving ? Math.min(1, this.speed / 4) * 0.8 : 0;
    const s = Math.sin(this.phase);
    this.legL.rotation.x = s * swing;
    this.legR.rotation.x = -s * swing;

    if (this.workT > 0) {
      this.workT -= dt;
      const w = Math.sin(this.t * 16);
      this.armL.rotation.x = -1.1 + w * 0.35;
      this.armR.rotation.x = -1.1 - w * 0.35;
      this.model.position.y = 0;
    } else {
      this.armL.rotation.x = -s * swing * 0.9;
      this.armR.rotation.x = s * swing * 0.9;
      this.model.position.y = moving ? Math.abs(s) * 0.05 : Math.sin(this.t * 2) * 0.012;
    }
  }

  dispose() {
    this.label.material.map.dispose();
    this.label.material.dispose();
    this.shirtMat.dispose();
  }
}
