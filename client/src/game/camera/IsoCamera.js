import * as THREE from 'three';

// Hafif izometrik üstten kamera: oyuncuyu yumuşak takip eder, sürükle = döndür, tekerlek/çimdik = yakınlaştır.
export class IsoCamera {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.enabled = true;
    this.yaw = 0;
    this.elevation = THREE.MathUtils.degToRad(54);
    this.distance = 18;
    this.minDist = 9;
    this.maxDist = 30;
    this.target = new THREE.Vector3(0, 0, 0);
    this.goal = new THREE.Vector3(0, 0, 0);
    this.pointers = new Map();
    this.pinchBase = 0;

    dom.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      dom.setPointerCapture(e.pointerId);
      if (this.pointers.size === 2) this.pinchBase = this.pinchDist();
    });
    dom.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p || !this.enabled) return;
      const dx = e.clientX - p.x;
      p.x = e.clientX; p.y = e.clientY;
      if (this.pointers.size === 1) {
        this.yaw -= dx * 0.006;
      } else if (this.pointers.size === 2) {
        const d = this.pinchDist();
        if (this.pinchBase > 0) this.zoomBy(this.pinchBase / d);
        this.pinchBase = d;
      }
    });
    const up = (e) => { this.pointers.delete(e.pointerId); this.pinchBase = 0; };
    dom.addEventListener('pointerup', up);
    dom.addEventListener('pointercancel', up);
    dom.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      this.zoomBy(Math.exp(e.deltaY * 0.0012));
    }, { passive: false });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  pinchDist() {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y) || 1;
  }

  zoomBy(f) { this.distance = THREE.MathUtils.clamp(this.distance * f, this.minDist, this.maxDist); }

  setEnabled(v) { this.enabled = v; if (!v) this.pointers.clear(); }

  follow(x, z) { this.goal.set(x, 0.8, z); }

  snap() { this.target.copy(this.goal); this.apply(); }

  update(dt) {
    this.target.lerp(this.goal, 1 - Math.exp(-6 * dt));
    this.apply();
  }

  apply() {
    const c = Math.cos(this.elevation) * this.distance;
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * c,
      this.target.y + Math.sin(this.elevation) * this.distance,
      this.target.z + Math.cos(this.yaw) * c,
    );
    this.camera.lookAt(this.target);
  }

  // Ekrandaki "ileri" yönü (yere izdüşüm). Hareket kameraya göre hesaplanır.
  forward() { return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) }; }
  right() { return { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) }; }
}
