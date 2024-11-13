import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { compression } from 'vite-plugin-compression2';
import dynamicImport from 'vite-plugin-dynamic-import';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import wasm from 'vite-plugin-wasm';

// https://vite.dev/config/
export default defineConfig({
  publicDir: 'public',
  server: {
    strictPort: true,
  },
  resolve: {
    extensions: ['.web.tsx', '.tsx', '.web.ts', '.ts', '.web.jsx', '.jsx', '.web.js', '.js', '.css', '.json', '.mjs'],
  },
  plugins: [
    react(),
    wasm(),
    dynamicImport({}),
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/pspdfkit/dist/pspdfkit-lib',
          dest: 'public',
        },
      ],
    }),
    compression({
      algorithm: 'gzip',
      include: ['**/*.wasm', '**/*.js', '**/*.css', '**/*.ttf'],
      exclude: ['index.html'],
    }),
  ],
});
