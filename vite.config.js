import { defineConfig } from 'vite';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
    server: {
        port: 5173,
        proxy: {
            '/socket.io': {
                target: 'http://localhost:3000',
                ws: true
            }
        }
    },
    build: {
        outDir: 'dist',
        assetsDir: 'assets',
        sourcemap: false,
        minify: 'terser',
        terserOptions: {
            compress: {
                drop_console: true,
                drop_debugger: true,
                pure_funcs: ['console.log', 'console.info', 'console.warn', 'console.error'],
                passes: 2,
                dead_code: true
            },
            mangle: {
                toplevel: true
            },
            format: {
                comments: false
            }
        },
        rollupOptions: {
            output: {
                manualChunks: {
                    vendor: ['three', 'socket.io-client'],
                    game: ['src/main.js']
                }
            }
        }
    },
    resolve: {
        alias: {
            crypto: 'crypto-browserify'
        }
    },
    optimizeDeps: {
        include: ['crypto-browserify']
    }
}); 