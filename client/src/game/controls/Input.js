// Klavye + sanal joystick girdisi. getMove() ekran yönünde {x: sağ, y: ileri} döner.
export class Input {
  constructor() {
    this.keys = new Set();
    this.enabled = true;
    this.joy = { x: 0, y: 0 };
    this.onInteract = null;
    this.onMenu = null;
    this.onChat = null;

    window.addEventListener('keydown', (e) => {
      const typing = ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName);
      if (e.code === 'Escape') { this.onMenu?.(); return; }
      if (typing) return;
      if (e.code === 'Enter') { e.preventDefault(); this.onChat?.(); return; }
      if (!this.enabled) return;
      this.keys.add(e.code);
      if (e.code === 'KeyE' && !e.repeat) this.onInteract?.();
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  getMove() {
    if (!this.enabled) return { x: 0, y: 0 };
    let x = this.joy.x, y = this.joy.y;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y };
  }
}

export function setupJoystick(input, root, knob) {
  let pid = null;
  const R = 44;
  const set = (e) => {
    const b = root.getBoundingClientRect();
    let dx = e.clientX - (b.left + b.width / 2);
    let dy = e.clientY - (b.top + b.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > R) { dx = (dx / len) * R; dy = (dy / len) * R; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const dead = 0.12;
    let jx = dx / R, jy = -dy / R;
    if (Math.hypot(jx, jy) < dead) { jx = 0; jy = 0; }
    input.joy.x = jx; input.joy.y = jy;
  };
  const end = () => { pid = null; knob.style.transform = ''; input.joy.x = 0; input.joy.y = 0; };
  root.addEventListener('pointerdown', (e) => { pid = e.pointerId; root.setPointerCapture(pid); set(e); e.preventDefault(); });
  root.addEventListener('pointermove', (e) => { if (e.pointerId === pid) set(e); });
  root.addEventListener('pointerup', (e) => { if (e.pointerId === pid) end(); });
  root.addEventListener('pointercancel', end);
}
