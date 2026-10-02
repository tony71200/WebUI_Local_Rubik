// Tab "Ra đề": pick a level, get a solvable puzzle from the worker, time the attempt.
import type { Level } from '../scramble/levels.ts';
import type { SolverClient } from '../solver/client.ts';
import { onLangChange, t, type Key } from './i18n.ts';
import { formatTime, type Session, type SessionState } from './session.ts';
import { load, save } from './storage.ts';

export interface PuzzleTabDeps { solver: SolverClient; session: Session }

const WALK_LEVELS: [Level, string][] = [['intro', '1–2'], ['easy', '3–5'], ['medium', '6–9'], ['hard', '10+'], ['expert', 'WCA']];
const TRAINING: Level[] = ['pll', 'oll', 'f2l'];
const ALL = [...WALK_LEVELS.map(([l]) => l), ...TRAINING];

// UI code may use the platform RNG; core/solver/scramble only see the seed.
const newSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];

export function createPuzzleTab({ solver, session }: PuzzleTabDeps): HTMLElement {
  const panel = document.createElement('div');
  panel.innerHTML = `
    <p class="lbl" data-i18n="puzzle.levels"></p>
    <div class="rows" role="radiogroup" data-i18n-aria="puzzle.levels">
      ${WALK_LEVELS.map(([l, range]) => `<button type="button" class="row" role="radio" data-level="${l}"><span data-i18n="level.${l}"></span><span class="mono range">${range}</span></button>`).join('')}
    </div>
    <p class="lbl" data-i18n="puzzle.training"></p>
    <div class="seg" role="radiogroup" data-i18n-aria="puzzle.training">
      ${TRAINING.map((l) => `<button type="button" class="btn" role="radio" data-level="${l}" data-i18n="level.${l}"></button>`).join('')}
    </div>
    <p class="hint" data-i18n="puzzle.trainingHint"></p>
    <button type="button" class="cta" data-act="create" data-i18n="puzzle.create"></button>
    <p class="hint puzzle-status" aria-live="polite"></p>
    <p class="lbl" data-i18n="puzzle.current"></p>
    <div class="scramble mono"></div>
    <p class="hint distance"></p>
    <div class="stats">
      <div class="stat"><span data-i18n="puzzle.time"></span><span class="mono time">00:00.0</span></div>
      <div class="stat"><span data-i18n="puzzle.moves"></span><span class="mono count">0</span></div>
    </div>
    <p class="alert success solved" role="status" hidden></p>
    <p class="alert warning abandoned" hidden data-i18n="puzzle.abandoned"></p>`;

  const q = <T extends HTMLElement>(sel: string) => panel.querySelector<T>(sel)!;
  const status = q('.puzzle-status');
  const pickers = [...panel.querySelectorAll<HTMLButtonElement>('[data-level]')];
  const saved = load('level') as Level | null;
  let level: Level = saved && ALL.includes(saved) ? saved : 'medium';
  let timer: ReturnType<typeof setInterval> | undefined;

  const showPick = () => pickers.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.level === level)));
  pickers.forEach((b) => b.addEventListener('click', () => {
    level = b.dataset.level as Level;
    save('level', level);
    showPick();
  }));
  showPick();

  const distanceText = (s: SessionState) => {
    const a = s.attempt;
    if (!a) return t('puzzle.empty');
    if (a.distance !== null) return t('puzzle.distance', { n: a.distance });
    if (a.level === 'hard') return t('puzzle.atLeast10');
    if (a.level === 'expert') return t('puzzle.randomState');
    return t('puzzle.trainingState', { name: t(`level.${a.level}` as Key) });
  };

  const render = (s: SessionState) => {
    q('.scramble').textContent = s.attempt ? s.attempt.scramble.join(' ') : '—';
    q('.distance').textContent = distanceText(s);
    q('.time').textContent = formatTime(session.elapsed());
    q('.count').textContent = String(s.moves);
    const solved = s.endedAt !== null;
    q('.solved').hidden = !solved;
    if (solved) q('.solved').textContent = t('puzzle.solved', { time: formatTime(session.elapsed()), n: s.moves });
    q('.abandoned').hidden = !(s.attempt && !s.active && !solved);
    const running = s.active && s.startedAt !== null;
    if (running && timer === undefined) timer = setInterval(() => { q('.time').textContent = formatTime(session.elapsed()); }, 100);
    if (!running && timer !== undefined) { clearInterval(timer); timer = undefined; }
  };
  session.onChange(render);
  onLangChange(() => render(session.state));
  render(session.state);

  q('[data-act="create"]').addEventListener('click', async () => {
    status.textContent = t('puzzle.creating');
    try {
      const r = await solver.scramble(level, newSeed());
      session.start({ level, scramble: r.scramble, distance: r.distance });
      status.textContent = '';
    } catch {
      status.textContent = t('puzzle.failed');
    }
  });

  return panel;
}
