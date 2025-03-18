import { defineConfig } from 'vite';

export default defineConfig({
  // Use root to specify the landing page directory
  root: '.',  
  base: '/',
  
  // Configure build output
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    
    // Ensure assets are properly generated
    assetsDir: 'assets',
    
    // Generate sourcemaps for easier debugging
    sourcemap: process.env.NODE_ENV !== 'production',
    
    // Configure rollup options for better optimization
    rollupOptions: {
      output: {
        // Ensure entry point is properly named
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    }
  }
}); 