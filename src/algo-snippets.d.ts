// Provided at build time by scripts/snippets.mjs (Vite plugin): highlighted HTML per code region and language.
declare module 'virtual:algo-snippets' {
  type Region = 'facelets' | 'invariants' | 'kociemba' | 'lbl';
  type CodeLang = 'python' | 'cpp' | 'csharp' | 'java' | 'javascript';
  export const SNIPPETS: Record<Region, Record<CodeLang, string>>;
}
