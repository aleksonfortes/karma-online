import { defineConfig } from 'vite';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import JavaScriptObfuscator from 'javascript-obfuscator';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Dead code generator
const generateDeadCode = () => {
    const functions = Array.from({ length: 10 }, (_, i) => `
        function ${`_${Math.random().toString(36).substr(2, 9)}`}() {
            if (false) {
                console.log('${Math.random().toString(36).substr(2, 9)}');
                return ${Math.random()};
            }
            return ${Math.random()};
        }
    `).join('\n');
    
    return `
        // Dead code to confuse reverse engineering
        (function() {
            ${functions}
        })();
    `;
};

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
                passes: 3,
                dead_code: true,
                global_defs: {
                    DEBUG: false
                }
            },
            mangle: {
                eval: true,
                toplevel: true,
                safari10: true,
                properties: {
                    regex: /^_/
                }
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
                },
                intro: generateDeadCode()
            }
        },
        plugins: [
            {
                name: 'javascript-obfuscator',
                renderChunk(code, chunk) {
                    if (process.env.NODE_ENV === 'production') {
                        const result = JavaScriptObfuscator.obfuscate(code, {
                            compact: true,
                            controlFlowFlattening: true,
                            controlFlowFlatteningThreshold: 1,
                            deadCodeInjection: true,
                            deadCodeInjectionThreshold: 0.4,
                            debugProtection: true,
                            debugProtectionInterval: true,
                            disableConsoleOutput: true,
                            domainLock: [], // Add your domains here
                            identifierNamesGenerator: 'hexadecimal',
                            identifiersPrefix: '_',
                            inputFileName: chunk.fileName,
                            log: false,
                            numbersToExpressions: true,
                            optionsPreset: 'high-obfuscation',
                            renameGlobals: true,
                            rotateStringArray: true,
                            selfDefending: true,
                            shuffleStringArray: true,
                            simplify: true,
                            splitStrings: true,
                            splitStringsChunkLength: 5,
                            stringArray: true,
                            stringArrayCallsTransform: true,
                            stringArrayEncoding: ['rc4'],
                            stringArrayIndexShift: true,
                            stringArrayWrappersCount: 5,
                            stringArrayWrappersChainedCalls: true,
                            stringArrayWrappersParametersMaxCount: 5,
                            stringArrayWrappersType: 'function',
                            stringArrayThreshold: 1,
                            transformObjectKeys: true,
                            unicodeEscapeSequence: false
                        });
                        return result.getObfuscatedCode();
                    }
                    return code;
                }
            }
        ]
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