// Configuration module to manage server URLs and other global settings
let serverConfig = null;

// Default configuration used until server config is loaded
const defaultConfig = {
    serverUrl: window.location.hostname === 'localhost'
        ? 'http://localhost:3000'
        : window.location.origin
};

// Fetch configuration from server
export const fetchServerConfig = async () => {
    try {
        // Use the default URL for the initial config fetch
        const configUrl = `${defaultConfig.serverUrl}/api/config`;
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
    return (serverConfig && serverConfig.serverUrl) || defaultConfig.serverUrl;
};

// Initialize config on module load
fetchServerConfig().catch(err => {
    console.error('Failed to initialize server configuration:', err);
});
