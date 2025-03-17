# Karma Online Deployment Guide

## Architecture Overview

The Karma Online game consists of three main components:
1. **Landing Page**: Static website at karmaonline.io
2. **Game Client**: Static application at play.karmaonline.io
3. **Game Server**: Node.js backend at api.karmaonline.io

## Deployment with Render

All components are deployed using Render.com via GitHub integration.

### Setup Process

1. Create a Render account and connect your GitHub repository
2. Render will automatically detect the `render.yaml` file and create the services
3. Configure environment variables as needed in the Render dashboard

### Environment Variables

The following environment variables need to be set in the Render dashboard:

#### For karma-client
- `VITE_API_KEY` - API key for client authentication
- `VITE_ANALYTICS_ID` - Analytics tracking ID

#### For karma-server
- `API_KEY` - Server-side API key (must match VITE_API_KEY)
- `JWT_SECRET` - Secret for JWT token signing
- `DATABASE_URL` - Connection string for the database

**Important**: Never commit sensitive environment variables to the repository. Use the Render dashboard to set these values securely.

## Domain Setup with GoDaddy and Cloudflare

### Step 1: Point Domain from GoDaddy to Cloudflare
1. Log in to your GoDaddy account
2. Navigate to the Domain Management page for karmaonline.io
3. Update nameservers to use Cloudflare nameservers:
   - `ns1.cloudflare.com`
   - `ns2.cloudflare.com`
4. Wait for DNS propagation (can take 24-48 hours)

### Step 2: Configure Cloudflare
1. Create a Cloudflare account if you don't have one
2. Add karmaonline.io as a site in Cloudflare
3. Create DNS records to point to Render deployments:
   - `karmaonline.io` → Landing Page Render URL (CNAME)
   - `play.karmaonline.io` → Game Client Render URL (CNAME)
   - `api.karmaonline.io` → Game Server Render URL (CNAME)

### Step 3: Configure Cloudflare Security (Production Only)
1. Enable Cloudflare Proxy for production domains (orange cloud)
2. Configure Security settings:
   - Enable WAF (Web Application Firewall)
   - Set up rate limiting rules for API endpoints
   - Enable Bot Fight Mode
   - Configure DDoS protection

### Step 4: Disable Cloudflare for Development (Optional)
For local development, you can either:
1. Use local hosts only (localhost)
2. Or create development subdomains (e.g., dev.karmaonline.io) with "DNS only" settings (gray cloud) in Cloudflare

## Local Development

For local development:
1. Ensure your `.env.development` file is set up with appropriate local values
2. Run `npm run dev` to start all components locally
3. The client will be available at http://localhost:5173
4. The server will be available at http://localhost:3000
5. The landing page will be available at http://localhost:5173 (in landing-page mode)

## Production Deployment

To deploy to production:
1. Push changes to the main branch on GitHub
2. Render will automatically deploy the changes
3. Monitor the deployment in the Render dashboard

## Environment Configuration

- Development: Uses `.env.development` file and local servers
- Production: Environment variables are managed in Render dashboard

## Security Considerations

- API keys and secrets should be stored as environment variables in Render
- Client-side code should never contain sensitive information
- Server should validate all incoming requests
- Rate limiting should be implemented for all API endpoints
- Game server should implement anti-cheat measures 