// Tab "Thuật toán": six explained sections; the code under them is cut from the reference implementations.
import { SNIPPETS } from 'virtual:algo-snippets';
import cppSrc from '../../reference/cpp/rubik.cpp?raw';
import csSrc from '../../reference/csharp/Rubik.cs?raw';
import javaSrc from '../../reference/java/Rubik.java?raw';
import jsSrc from '../../reference/js/rubik.mjs?raw';
import pySrc from '../../reference/python/rubik.py?raw';
import { ALGO_SECTIONS, SECTION_REGION } from './content/algo.ts';
import { getLang, onLangChange } from './i18n.ts';
import { load, save } from './storage.ts';

const CODE = [
  { id: 'python', label: 'Python', file: 'rubik.py', src: pySrc },
  { id: 'cpp', label: 'C++', file: 'rubik.cpp', src: cppSrc },
  { id: 'csharp', label: 'C#', file: 'Rubik.cs', src: csSrc },
  { id: 'java', label: 'Java', file: 'Rubik.java', src: javaSrc },
  { id: 'javascript', label: 'JS', file: 'rubik.mjs', src: jsSrc },
] as const;
type CodeLang = (typeof CODE)[number]['id'];

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function createAlgoTab(): HTMLElement {
  const panel = document.createElement('div');
  panel.innerHTML = `
    <p class="lbl" data-i18n="algo.pick"></p>
    <div class="algo-sections"></div>
    <p class="lbl" data-i18n="algo.download"></p>
    <p class="hint" data-i18n="algo.downloadHint"></p>
    <div class="row-actions downloads">
      ${CODE.map((c) => `<button type="button" class="btn mono" data-file="${c.id}">${c.file}</button>`).join('')}
    </div>`;

  const list = panel.querySelector<HTMLElement>('.algo-sections')!;
  const saved = load('codeLang');
  let codeLang: CodeLang = CODE.some((c) => c.id === saved) ? (saved as CodeLang) : 'python';
  let open = 0;

  const render = () => {
    list.innerHTML = '';
    ALGO_SECTIONS[getLang()].forEach((sec, i) => {
      const box = document.createElement('section');
      box.className = 'algo-sec';
      const head = document.createElement('button');
      head.type = 'button';
      head.className = 'row algo-head';
      head.id = `algo-h-${sec.id}`;
      head.setAttribute('aria-expanded', String(i === open));
      head.setAttribute('aria-controls', `algo-b-${sec.id}`);
      head.innerHTML = `<span></span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
      head.querySelector('span')!.textContent = sec.title;
      head.addEventListener('click', () => { open = open === i ? -1 : i; render(); });
      const body = document.createElement('div');
      body.className = 'algo-body';
      body.id = `algo-b-${sec.id}`;
      body.hidden = i !== open;
      body.innerHTML = sec.html; // static, trusted content from src/ui/content
      const region = SECTION_REGION[sec.id];
      if (region) {
        const tabs = document.createElement('div');
        tabs.className = 'code-langs';
        tabs.setAttribute('role', 'radiogroup');
        for (const c of CODE) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'tab';
          b.setAttribute('role', 'radio');
          b.setAttribute('aria-checked', String(c.id === codeLang));
          b.textContent = c.label;
          b.addEventListener('click', () => { codeLang = c.id; save('codeLang', codeLang); render(); });
          tabs.append(b);
        }
        const code = document.createElement('div');
        code.innerHTML = SNIPPETS[region][codeLang]; // highlighted at build time from reference/
        body.append(tabs, code);
      }
      box.append(head, body);
      list.append(box);
    });
  };
  render();
  onLangChange(render);

  panel.querySelectorAll<HTMLButtonElement>('[data-file]').forEach((b) => {
    const c = CODE.find((x) => x.id === b.dataset.file)!;
    b.addEventListener('click', () => download(c.file, c.src));
  });
  return panel;
}
