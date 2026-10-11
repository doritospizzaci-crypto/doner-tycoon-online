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

export class Customer {
  constructor({ name, color }) {
    this.group = new THREE.Group();
    this.model = new THREE.Group();
    this.group.add(this.model);
    this.shirtMat = new THREE.MeshLambertMaterial({ color: color || '#4a7c9b' });

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

    // tabak (yemek gelince görünür)
    this.plate = new THREE.Group();
    const plateMesh = new THREE.Mesh(G.plate, M.plate);
    plateMesh.position.y = 0.9;
    const food = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.1), M.food);
    food.position.set(0, 0.96, 0);
    this.plate.add(plateMesh, food);
    this.plate.visible = false;
    this.plate.position.set(0.35, 0, 0.35);
    this.group.add(this.plate);

    this.label = makeLabel(name);
    this.label.position.y = 2.1;
    this.group.add(this.label);

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

  setFacing(r) {
    this.model.rotation.y = r;
  }

  setSeated(on) {
    this.seated = on;
    if (on) {
      // oturma: bacaklar öne, gövde biraz aşağı
      this.legL.rotation.x = -Math.PI / 2.2;
      this.legR.rotation.x = -Math.PI / 2.2;
      this.model.position.y = -0.15;
      this.armL.rotation.x = -0.4;
      this.armR.rotation.x = -0.4;
    } else {
      this.legL.rotation.x = 0;
      this.legR.rotation.x = 0;
      this.model.position.y = 0;
    }
  }

  setHasFood(on) {
    this.plate.visible = !!on;
  }

  update(dt, speed) {
    this.t += dt;
    this.speed = speed;
    if (this.seated) {
      // hafif nefes / yemek animasyonu
      this.armR.rotation.x = -0.4 + Math.sin(this.t * 2.5) * 0.15;
      return;
    }
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
    this.shirtMat.dispose();
  }
}
