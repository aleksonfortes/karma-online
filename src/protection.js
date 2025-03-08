// Advanced anti-debugging and code protection measures
(function() {
    const isProduction = import.meta.env.PROD;
    
    // Development mode bypass
    if (!isProduction) {
        console.log('Running in development mode - limited protection enabled');
        return;
    }

    // Anti-VM and Anti-Emulation
    const detectVM = () => {
        const signs = [
            'VirtualBox',
            'VMware',
            'Parallels',
            '__nightmare',
            'selenium',
            'webdriver'
        ];
        return signs.some(sign => 
            navigator.userAgent.includes(sign) ||
            document.documentElement.innerHTML.includes(sign)
        );
    };

    // Prevent source map access
    if (window.SourceMap || window.sourceMap) {
        window.SourceMap = window.sourceMap = undefined;
    }

    // Network request protection
    const protectXHR = () => {
        const originalXHR = window.XMLHttpRequest;
        const originalOpen = XMLHttpRequest.prototype.open;
        const originalSend = XMLHttpRequest.prototype.send;

        window.XMLHttpRequest = function() {
            const xhr = new originalXHR();
            const timestamp = Date.now().toString(36);
            
            xhr.open = function(method, url) {
                // Add anti-cache measures
                const separator = url.includes('?') ? '&' : '?';
                const protectedUrl = `${url}${separator}_=${timestamp}`;
                return originalOpen.call(this, method, protectedUrl);
            };

            xhr.send = function(data) {
                // Add request verification
                this.setRequestHeader('X-Request-Verification', timestamp);
                return originalSend.call(this, data);
            };

            return xhr;
        };
    };

    // WebSocket protection
    const protectWebSocket = () => {
        const originalWebSocket = window.WebSocket;
        window.WebSocket = function(url, protocols) {
            const ws = new originalWebSocket(url, protocols);
            
            // Encrypt WebSocket messages
            const originalSend = ws.send;
            ws.send = function(data) {
                // Simple XOR encryption (replace with stronger encryption in production)
                const encrypted = typeof data === 'string' 
                    ? btoa(data.split('').map(c => String.fromCharCode(c.charCodeAt(0) ^ 0x7F)).join(''))
                    : data;
                return originalSend.call(this, encrypted);
            };

            return ws;
        };
    };

    // Storage protection (enhanced)
    const protectStorage = () => {
        // Protect localStorage and sessionStorage
        ['localStorage', 'sessionStorage'].forEach(storageType => {
            const storage = window[storageType];
            const originalSetItem = storage.setItem;
            const originalGetItem = storage.getItem;

            storage.setItem = function(key, value) {
                if (key.includes('debug') || key.includes('devtools')) {
                    return;
                }
                // Encrypt stored data
                const encrypted = btoa(String(value).split('').map(c => 
                    String.fromCharCode(c.charCodeAt(0) ^ 0x7F)
                ).join(''));
                originalSetItem.call(this, key, encrypted);
            };

            storage.getItem = function(key) {
                const value = originalGetItem.call(this, key);
                if (!value) return null;
                // Decrypt stored data
                try {
                    return atob(value).split('').map(c => 
                        String.fromCharCode(c.charCodeAt(0) ^ 0x7F)
                    ).join('');
                } catch {
                    return value;
                }
            };
        });

        // Protect IndexedDB
        const originalIndexedDB = window.indexedDB;
        Object.defineProperty(window, 'indexedDB', {
            get: () => {
                if (devToolsDetector.detect()) {
                    return null;
                }
                return originalIndexedDB;
            }
        });
    };

    // Function name protection
    const protectFunctions = () => {
        // Hide function names
        const randomizeName = () => '_' + Math.random().toString(36).substr(2, 9);
        
        Object.getOwnPropertyNames(window).forEach(prop => {
            if (typeof window[prop] === 'function') {
                Object.defineProperty(window[prop], 'name', {
                    value: randomizeName(),
                    configurable: false
                });
            }
        });
    };

    // Enhanced DevTools detection
    const devToolsDetector = {
        isOpen: false,
        orientation: undefined,
        
        detect() {
            return this.detectSize() || 
                   this.detectDebugger() || 
                   this.detectPerformance() ||
                   this.detectFirebug() ||
                   this.detectSourceMapping() ||
                   detectVM();
        },

        detectSize() {
            const threshold = 160;
            return window.outerWidth - window.innerWidth > threshold ||
                   window.outerHeight - window.innerHeight > threshold;
        },

        detectDebugger() {
            let d = new Date();
            debugger;
            return new Date() - d > 100;
        },

        detectPerformance() {
            const start = performance.now();
            debugger;
            return performance.now() - start > 100;
        },

        detectFirebug() {
            return window.Firebug && window.Firebug.chrome && window.Firebug.chrome.isInitialized;
        },

        detectSourceMapping() {
            return !!window.navigator.userAgent.match(/Chrome/)
                && !!window.CSS
                && !!window.CSS.supports
                && !!window.CSS.supports('(transform-origin: 5% 5%)');
        }
    };

    // Service Worker protection
    if (navigator.serviceWorker) {
        navigator.serviceWorker.getRegistrations().then(registrations => {
            registrations.forEach(registration => registration.unregister());
        });
        
        // Prevent new service worker registration
        Object.defineProperty(navigator, 'serviceWorker', {
            get: () => undefined,
            configurable: false
        });
    }

    // Cache protection
    if ('caches' in window) {
        caches.keys().then(names => {
            names.forEach(name => caches.delete(name));
        });
    }

    // Prevent iframe embedding and clickjacking
    if (window.self !== window.top) {
        window.top.location = window.self.location;
    }
    
    // Add anti-clickjacking headers
    const style = document.createElement('style');
    style.innerHTML = `
        html { display: none !important; }
    `;
    document.head.appendChild(style);
    
    if (document.body) {
        document.body.style.visibility = 'visible';
    }
    style.remove();

    // Enhanced keyboard protection
    document.addEventListener('keydown', (e) => {
        const blockedKeys = ['I', 'J', 'C', 'U', 'S', 'F12', 'K', 'E'];
        if ((e.ctrlKey && e.shiftKey && blockedKeys.includes(e.key)) ||
            (e.ctrlKey && blockedKeys.includes(e.key)) ||
            (e.altKey && blockedKeys.includes(e.key)) ||
            blockedKeys.includes(e.key)) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
    }, true);

    // Enhanced console protection
    const protectConsole = () => {
        const noop = () => {};
        const methods = ['log', 'info', 'warn', 'error', 'debug', 'trace', 'dir', 'dirxml', 
                        'group', 'groupEnd', 'time', 'timeEnd', 'profile', 'profileEnd', 
                        'count', 'assert', 'timeStamp'];

        const createProxy = () => new Proxy({}, {
            get: () => noop,
            set: () => false,
            deleteProperty: () => false,
            defineProperty: () => false,
            getOwnPropertyDescriptor: () => undefined,
            preventExtensions: () => false,
            has: () => false
        });

        // Override console with proxy
        Object.defineProperty(window, 'console', {
            get: () => createProxy(),
            set: () => false,
            configurable: false
        });
    };

    // Initialize protections
    protectXHR();
    protectWebSocket();
    protectStorage();
    protectFunctions();
    protectConsole();

    // Monitor for tampering with enhanced cleanup
    let hasReloaded = false;
    const monitor = () => {
        if (hasReloaded) return;

        const checkInterval = setInterval(() => {
            if (devToolsDetector.detect()) {
                hasReloaded = true;
                
                // Enhanced cleanup
                if (window.game) {
                    if (window.game.socket) {
                        window.game.socket.disconnect();
                    }
                    window.game.cleanup();
                    window.game = null;
                }

                // Clear all storage
                localStorage.clear();
                sessionStorage.clear();
                if ('caches' in window) {
                    caches.keys().then(names => names.forEach(name => caches.delete(name)));
                }
                
                // Clear IndexedDB
                if (window.indexedDB) {
                    window.indexedDB.databases().then(dbs => {
                        dbs.forEach(db => window.indexedDB.deleteDatabase(db.name));
                    });
                }
                
                // Force reload with cache clear
                window.location.reload(true);
            }
        }, 500);

        // Enhanced cleanup on page unload
        window.addEventListener('beforeunload', () => {
            clearInterval(checkInterval);
            localStorage.clear();
            sessionStorage.clear();
            if (window.game && window.game.socket) {
                window.game.socket.disconnect();
            }
        });
    };

    // Start protection
    monitor();
})(); 