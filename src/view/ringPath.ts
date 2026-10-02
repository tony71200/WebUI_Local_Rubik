// Where each dot is drawn while a move animates (t = eased progress 0..1).
import { moveDestinations, parseMove, type Move } from '../core/cube.ts';
import { DOTS, ringOf, type Point } from '../core/rings.ts';

const TAU = Math.PI * 2;
const angle = (p: Point, c: Point) => Math.atan2(p[1] - c[1], p[0] - c[0]);

// Angle from `from` to `to`, going the way `sign` says (full circle allowed).
function sweep(from: number, to: number, sign: number): number {
  let d = (to - from) % TAU;
  if (sign > 0 && d <= 0) d += TAU;
  if (sign < 0 && d >= 0) d -= TAU;
  return d;
}

function shortest(from: number, to: number): number {
  const d = (((to - from) % TAU) + TAU) % TAU;
  return d > Math.PI ? d - TAU : d;
}

// Sense in which a face cluster turns on screen: read off its corner dot under a quarter turn.
function faceSense(move: Move, face: number): number {
  const quarter = move.endsWith('2') ? move[0] : move;
  const c = DOTS[face * 9 + 4];
  const i = face * 9;
  return Math.sign(shortest(angle(DOTS[i], c), angle(DOTS[moveDestinations(quarter)[i]], c))) || 1;
}

export function dotPosition(move: Move, i: number, t: number): Point {
  const j = moveDestinations(move)[i];
  if (j === i || t <= 0) return DOTS[i];
  if (t >= 1) return DOTS[j];
  const info = parseMove(move);
  const ring = ringOf(info.axis, i);
  if (ring && info.layers.includes(ring.layer)) {
    const c = ring.center;
    const a = angle(DOTS[i], c) + sweep(angle(DOTS[i], c), angle(DOTS[j], c), info.dir) * t;
    return [c[0] + ring.radius * Math.cos(a), c[1] + ring.radius * Math.sin(a)];
  }
  const face = Math.floor(i / 9);
  const c = DOTS[face * 9 + 4];
  const a = angle(DOTS[i], c) + sweep(angle(DOTS[i], c), angle(DOTS[j], c), faceSense(move, face)) * t;
  const r0 = Math.hypot(DOTS[i][0] - c[0], DOTS[i][1] - c[1]);
  const r1 = Math.hypot(DOTS[j][0] - c[0], DOTS[j][1] - c[1]);
  const r = r0 + (r1 - r0) * t;
  return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];
}
