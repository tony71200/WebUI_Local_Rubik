import './ui/theme.css';
import './ui/app.css';
import { solved } from './core/cube.ts';
import { createSolverClient } from './solver/client.ts';
import SolverWorker from './solver/worker.ts?worker&inline';
import { createStore } from './store.ts';
import { mountControls, speakMove } from './ui/controls.ts';
import { applyI18n, getLang, onLangChange, setLang } from './ui/i18n.ts';
import { loadFonts } from './ui/fonts.ts';
import { createPlayback } from './ui/playback.ts';
import { createSolveTab } from './ui/solveTab.ts';
import { mountTabs } from './ui/tabs.ts';
import { cssVar, initTheme, stickerColors, toggleTheme } from './ui/theme.ts';
import { createCube3D } from './view/cube3d.ts';
import { createRings2D } from './view/rings2d.ts';

const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

loadFonts();
initTheme();
document.documentElement.lang = getLang();

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let speed = 1; // playback speed multiplier, set from the Solve tab
const store = createStore((m) => (reducedMotion.matches ? 0 : (m.endsWith('2') ? 330 : 220) / speed));
const colors = stickerColors();

const cube = createCube3D($('#cube-view'), store, colors, cssVar('--plastic'));
if (!cube) {
  $('#cube-view').hidden = true;
  $('#webgl-error').hidden = false;
}
const rings = createRings2D($<SVGSVGElement>('#rings'), store, colors);
mountControls($('#keycaps'), store);

const solver = createSolverClient(() => new SolverWorker());
const playback = createPlayback(store);
mountTabs($('#side'), [
  { id: 'solve', label: 'tab.solve', panel: createSolveTab({ store, solver, playback, colors, setSpeed: (x) => { speed = x; } }) },
]);
applyI18n(document);

const live = $('#live');
store.subscribe((_, move) => { live.textContent = move ? speakMove(move) : ''; });

$('#reset').addEventListener('click', () => store.setState(solved()));
$('#theme-toggle').addEventListener('click', () => toggleTheme());

const langLabel = $('#lang-current');
const showLang = () => { langLabel.textContent = getLang().toUpperCase(); };
showLang();
onLangChange(showLang);
$('#lang-toggle').addEventListener('click', () => setLang(getLang() === 'vi' ? 'en' : 'vi'));

const labelsBtn = $('#labels-toggle');
labelsBtn.addEventListener('click', () => {
  const on = labelsBtn.getAttribute('aria-pressed') !== 'true';
  labelsBtn.setAttribute('aria-pressed', String(on));
  rings.setLabels(on);
});

const loop = (now: number) => {
  const anim = store.frame(now);
  cube?.render(anim);
  rings.render(anim);
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);
