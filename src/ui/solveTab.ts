// Tab "Giải": paint a cube, validate it, solve it in the worker, then step through the solution.
import { toCubie, type ValidationError } from '../core/cubie.ts';
import type { SolverClient, SolverStatus } from '../solver/client.ts';
import type { SolveMethod, StageMoves } from '../solver/protocol.ts';
import type { Store } from '../store.ts';
import { onLangChange, t, type Key } from './i18n.ts';
import { createNetEditor } from './netEditor.ts';
import type { Playback, PlaybackState } from './playback.ts';

export interface SolveTabDeps {
  store: Store;
  solver: SolverClient;
  playback: Playback;
  colors: string[];
  setSpeed(multiplier: number): void;
}

const SPEEDS = [0.5, 1, 2, 3];

function errorText(e: ValidationError): string {
  switch (e.kind) {
    case 'empty': return t('err.empty', { n: e.cells.length });
    case 'count': return t('err.count', { color: t(`color.${e.color}` as Key), count: e.count });
    default: return t(`err.${e.kind}` as Key);
  }
}

const ICONS = {
  restart: '<path d="M4 3v10M13 3 6 8l7 5z" fill="currentColor"/>',
  prev: '<path d="M12 3 5 8l7 5z" fill="currentColor"/>',
  play: '<path d="M5 3l8 5-8 5z" fill="currentColor"/>',
  pause: '<path d="M4 3h3v10H4zM9 3h3v10H9z" fill="currentColor"/>',
  next: '<path d="M4 3l7 5-7 5z" fill="currentColor"/><path d="M12 3v10" stroke="currentColor" stroke-width="2"/>',
};
const icon = (name: keyof typeof ICONS) => `<svg viewBox="0 0 16 16" aria-hidden="true">${ICONS[name]}</svg>`;

export function createSolveTab({ store, solver, playback, colors, setSpeed }: SolveTabDeps): HTMLElement {
  const panel = document.createElement('div');
  panel.innerHTML = `
    <p class="lbl" data-i18n="solve.netTitle"></p>
    <div class="net-slot"></div>
    <div class="row-actions">
      <button type="button" class="btn" data-act="from-cube" data-i18n="solve.fromCube"></button>
      <button type="button" class="btn" data-act="clear" data-i18n="solve.clear"></button>
    </div>
    <p class="hint" data-i18n="solve.hint"></p>
    <div class="alert danger" role="alert" hidden><ul class="errors"></ul></div>
    <p class="lbl" data-i18n="solve.method"></p>
    <div class="seg" role="radiogroup" data-i18n-aria="solve.method">
      <button type="button" class="btn" role="radio" data-method="kociemba" data-i18n="solve.kociemba"></button>
      <button type="button" class="btn" role="radio" data-method="lbl" data-i18n="solve.lbl"></button>
    </div>
    <button type="button" class="cta" data-act="solve" data-i18n="solve.solve"></button>
    <p class="hint solver-status" aria-live="polite"></p>
    <section class="solution" hidden>
      <p class="lbl"><span data-i18n="solve.steps"></span> · <span class="mono move-count"></span></p>
      <div class="steps"></div>
      <div class="player">
        <button type="button" class="btn icon" data-act="restart" data-i18n-aria="player.restart">${icon('restart')}</button>
        <button type="button" class="btn icon" data-act="prev" data-i18n-aria="player.prev">${icon('prev')}</button>
        <button type="button" class="btn icon" data-act="toggle"></button>
        <button type="button" class="btn icon" data-act="next" data-i18n-aria="player.next">${icon('next')}</button>
        <label class="speed"><span data-i18n="player.speed"></span>
          <select data-act="speed">${SPEEDS.map((s) => `<option value="${s}"${s === 1 ? ' selected' : ''}>${s}×</option>`).join('')}</select>
        </label>
      </div>
      <p class="alert warning stale" hidden data-i18n="solve.stale"></p>
    </section>`;

  const q = <T extends HTMLElement>(sel: string) => panel.querySelector<T>(sel)!;
  const net = createNetEditor(colors);
  q('.net-slot').replaceWith(net.el);
  const alertBox = q('.alert.danger');
  const errorList = q('.errors');
  const status = q('.solver-status');
  const solution = q('.solution');
  const steps = q('.steps');
  const toggleBtn = q<HTMLButtonElement>('[data-act="toggle"]');
  const methodBtns = [...panel.querySelectorAll<HTMLButtonElement>('[data-method]')];
  let method: SolveMethod = 'kociemba';
  let stages: StageMoves[] | null = null; // LBL groups for the loaded solution
  const showMethod = () => methodBtns.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.method === method)));
  methodBtns.forEach((b) => b.addEventListener('click', () => { method = b.dataset.method as SolveMethod; showMethod(); }));
  showMethod();

  const showErrors = (errors: ValidationError[]) => {
    errorList.innerHTML = '';
    for (const e of errors) {
      const li = document.createElement('li');
      li.textContent = errorText(e);
      errorList.append(li);
    }
    alertBox.hidden = errors.length === 0;
    net.mark(errors.flatMap((e) => e.cells));
  };

  const showStatus = (s: SolverStatus) => {
    status.textContent = s.kind === 'loading' ? t('solve.loading', { pct: Math.round((100 * s.done) / s.total) })
      : s.kind === 'ready' ? t('solve.ready', { ms: s.ms })
      : t('solve.failed');
  };

  const renderPlayback = (s: PlaybackState) => {
    solution.hidden = false;
    q('.move-count').textContent = s.moves.length ? t('solve.count', { n: s.moves.length }) : t('solve.alreadySolved');
    steps.innerHTML = '';
    steps.classList.toggle('grouped', !!stages);
    const chip = (m: string, i: number) => {
      const el = document.createElement('span');
      el.className = `step${i < s.index - 1 ? ' done' : ''}${i === s.index - 1 ? ' on' : ''}`;
      el.textContent = m;
      return el;
    };
    if (!stages) s.moves.forEach((m, i) => steps.append(chip(m, i)));
    let offset = 0;
    for (const st of stages ?? []) {
      if (!st.moves.length) continue;
      const box = document.createElement('div');
      const current = s.index - 1 >= offset && s.index - 1 < offset + st.moves.length;
      box.className = `stage${current ? ' current' : ''}`;
      box.innerHTML = `<p class="stage-title"><span></span> · <span class="mono"></span></p><p class="hint"></p><div class="stage-steps"></div>`;
      box.querySelector('.stage-title span')!.textContent = t(`lbl.${st.id}` as Key);
      box.querySelector('.stage-title .mono')!.textContent = String(st.moves.length);
      box.querySelector('.hint')!.textContent = t(`lbl.${st.id}.hint` as Key);
      const row = box.querySelector('.stage-steps')!;
      st.moves.forEach((m, j) => row.append(chip(m, offset + j)));
      steps.append(box);
      offset += st.moves.length;
    }
    steps.querySelector('.step.on')?.scrollIntoView({ block: 'nearest' });
    toggleBtn.innerHTML = icon(s.playing ? 'pause' : 'play');
    toggleBtn.setAttribute('aria-label', t(s.playing ? 'player.pause' : 'player.play'));
    q('.stale').hidden = !s.stale;
  };

  net.onChange(() => showErrors([]));
  solver.onStatus(showStatus);
  showStatus(solver.status());
  playback.onChange(renderPlayback);
  onLangChange(() => {
    showStatus(solver.status());
    if (!solution.hidden) renderPlayback(playback.state);
  });

  q('[data-act="from-cube"]').addEventListener('click', () => net.set(store.state));
  q('[data-act="clear"]').addEventListener('click', () => net.clear());
  q('[data-act="restart"]').addEventListener('click', () => playback.restart());
  q('[data-act="prev"]').addEventListener('click', () => playback.prev());
  q('[data-act="next"]').addEventListener('click', () => playback.next());
  toggleBtn.addEventListener('click', () => playback.toggle());
  q<HTMLSelectElement>('[data-act="speed"]').addEventListener('change', (e) => {
    setSpeed(Number((e.target as HTMLSelectElement).value));
  });

  q('[data-act="solve"]').addEventListener('click', async () => {
    const cells = net.get();
    const check = toCubie(cells);
    if (!check.ok) { showErrors(check.errors); return; }
    showErrors([]);
    status.textContent = t('solve.working');
    try {
      const result = await solver.solve(cells, method);
      stages = result.stages ?? null;
      playback.load(Uint8Array.from(cells), result.moves);
      showStatus(solver.status());
    } catch {
      status.textContent = t('solve.failed');
    }
  });

  // Space plays/pauses while this tab is visible (buttons and fields keep their own Space).
  window.addEventListener('keydown', (e) => {
    if (e.key !== ' ' || panel.hidden || solution.hidden) return;
    if ((e.target as HTMLElement).closest('button, input, select, textarea, [role="button"]')) return;
    e.preventDefault();
    playback.toggle();
  });

  return panel;
}
