// woff2-only font faces (Edge/Chrome need nothing else); the build inlines each file as a data URL.
import bvpLatin400 from '@fontsource/be-vietnam-pro/files/be-vietnam-pro-latin-400-normal.woff2?url';
import bvpLatin500 from '@fontsource/be-vietnam-pro/files/be-vietnam-pro-latin-500-normal.woff2?url';
import bvpLatin600 from '@fontsource/be-vietnam-pro/files/be-vietnam-pro-latin-600-normal.woff2?url';
import bvpViet400 from '@fontsource/be-vietnam-pro/files/be-vietnam-pro-vietnamese-400-normal.woff2?url';
import bvpViet500 from '@fontsource/be-vietnam-pro/files/be-vietnam-pro-vietnamese-500-normal.woff2?url';
import bvpViet600 from '@fontsource/be-vietnam-pro/files/be-vietnam-pro-vietnamese-600-normal.woff2?url';
import jbmLatin400 from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2?url';
import jbmLatin500 from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2?url';

const LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const VIETNAMESE = 'U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB';

const FACES: [family: string, url: string, weight: string, range: string][] = [
  ['Be Vietnam Pro', bvpLatin400, '400', LATIN],
  ['Be Vietnam Pro', bvpLatin500, '500', LATIN],
  ['Be Vietnam Pro', bvpLatin600, '600', LATIN],
  ['Be Vietnam Pro', bvpViet400, '400', VIETNAMESE],
  ['Be Vietnam Pro', bvpViet500, '500', VIETNAMESE],
  ['Be Vietnam Pro', bvpViet600, '600', VIETNAMESE],
  ['JetBrains Mono', jbmLatin400, '400', LATIN],
  ['JetBrains Mono', jbmLatin500, '500', LATIN],
];

export function loadFonts(): void {
  for (const [family, url, weight, unicodeRange] of FACES) {
    const face = new FontFace(family, `url(${url}) format('woff2')`, { weight, unicodeRange, display: 'swap' });
    document.fonts.add(face);
    face.load().catch(() => { /* system font fallback from theme.css */ });
  }
}
