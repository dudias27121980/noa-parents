import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Plugin } from 'vite';

export const OUT_DIR = 'dist';
export const OUT_FILE = 'חפק-לוח-שליטה.html';

/** The file may load nothing from anywhere and send nothing anywhere: everything it needs is inside it */
const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; font-src data:";

/**
 * After the build, folds the script and stylesheet into the page itself: the result is one HTML file
 * that opens from disk (file://) with no server and no network.
 */
function inlineIntoOneFile(): Plugin {
  return {
    name: 'inline-into-one-file',
    apply: 'build',
    // Only in the built file: the development server needs its own scripts and live-reload connection
    transformIndexHtml: (html) => html.replace('</title>', `</title>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
    closeBundle() {
      const dir = resolve(OUT_DIR);
      let html = readFileSync(join(dir, 'index.html'), 'utf8');
      const read = (href: string) => readFileSync(join(dir, href.replace(/^\.?\//, '')), 'utf8');
      html = html.replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/g, (_, src: string) => {
        // A literal "</script" inside the code would end the tag early
        const code = read(src).replace(/<\/script/gi, '<\\/script');
        return `<script type="module">${code}</script>`;
      });
      html = html.replace(/<link rel="stylesheet" crossorigin href="([^"]+)">/g, (_, href: string) => `<style>${read(href)}</style>`);
      if (/<script[^>]+src=|<link[^>]+stylesheet/.test(html)) throw new Error('offline build: an external script or stylesheet was left in the page');
      if (!html.includes('Content-Security-Policy')) throw new Error('offline build: the page lost its network lock (CSP)');
      writeFileSync(join(dir, OUT_FILE), html);
      rmSync(join(dir, 'index.html'));
      rmSync(join(dir, 'assets'), { recursive: true, force: true });
      if (readdirSync(dir).length !== 1) throw new Error('offline build: expected exactly one output file');
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), inlineIntoOneFile()],
  base: './',
  build: {
    outDir: OUT_DIR,
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    modulePreload: false,
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
});
