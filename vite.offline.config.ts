import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Plugin } from 'vite';

export const OFFLINE_OUT_DIR = 'dist-offline';
export const OFFLINE_FILE = 'חפק-לוח-שליטה.html';

/**
 * After the build, folds the script and stylesheet into the page itself: the result is one HTML file
 * that opens from disk (file://) with no server and no network.
 */
function inlineIntoOneFile(): Plugin {
  return {
    name: 'inline-into-one-file',
    apply: 'build',
    closeBundle() {
      const dir = resolve(OFFLINE_OUT_DIR);
      let html = readFileSync(join(dir, 'offline.html'), 'utf8');
      const read = (href: string) => readFileSync(join(dir, href.replace(/^\.?\//, '')), 'utf8');
      html = html.replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/g, (_, src: string) => {
        // A literal "</script" inside the code would end the tag early
        const code = read(src).replace(/<\/script/gi, '<\\/script');
        return `<script type="module">${code}</script>`;
      });
      html = html.replace(/<link rel="stylesheet" crossorigin href="([^"]+)">/g, (_, href: string) => `<style>${read(href)}</style>`);
      if (/<script[^>]+src=|<link[^>]+stylesheet/.test(html)) throw new Error('offline build: an external script or stylesheet was left in the page');
      writeFileSync(join(dir, OFFLINE_FILE), html);
      rmSync(join(dir, 'offline.html'));
      rmSync(join(dir, 'assets'), { recursive: true, force: true });
      if (readdirSync(dir).length !== 1) throw new Error('offline build: expected exactly one output file');
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), inlineIntoOneFile()],
  base: './',
  build: {
    outDir: OFFLINE_OUT_DIR,
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    modulePreload: false,
    rollupOptions: {
      input: 'offline.html',
      output: { inlineDynamicImports: true },
    },
  },
});
