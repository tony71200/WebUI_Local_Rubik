import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CODE_LANGS, REGIONS, compactHtml, extractRegions } from './snippets.mjs';

describe('algorithm snippets', () => {
  it('cuts dedented regions marked with // #region or # region', () => {
    const js = 'a\n  // #region one\n  if (x) {\n    y();\n  }\n  // #endregion\nb';
    expect(extractRegions(js)).toEqual({ one: 'if (x) {\n  y();\n}' });
    const py = '# region two\ndef f():\n    pass\n# endregion\n';
    expect(extractRegions(py)).toEqual({ two: 'def f():\n    pass' });
  });

  it('turns Shiki css-variable spans into short classes and drops line wrappers', () => {
    const html = '<pre class="shiki css-vars" style="background-color:var(--shiki-background)" tabindex="0"><code>'
      + '<span class="line"><span style="color:var(--shiki-token-keyword)">def</span><span style="color:var(--shiki-foreground)"> f</span>'
      + '<span style="color:var(--shiki-token-punctuation)">(</span></span>\n'
      + '<span class="line"><span style="color:var(--shiki-token-comment)"># x</span></span></code></pre>';
    expect(compactHtml(html)).toBe('<pre class="code"><code><span class=k>def</span> f(\n<span class=c># x</span></code></pre>');
  });

  it('finds every region in every reference implementation', () => {
    for (const lang of CODE_LANGS) {
      const regions = extractRegions(readFileSync(lang.file, 'utf8'));
      for (const r of REGIONS) expect(regions[r]?.length, `${lang.file} ${r}`).toBeGreaterThan(50);
    }
  });
});
