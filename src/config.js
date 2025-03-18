// Configuration module to manage server URLs and other global settings
let serverConfig = null;

// Get socket URL from environment variables or use a fallback
const getSocketUrl = () => {
    if (import.meta.env.VITE_SOCKET_URL) {
        return import.meta.env.VITE_SOCKET_URL;
    }
    
    // Fallback if env variable is not set
    return window.location.hostname === 'localhost'
        ? 'http://localhost:3000'
        : 'wss://api.karmaonline.io';
};

// Default configuration used until server config is loaded
const defaultConfig = {
    serverUrl: getSocketUrl()
};

// Fetch configuration from server
export const fetchServerConfig = async () => {
    try {
        // Get API base URL by parsing the socket URL
        const socketUrl = getSocketUrl();
        let apiBaseUrl = socketUrl;
        
        // Convert WebSocket URL to HTTP URL if needed
        if (apiBaseUrl.startsWith('ws://')) {
            apiBaseUrl = 'http://' + apiBaseUrl.substring(5);
        } else if (apiBaseUrl.startsWith('wss://')) {
            apiBaseUrl = 'https://' + apiBaseUrl.substring(6);
        }
        
        // Use the API base URL for the config fetch
        const configUrl = `${apiBaseUrl}/api/config`;
        console.log('Fetching server config from:', configUrl);
        
        const response = await fetch(configUrl);
        
        if (!response.ok) {
            console.warn('Failed to fetch server configuration, using default');
            return defaultConfig;
        }
        
        serverConfig = await response.json();
        console.log('Server configuration loaded:', serverConfig);
        return serverConfig;
    } catch (error) {
        console.error('Error fetching server configuration:', error);
        return defaultConfig;
    }
};

// Get server URL - returns cached config or default if not yet loaded
export const getServerUrl = () => {
    // Always prioritize environment variable
    if (import.meta.env.VITE_SOCKET_URL) {
        console.log('Using VITE_SOCKET_URL:', import.meta.env.VITE_SOCKET_URL);
        return import.meta.env.VITE_SOCKET_URL;
    }
    
    return (serverConfig && serverConfig.serverUrl) || defaultConfig.serverUrl;
};

// Initialize config on module load
fetchServerConfig().catch(err => {
    console.error('Failed to initialize server configuration:', err);
});
