import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// Trust Cloudflare proxies
app.set('trust proxy', process.env.TRUST_CLOUDFLARE_PROXY === 'true');

// Log all requests to help with debugging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Check if dist directory exists
const distPath = join(__dirname, 'dist');
if (!fs.existsSync(distPath)) {
  console.error(`Error: Directory ${distPath} does not exist!`);
  console.log('Current directory contents:');
  console.log(fs.readdirSync(__dirname));
}

// Serve static files from the dist directory
app.use(express.static(distPath, { 
  maxAge: '1h',
  extensions: ['html', 'css', 'js']
}));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Handle client-side routing by serving index.html for all routes
app.get('*', (req, res) => {
  console.log(`Serving index.html for route: ${req.url}`);
  res.sendFile(join(distPath, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Landing page server running on port ${PORT}`);
  console.log(`Serving static files from: ${distPath}`);
}); 