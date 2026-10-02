import { expect, it } from 'vitest';
import { FACELETS, moveDestinations } from '../core/cube.ts';
import { candidateDirs, dragToMove } from './drag.ts';

it('maps drags on the front face to the expected moves', () => {
  expect(dragToMove([0, 0, 1], [1, 1, 1], [0, 1, 0])).toBe('R'); // right column up
  expect(dragToMove([0, 0, 1], [1, 1, 1], [1, 0, 0])).toBe("U'"); // top row right
  expect(dragToMove([0, 0, 1], [0, 0, 1], [0, -1, 0])).toBe('M'); // middle column down
  expect(dragToMove([0, 1, 0], [-1, 1, 0], [0, 0, 1])).toBe('L'); // up face, left column toward the front
});

it('always moves the grabbed sticker toward the drag direction', () => {
  const surface = (i: number) => FACELETS[i].p.map((c, k) => c + FACELETS[i].n[k] / 2);
  FACELETS.forEach((f, i) => {
    for (const d of candidateDirs(f.n)) {
      const j = moveDestinations(dragToMove(f.n, f.p, d)!)[i];
      const a = surface(i), b = surface(j);
      expect((b[0] - a[0]) * d[0] + (b[1] - a[1]) * d[1] + (b[2] - a[2]) * d[2]).toBeGreaterThan(0);
    }
  });
});

it('offers 4 in-plane directions', () => {
  expect(candidateDirs([0, 0, 1])).toEqual([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]]);
});
