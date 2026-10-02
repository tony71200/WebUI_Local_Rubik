// Build-time code snippets for the "Thuật toán" tab: cut marked regions out of the reference
// implementations and highlight them with Shiki, so the tab always shows code that really runs.
// Plain JS (with snippets.d.mts) because it needs Node's fs and is only ever run by Vite/Vitest.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { codeToHtml, createCssVariablesTheme } from 'shiki';

export const REGIONS = ['facelets', 'invariants', 'kociemba', 'lbl'];
export const CODE_LANGS = [
  { id: 'python', label: 'Python', file: 'reference/python/rubik.py' },
  { id: 'cpp', label: 'C++', file: 'reference/cpp/rubik.cpp' },
  { id: 'csharp', label: 'C#', file: 'reference/csharp/Rubik.cs' },
  { id: 'java', label: 'Java', file: 'reference/java/Rubik.java' },
  { id: 'javascript', label: 'JS', file: 'reference/js/rubik.mjs' },
];

const START = /^\s*(?:\/\/|#)\s*#?region\s+([\w-]+)\s*$/;
const END = /^\s*(?:\/\/|#)\s*#?endregion\b/;

/** Text between `// #region name` (or `# region name`) and the matching end marker, dedented. */
export function extractRegions(source) {
  const out = {};
  let name = null;
  let lines = [];
  for (const line of source.replace(/\r/g, '').split('\n')) {
    if (name === null) {
      const m = START.exec(line);
      if (m) { name = m[1]; lines = []; }
    } else if (END.test(line)) {
      const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length));
      out[name] = lines.map((l) => l.slice(indent)).join('\n').trim();
      name = null;
    } else {
      lines.push(line);
    }
  }
  return out;
}

// Shiki token kinds -> one-letter classes colored in app.css; everything else stays plain text.
const SHORT = { keyword: 'k', string: 's', 'string-expression': 's', link: 's', comment: 'c', function: 'f', constant: 'n', parameter: 'v' };

/** Shiki css-variables output -> compact HTML: no per-line wrappers, short unquoted classes (keeps the single file small). */
export function compactHtml(html) {
  return html
    .replace(/<pre class="shiki[^"]*"[^>]*>/, '<pre class="code">')
    .replace(/<span class="line">(.*?)<\/span>(?=\n|<\/code>)/g, '$1')
    .replace(/<span style="color:var\(--shiki-(?:foreground|token-punctuation)\)">([^<]*)<\/span>/g, '$1')
    .replace(/<span style="color:var\(--shiki-token-([\w-]+)\)[^"]*">([^<]*)<\/span>/g,
      (_, kind, text) => (SHORT[kind] ? `<span class=${SHORT[kind]}>${text}</span>` : text));
}

const theme = createCssVariablesTheme({ name: 'css-vars', variablePrefix: '--shiki-' });
const VIRTUAL = 'virtual:algo-snippets';
const RESOLVED = `\0${VIRTUAL}`;

/** Vite plugin: `import { SNIPPETS } from 'virtual:algo-snippets'` -> SNIPPETS[region][lang] = html. */
export function snippetsPlugin() {
  return {
    name: 'algo-snippets',
    resolveId: (id) => (id === VIRTUAL ? RESOLVED : null),
    async load(id) {
      if (id !== RESOLVED) return null;
      const snippets = Object.fromEntries(REGIONS.map((r) => [r, {}]));
      for (const lang of CODE_LANGS) {
        const file = resolve(lang.file); // absolute: a relative path would be treated as an import in dev
        this.addWatchFile(file);
        const regions = extractRegions(readFileSync(file, 'utf8'));
        for (const r of REGIONS) {
          if (!regions[r]) throw new Error(`${lang.file}: missing region "${r}"`);
          snippets[r][lang.id] = compactHtml(await codeToHtml(regions[r], { lang: lang.id, theme }));
        }
      }
      return `export const SNIPPETS = ${JSON.stringify(snippets)};`;
    },
  };
}
