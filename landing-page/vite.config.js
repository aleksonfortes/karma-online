import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  server: {
    port: 3001,
    host: true
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
}); 