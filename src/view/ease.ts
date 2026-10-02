// cubic-bezier(0.16, 1, 0.3, 1): the motion curve from DESIGN.md
const X1 = 0.16, Y1 = 1, X2 = 0.3, Y2 = 1;
const bez = (s: number, a: number, b: number) => 3 * (1 - s) * (1 - s) * s * a + 3 * (1 - s) * s * s * b + s * s * s;

export function ease(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  let lo = 0, hi = 1;
  for (let k = 0; k < 30; k++) {
    const mid = (lo + hi) / 2;
    if (bez(mid, X1, X2) < t) lo = mid; else hi = mid;
  }
  return bez((lo + hi) / 2, Y1, Y2);
}
