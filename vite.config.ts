import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

const BUILD_ID = `${JSON.parse(readFileSync('package.json', 'utf8')).version}-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`;

export default defineConfig({
  root: 'web',
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  build: { outDir: '../dist', emptyOutDir: true },
  plugins: [
    react(),
    // 公開されている版の番号（端末に保存させない。画面が自分の番号と比べる）
    { name: 'version-json', generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) }); } },
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: false,
      injectManifest: { globPatterns: ['**/*.{js,css,html,png,svg}'], globIgnores: ['og.png'], maximumFileSizeToCacheInBytes: 3 * 1024 * 1024 },
      manifest: {
        name: 'FIRMWATCH',
        short_name: 'FIRMWATCH',
        description: '持っている機材のファームウェアを管理し、新しいバージョンが出たら通知します。',
        lang: 'ja',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#D5D9DD',
        theme_color: '#D5D9DD',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: { proxy: { '/api': 'http://localhost:8787' } },
});
