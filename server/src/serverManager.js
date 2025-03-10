import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT_FILE = path.join(__dirname, '.port');

export async function findOrCreateServer() {
    try {
        await killExistingServer();
        await waitForTermination();

        if (fs.existsSync(PORT_FILE)) {
            const port = parseInt(fs.readFileSync(PORT_FILE, 'utf8'));
            if (await isPortInUse(port)) {
                return { port: 3000, isNew: true };
            }
            return { port, isNew: false };
        }

        const port = 3000;
        fs.writeFileSync(PORT_FILE, port.toString());
        return { port, isNew: true };
    } catch (error) {
        console.error('Error in findOrCreateServer:', error);
        throw error;
    }
}

async function killExistingServer() {
    try {
        await execAsync('pkill -f "node server/index.js"');
    } catch (e) {
        // Ignore errors if no process was found
    }
}

async function waitForTermination() {
    await new Promise(resolve => setTimeout(resolve, 1000));
}

async function isPortInUse(port) {
    try {
        await execAsync(`lsof -i :${port}`);
        return true;
    } catch (e) {
        return false;
    }
} 