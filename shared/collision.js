import { BOUNDS, OBSTACLES } from './layout.js';

export function clampToBounds(x, z, r = 0) {
  return {
    x: Math.min(BOUNDS.maxX - r, Math.max(BOUNDS.minX + r, x)),
    z: Math.min(BOUNDS.maxZ - r, Math.max(BOUNDS.minZ + r, z)),
  };
}

// Daire - kutu carpismasi: daireyi kutudan disari iter.
export function resolveCollisions(x, z, r, obstacles = OBSTACLES) {
  for (let pass = 0; pass < 3; pass++) {
    for (const o of obstacles) {
      const hx = o.w / 2, hz = o.d / 2;
      const cx = Math.max(o.x - hx, Math.min(x, o.x + hx));
      const cz = Math.max(o.z - hz, Math.min(z, o.z + hz));
      let dx = x - cx, dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * r;
        z = cz + (dz / d) * r;
      } else {
        // merkez kutunun icinde: en yakin kenara it
        const left = x - (o.x - hx), right = o.x + hx - x;
        const up = z - (o.z - hz), down = o.z + hz - z;
        const m = Math.min(left, right, up, down);
        if (m === left) x = o.x - hx - r;
        else if (m === right) x = o.x + hx + r;
        else if (m === up) z = o.z - hz - r;
        else z = o.z + hz + r;
      }
    }
    const c = clampToBounds(x, z, r);
    x = c.x; z = c.z;
  }
  return { x, z };
}

export function nearestStation(x, z, stations) {
  let best = null, bestD = Infinity;
  for (const s of stations) {
    const d = Math.hypot(x - s.x, z - s.z);
    if (d <= s.r && d < bestD) { best = s; bestD = d; }
  }
  return best;
}
