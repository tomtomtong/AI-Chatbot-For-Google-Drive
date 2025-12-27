import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  preview: {
    port: process.env.PORT || 5173,
    host: true
  },
  base: '/'
});
