import './ui/theme.css';
import './ui/app.css';
import { solved } from './core/cube.ts';
import { createStore } from './store.ts';
import { applyI18n, getLang, onLangChange, setLang } from './ui/i18n.ts';
import { loadFonts } from './ui/fonts.ts';
import { initTheme, stickerColors, toggleTheme } from './ui/theme.ts';
import { createRings2D } from './view/rings2d.ts';

const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

loadFonts();
initTheme();
document.documentElement.lang = getLang();

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const store = createStore((m) => (reducedMotion.matches ? 0 : m.endsWith('2') ? 330 : 220));
const colors = stickerColors();

const rings = createRings2D($<SVGSVGElement>('#rings'), store, colors);
applyI18n(document);

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
  rings.render(store.frame(now));
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);
