import { defineConfig } from 'vite';

export default defineConfig({
  root: './',
  build: {
    outDir: 'dist-app',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
  },
});
