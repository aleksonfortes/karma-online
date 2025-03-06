import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function findProcessByPort(port) {
    try {
        const { stdout } = await execAsync(`lsof -i :${port} -t`);
        return stdout.trim();
    } catch (error) {
        return null;
    }
}

async function killProcess(pid) {
    try {
        // Use force kill (-9) to ensure the process is terminated
        await execAsync(`kill -9 ${pid}`);
        console.log(`Killed process ${pid}`);
    } catch (error) {
        console.error(`Failed to kill process ${pid}:`, error.message);
    }
}

async function cleanup() {
    console.log('Starting cleanup...');

    try {
        // Kill Vite dev server (port 5173)
        const vitePid = await findProcessByPort(5173);
        if (vitePid) {
            await killProcess(vitePid);
        }

        // Kill game server (port 3000)
        const serverPid = await findProcessByPort(3000);
        if (serverPid) {
            await killProcess(serverPid);
        }

        // Kill any remaining node processes that might be related to our game
        const { stdout } = await execAsync('ps aux | grep "node" | grep -v grep');
        const processes = stdout.split('\n');
        
        for (const process of processes) {
            if (process.includes('vite') || process.includes('server/index.js')) {
                const pid = process.trim().split(/\s+/)[1];
                if (pid && !isNaN(pid)) {
                    await killProcess(pid);
                }
            }
        }

        // Remove the .port file if it exists
        const portFile = path.join(__dirname, '../server/.port');
        if (fs.existsSync(portFile)) {
            fs.unlinkSync(portFile);
            console.log('Removed .port file');
        }

        console.log('Cleanup complete!');
    } catch (error) {
        console.error('Cleanup failed:', error);
        process.exit(1);
    }
}

// Run cleanup
cleanup().catch(error => {
    console.error('Cleanup failed:', error);
    process.exit(1);
}); 