// Configuration module to manage server URLs and other global settings
export const getServerUrl = () => {
    return window.location.hostname === 'localhost'
        ? 'http://localhost:3000'
        : window.location.origin;
};
