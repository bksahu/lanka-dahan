import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, 'src/core'),
      '@game': path.resolve(__dirname, 'src/game'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 0,
  },
});
