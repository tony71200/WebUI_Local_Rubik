// SVG view of the circle puzzle. Reads the store, never writes state except by enqueueing moves.
import { FACE_NAMES, parseMove, type State } from '../core/cube.ts';
import { DOTS, RINGS } from '../core/rings.ts';
import type { Anim, Store } from '../store.ts';
import { onLangChange, t } from '../ui/i18n.ts';
import { ease } from './ease.ts';
import { dotPosition } from './ringPath.ts';

const NS = 'http://www.w3.org/2000/svg';
const DOT_RADIUS = 5;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

export interface RingsView {
  render(anim: Anim | null): void;
  setLabels(on: boolean): void;
}

export function createRings2D(svg: SVGSVGElement, store: Store, colors: string[]): RingsView {
  const rings = RINGS.map((ring) => {
    const g = el('g', { class: 'ring', tabindex: 0, role: 'button' });
    const circle = { cx: ring.center[0], cy: ring.center[1], r: ring.radius };
    g.append(el('circle', { ...circle, class: 'ring-line' }), el('circle', { ...circle, class: 'ring-hit' }));
    const turn = (prime: boolean) => store.enqueue(prime ? `${ring.name}'` : ring.name);
    g.addEventListener('click', (e) => turn(e.shiftKey));
    g.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      e.stopPropagation();
      turn(e.shiftKey);
    });
    svg.append(g);
    return { ring, g };
  });
  const label = () => rings.forEach(({ ring, g }) => g.setAttribute('aria-label', t('rings.turn', { name: ring.name })));
  label();
  onLangChange(label);

  const dots = DOTS.map(() => {
    const g = el('g', { class: 'dot' });
    const c = el('circle', { r: DOT_RADIUS });
    const text = el('text', { class: 'dot-label', 'text-anchor': 'middle', 'dominant-baseline': 'central' });
    g.append(c, text);
    svg.append(g);
    return { g, c, text };
  });

  let labels = false;
  let shownId = 0; // 0 = dots at rest

  const paint = (s: State) => dots.forEach((d, i) => {
    d.c.setAttribute('fill', colors[s[i]]);
    d.g.dataset.c = String(s[i]);
    d.text.textContent = labels ? FACE_NAMES[s[i]] : '';
  });

  const place = (anim: Anim | null) => dots.forEach((d, i) => {
    const [x, y] = anim ? dotPosition(anim.move, i, ease(anim.t)) : DOTS[i];
    d.g.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
  });

  const highlight = (anim: Anim | null) => {
    const info = anim && parseMove(anim.move);
    rings.forEach(({ ring, g }) => g.classList.toggle('active', !!info && info.axis === ring.axis && info.layers.includes(ring.layer)));
  };

  paint(store.state);
  place(null);
  store.subscribe((s) => paint(s));

  return {
    render(anim) {
      const id = anim?.id ?? 0;
      if (id === 0 && shownId === 0) return;
      place(anim);
      if (id !== shownId) highlight(anim);
      shownId = id;
    },
    setLabels(on) {
      labels = on;
      paint(store.state);
    },
  };
}
