// Circle-puzzle projection: 9 rings (3 families x 3 concentric) whose pairwise intersections are the 54 facelets.
import { FACELETS, type Axis, type Vec3 } from './cube.ts';

export type Point = readonly [number, number];
export type LayerName = 'U' | 'E' | 'D' | 'R' | 'M' | 'L' | 'F' | 'S' | 'B';

export interface Ring {
  name: LayerName;
  axis: Axis;
  layer: -1 | 0 | 1;
  ids: number[]; // 12 facelets, counter-clockwise about +axis; also increasing SVG angle
  center: Point;
  radius: number;
}

export const FAMILY_DISTANCE = 48;
export const RADII = [62, 80, 98] as const; // indexed by layer + 1

// Family centers for axes x, y, z (SVG coordinates, y grows downward)
export const FAMILY_CENTER: readonly Point[] = [-90, 30, 150].map((deg) => {
  const a = (deg * Math.PI) / 180;
  return [FAMILY_DISTANCE * Math.cos(a), FAMILY_DISTANCE * Math.sin(a)] as Point;
});

const LAYERS: [LayerName, Axis, -1 | 0 | 1][] = [
  ['U', 1, 1], ['E', 1, 0], ['D', 1, -1],
  ['R', 0, 1], ['M', 0, 0], ['L', 0, -1],
  ['F', 2, 1], ['S', 2, 0], ['B', 2, -1],
];

function angleAbout(v: Vec3, axis: Axis): number {
  const [x, y, z] = v;
  if (axis === 0) return Math.atan2(z, y);
  if (axis === 1) return Math.atan2(x, z);
  return Math.atan2(y, x);
}

const outward = (i: number): Vec3 => {
  const { p, n } = FACELETS[i];
  return [p[0] + n[0] / 2, p[1] + n[1] / 2, p[2] + n[2] / 2];
};

export const RINGS: readonly Ring[] = LAYERS.map(([name, axis, layer]) => {
  const ids = FACELETS.map((_, i) => i)
    .filter((i) => FACELETS[i].p[axis] === layer && FACELETS[i].n[axis] === 0)
    .sort((i, j) => angleAbout(outward(i), axis) - angleAbout(outward(j), axis));
  return { name, axis, layer, ids, center: FAMILY_CENTER[axis], radius: RADII[layer + 1] };
});

function intersect(c1: Point, r1: number, c2: Point, r2: number): [Point, Point] {
  const dx = c2[0] - c1[0], dy = c2[1] - c1[1], d = Math.hypot(dx, dy);
  const l = (r1 * r1 - r2 * r2 + d * d) / (2 * d), h = Math.sqrt(r1 * r1 - l * l);
  const mx = c1[0] + (l * dx) / d, my = c1[1] + (l * dy) / d;
  return [[mx + (h * dy) / d, my - (h * dx) / d], [mx - (h * dy) / d, my + (h * dx) / d]];
}

// A facelet lies on the rings of the two axes perpendicular to its normal.
// Faces with a negative normal (D, L, B) take the intersection nearer the origin.
export const DOTS: readonly Point[] = FACELETS.map(({ p, n }) => {
  const na = n.findIndex((c) => c !== 0);
  const [a1, a2] = ([0, 1, 2] as Axis[]).filter((a) => a !== na);
  const [q1, q2] = intersect(FAMILY_CENTER[a1], RADII[p[a1] + 1], FAMILY_CENTER[a2], RADII[p[a2] + 1]);
  const q1Inner = Math.hypot(...q1) < Math.hypot(...q2);
  return n[na] < 0 === q1Inner ? q1 : q2;
});

export function ringOf(axis: Axis, facelet: number): Ring | undefined {
  return RINGS.find((r) => r.axis === axis && r.ids.includes(facelet));
}
