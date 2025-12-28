import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Improve SEO by including source maps for debugging
    sourcemap: false,
    // Optimize chunk size for better loading
    rollupOptions: {
      output: {
        manualChunks: undefined
      }
    }
  },
  preview: {
    port: process.env.PORT || 5173,
    host: true
  },
  base: '/'
});
