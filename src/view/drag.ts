// Turn a drag on a sticker into a layer move.
import { layerMove, type Axis, type Move, type Vec3 } from '../core/cube.ts';

// normal: outward normal of the grabbed facelet; cubie: its cubie position;
// dir: axis-aligned unit vector (cube coordinates) the sticker should travel along.
// The turn axis is normal x dir, so the sticker moves exactly along dir.
export function dragToMove(normal: Vec3, cubie: Vec3, dir: Vec3): Move | null {
  const w: Vec3 = [
    normal[1] * dir[2] - normal[2] * dir[1],
    normal[2] * dir[0] - normal[0] * dir[2],
    normal[0] * dir[1] - normal[1] * dir[0],
  ];
  const axis = w.findIndex((c) => c !== 0) as Axis | -1;
  if (axis === -1) return null;
  return layerMove(axis, cubie[axis], w[axis] > 0 ? 1 : -1);
}

// The 4 in-plane directions a sticker with this normal can move along.
export function candidateDirs(normal: Vec3): Vec3[] {
  const out: Vec3[] = [];
  for (let a = 0; a < 3; a++) {
    if (normal[a] !== 0) continue;
    for (const s of [1, -1]) {
      const v: [number, number, number] = [0, 0, 0];
      v[a] = s;
      out.push(v);
    }
  }
  return out;
}
