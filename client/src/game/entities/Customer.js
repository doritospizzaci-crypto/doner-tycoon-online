import * as THREE from 'three';

const G = {
  body: new THREE.BoxGeometry(0.55, 0.65, 0.32),
  head: new THREE.SphereGeometry(0.24, 12, 10),
  limb: new THREE.BoxGeometry(0.16, 0.55, 0.16),
  leg: new THREE.BoxGeometry(0.2, 0.5, 0.22),
  eye: new THREE.SphereGeometry(0.03, 6, 6),
  shadow: new THREE.CircleGeometry(0.38, 14),
  plate: new THREE.CylinderGeometry(0.18, 0.18, 0.04, 12),
};
const M = {
  skin: new THREE.MeshLambertMaterial({ color: '#e8b890' }),
  pants: new THREE.MeshLambertMaterial({ color: '#3a3d48' }),
  dark: new THREE.MeshLambertMaterial({ color: '#2a2220' }),
  plate: new THREE.MeshLambertMaterial({ color: '#f0e8d8' }),
  food: new THREE.MeshLambertMaterial({ color: '#c4783a' }),
  blob: new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.2, depthWrite: false }),
};

function makeLabel(text) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 28px "Trebuchet MS", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const w = Math.min(244, g.measureText(text).width + 24);
  g.fillStyle = 'rgba(20,14,10,0.75)';
  g.beginPath(); g.roundRect((256 - w) / 2, 10, w, 44, 12); g.fill();
  g.fillStyle = '#fff4e3';
  g.fillText(text, 128, 33, 230);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(1.6, 0.4, 1);
  spr.renderOrder = 10;
  return spr;
}

function makeBubble(text) {
  const c = document.createElement('canvas');
  c.width = 320; c.height = 80;
  const g = c.getContext('2d');
  g.font = 'bold 26px "Trebuchet MS", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const tw = Math.min(300, g.measureText(text).width + 28);
  g.fillStyle = 'rgba(255,248,230,0.95)';
  g.strokeStyle = '#c8803a';
  g.lineWidth = 3;
  g.beginPath(); g.roundRect((320 - tw) / 2, 8, tw, 50, 14); g.fill(); g.stroke();
  // kuyruk
  g.beginPath();
  g.moveTo(160 - 8, 58); g.lineTo(160, 72); g.lineTo(160 + 8, 58);
  g.fillStyle = 'rgba(255,248,230,0.95)'; g.fill();
  g.fillStyle = '#2a1a14';
  g.fillText(text, 160, 34, 290);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(2.2, 0.55, 1);
  spr.renderOrder = 12;
  spr.visible = false;
  return spr;
}

export class Customer {
  constructor({ name, color }) {
    this.group = new THREE.Group();
    this.model = new THREE.Group();
    this.group.add(this.model);
    this.shirtMat = new THREE.MeshLambertMaterial({ color: color || '#4a7c9b' });
    this.name = name;

    const blob = new THREE.Mesh(G.shadow, M.blob);
    blob.rotation.x = -Math.PI / 2; blob.position.y = 0.02;
    this.group.add(blob);

    this.legL = this.pivot(G.leg, M.pants, -0.13, 0.52, 0, -0.24);
    this.legR = this.pivot(G.leg, M.pants, 0.13, 0.52, 0, -0.24);
    const body = new THREE.Mesh(G.body, this.shirtMat);
    body.position.y = 0.88; body.castShadow = true;
    this.armL = this.pivot(G.limb, this.shirtMat, -0.36, 1.1, 0, -0.22);
    this.armR = this.pivot(G.limb, this.shirtMat, 0.36, 1.1, 0, -0.22);
    const head = new THREE.Mesh(G.head, M.skin);
    head.position.y = 1.42; head.castShadow = true;
    const eyeL = new THREE.Mesh(G.eye, M.dark); eyeL.position.set(-0.08, 1.46, 0.22);
    const eyeR = new THREE.Mesh(G.eye, M.dark); eyeR.position.set(0.08, 1.46, 0.22);
    this.model.add(body, head, eyeL, eyeR);

    this.plate = new THREE.Group();
    const plateMesh = new THREE.Mesh(G.plate, M.plate);
    plateMesh.position.y = 0.9;
    const food = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.1), M.food);
    food.position.set(0, 0.96, 0);
    this.plate.add(plateMesh, food);
    this.plate.visible = false;
    this.plate.position.set(0.28, 0, 0.28);
    this.group.add(this.plate);

    this.label = makeLabel(name);
    this.label.position.y = 2.05;
    this.group.add(this.label);

    this.bubbleSpr = makeBubble('…');
    this.bubbleSpr.position.y = 2.55;
    this.group.add(this.bubbleSpr);
    this._bubbleText = '';

    this.phase = 0;
    this.speed = 0;
    this.t = Math.random() * 10;
    this.seated = false;
  }

  pivot(geo, mat, x, y, z, jointY) {
    const p = new THREE.Group();
    p.position.set(x, y, z);
    const m = new THREE.Mesh(geo, mat);
    m.position.y = jointY;
    m.castShadow = true;
    p.add(m);
    this.model.add(p);
    return p;
  }

  setPosition(x, z) {
    this.group.position.x = x;
    this.group.position.z = z;
  }

  setFacing(r) { this.model.rotation.y = r; }

  setSeated(on) {
    this.seated = on;
    if (on) {
      this.legL.rotation.x = -Math.PI / 2.2;
      this.legR.rotation.x = -Math.PI / 2.2;
      this.model.position.y = -0.18;
      this.armL.rotation.x = -0.35;
      this.armR.rotation.x = -0.35;
    } else {
      this.legL.rotation.x = 0;
      this.legR.rotation.x = 0;
      this.model.position.y = 0;
    }
  }

  setHasFood(on) { this.plate.visible = !!on; }

  setBubble(text) {
    if (!text) {
      this.bubbleSpr.visible = false;
      this._bubbleText = '';
      return;
    }
    if (text === this._bubbleText) {
      this.bubbleSpr.visible = true;
      return;
    }
    this._bubbleText = text;
    // yeniden çiz
    const c = document.createElement('canvas');
    c.width = 320; c.height = 80;
    const g = c.getContext('2d');
    g.font = 'bold 24px "Trebuchet MS", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const tw = Math.min(300, g.measureText(text).width + 28);
    g.fillStyle = 'rgba(255,248,230,0.95)';
    g.strokeStyle = '#c8803a';
    g.lineWidth = 3;
    g.beginPath(); g.roundRect((320 - tw) / 2, 8, tw, 50, 14); g.fill(); g.stroke();
    g.beginPath();
    g.moveTo(160 - 8, 58); g.lineTo(160, 72); g.lineTo(160 + 8, 58);
    g.fillStyle = 'rgba(255,248,230,0.95)'; g.fill();
    g.fillStyle = '#2a1a14';
    g.fillText(text, 160, 34, 290);
    const old = this.bubbleSpr.material.map;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.bubbleSpr.material.map = tex;
    this.bubbleSpr.material.needsUpdate = true;
    old?.dispose();
    this.bubbleSpr.visible = true;
  }

  update(dt, speed) {
    this.t += dt;
    this.speed = speed;
    if (this.seated) {
      this.armR.rotation.x = -0.35 + Math.sin(this.t * 2.2) * 0.18;
      if (this.plate.visible) {
        // yemek yerken hafif eğil
        this.model.rotation.x = Math.sin(this.t * 1.8) * 0.04;
      }
      return;
    }
    this.model.rotation.x = 0;
    this.phase += dt * Math.min(12, 6 + speed * 3);
    const swing = Math.sin(this.phase) * Math.min(0.7, speed * 0.25);
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.7;
    this.armR.rotation.x = swing * 0.7;
  }

  dispose() {
    this.label.material.map?.dispose();
    this.label.material.dispose();
    this.bubbleSpr.material.map?.dispose();
    this.bubbleSpr.material.dispose();
    this.shirtMat.dispose();
  }
}
