import { defineConfig } from 'vite';

export default defineConfig({
  root: 'landing-page',
  server: {
    port: 3001,
    host: true
  },
  build: {
    outDir: '../dist-landing',
    emptyOutDir: true
  }
}); 