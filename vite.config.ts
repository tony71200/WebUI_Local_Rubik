import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { snippetsPlugin } from './scripts/snippets.mjs';

export default defineConfig({
  base: './',
  plugins: [snippetsPlugin(), viteSingleFile()],
  test: { environment: 'node' },
});
