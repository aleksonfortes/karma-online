import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT_FILE = path.join(__dirname, '.port');

async function findOrCreateServer() {
    try {
        // First, try to kill any existing server processes
        try {
            await execAsync('pkill -f "node server/index.js"');
            console.log('Killed existing server processes');
        } catch (e) {
            // Ignore errors if no process was found
        }

        // Wait a moment for processes to fully terminate
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Check if port file exists
        if (fs.existsSync(PORT_FILE)) {
            const port = parseInt(fs.readFileSync(PORT_FILE, 'utf8'));
            
            // Check if the port is actually in use
            try {
                await execAsync(`lsof -i :${port}`);
                console.log(`Port ${port} is in use, creating new server`);
                return { port: 3000, isNew: true };
            } catch (e) {
                // Port is not in use, we can use it
                return { port, isNew: false };
            }
        }

        // No port file exists, create new server
        const port = 3000;
        fs.writeFileSync(PORT_FILE, port.toString());
        return { port, isNew: true };
    } catch (error) {
        console.error('Error in findOrCreateServer:', error);
        throw error;
    }
}

export { findOrCreateServer }; 