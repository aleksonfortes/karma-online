import { io } from 'socket.io-client';

const SERVER_PORT = 3000;
const SERVER_CHECK_TIMEOUT = 1000; // 1 second timeout

export async function findOrCreateServer() {
    try {
        // Try to connect to existing server
        const socket = io(`http://localhost:${SERVER_PORT}`, {
            timeout: SERVER_CHECK_TIMEOUT,
            reconnection: false
        });

        return new Promise((resolve, reject) => {
            socket.on('connect', () => {
                console.log('Found existing server');
                socket.disconnect();
                resolve({ port: SERVER_PORT, isNew: false });
            });

            socket.on('connect_error', () => {
                console.log('No existing server found, creating new one');
                resolve({ port: SERVER_PORT, isNew: true });
            });
        });
    } catch (error) {
        console.error('Error checking server:', error);
        return { port: SERVER_PORT, isNew: true };
    }
} 