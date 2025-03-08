// Anti-debugging measures
(function() {
    // Only enable full protection in production mode
    const isProduction = import.meta.env.PROD;
    
    if (!isProduction) {
        console.log('Running in development mode - limited protection enabled');
        return; // Disable all protection in development mode
    }

    // Flag to prevent multiple reloads
    let hasReloaded = false;

    // Detect and prevent DevTools
    const devToolsDetector = {
        isOpen: false,
        orientation: undefined,
        
        detect() {
            if (!isProduction) return false; // Always return false in development
            
            const threshold = 160;
            const widthThreshold = window.outerWidth - window.innerWidth > threshold;
            const heightThreshold = window.outerHeight - window.innerHeight > threshold;
            
            if (widthThreshold || heightThreshold) {
                this.isOpen = true;
                this.orientation = widthThreshold ? 'vertical' : 'horizontal';
            } else {
                this.isOpen = false;
                this.orientation = undefined;
            }
            
            return this.isOpen;
        }
    };

    // Prevent right-click only in production
    if (isProduction) {
        document.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    // Prevent keyboard shortcuts only in production
    if (isProduction) {
        document.addEventListener('keydown', (e) => {
            // Prevent common dev tools shortcuts
            if (
                (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) || // Dev tools
                (e.ctrlKey && e.key === 'U') || // View source
                e.key === 'F12' // Dev tools
            ) {
                e.preventDefault();
            }
        });
    }

    // Obfuscate console output only in production
    if (isProduction) {
        const originalConsole = { ...console };
        const blocked = ['log', 'info', 'warn', 'error', 'debug'];
        blocked.forEach(method => {
            console[method] = () => {};
        });
    }

    // Add source code protection only in production
    if (isProduction) {
        document.addEventListener('copy', (e) => e.preventDefault());
        document.addEventListener('cut', (e) => e.preventDefault());
        document.addEventListener('paste', (e) => e.preventDefault());
    }

    // Monitor for dev tools
    let checkInterval;
    const startMonitoring = () => {
        if (!isProduction) return; // Don't monitor in development mode
        
        checkInterval = setInterval(() => {
            if (devToolsDetector.detect() && !hasReloaded) {
                hasReloaded = true; // Set flag to prevent multiple reloads
                
                // Optionally disconnect from server or take other actions
                if (window.game && window.game.socket) {
                    window.game.socket.disconnect();
                }
                // Clear sensitive data
                if (window.game) {
                    window.game.cleanup();
                    window.game = null;
                }
                
                // Show a warning message instead of reloading in development
                if (!isProduction) {
                    console.warn('Developer tools detected - game cleaned up');
                } else {
                    // Only reload in production
                    window.location.reload();
                }
            }
        }, 1000);
    };

    // Start monitoring only in production
    if (isProduction) {
        startMonitoring();
    }
})(); 