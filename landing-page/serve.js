import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// Trust Cloudflare proxies
app.set('trust proxy', process.env.TRUST_CLOUDFLARE_PROXY === 'true');

// Serve static files from the dist directory
app.use(express.static(join(__dirname, 'dist')));

// Handle client-side routing
app.get('*', (req, res) => {
    res.sendFile(join(__dirname, 'dist/index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Landing page server running on port ${PORT}`);
}); 