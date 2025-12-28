# Open Source Google Drive Organizer

🚀 **An open source project for AI-powered Google Drive file organization**

**Try it now** or **host it yourself** - completely free and open source!

This project provides a web-based Google Drive organizer with AI-powered file management. You can use the hosted version to test it, or deploy it yourself on Railway, Vercel, or your own server.

## 🌟 Features

- **AI-Powered Organization**: Automatically organize files based on descriptions
- **Easy Upload**: Simple file upload with smart folder suggestions
- **100% Open Source**: Full source code available on GitHub
- **Self-Hostable**: Deploy on any platform you prefer
- **Privacy-First**: Host it yourself for complete data control

## 🔍 SEO & LLM Search Optimizations

This project includes comprehensive optimizations for search engines and AI/LLM-powered search:

### Traditional SEO
- **Meta Tags**: Complete Open Graph and Twitter Card support
- **Structured Data**: JSON-LD schemas for WebApplication, SoftwareSourceCode, FAQPage
- **Semantic HTML**: Proper heading hierarchy, ARIA landmarks, and accessibility attributes
- **Sitemap**: XML sitemap for search engine crawlers
- **Robots.txt**: Proper directives for crawlers

### LLM Search Optimization
- **llms.txt**: Comprehensive project description for LLM understanding ([/llms.txt](/llms.txt))
- **llms-full.txt**: Detailed documentation for AI search engines ([/llms-full.txt](/llms-full.txt))
- **ai-plugin.json**: AI plugin manifest for ChatGPT-style integrations
- **OpenAPI Spec**: Complete API documentation in OpenAPI 3.0 format

### Files Included
```
frontend/public/
├── llms.txt              # Brief LLM-friendly description
├── llms-full.txt         # Complete documentation for LLMs
├── sitemap.xml           # XML sitemap
├── robots.txt            # Crawler directives
├── openapi.yaml          # OpenAPI specification
├── favicon.svg           # Vector favicon
├── og-image.svg          # Open Graph image
└── .well-known/
    └── ai-plugin.json    # AI plugin manifest
```

## 🚀 Quick Start

### Try It Now
Just visit the hosted version and connect your Google Drive to test all features instantly!

### Host It Yourself
Follow the deployment guide below to set up your own instance.

---

# Railway Deployment Guide

This guide explains how to deploy the Google Drive Organizer to Railway.

## Architecture

- `server/` - Express.js backend (handles OAuth, Google Drive API, AI features)
- `frontend/` - Static frontend (Vite-built, served by Express in production)

**Note:** This project is configured to deploy as a **single Railway service** where the Express server serves both API routes and the built frontend static files.

## Deployment Steps

### 1. Create Railway Project

1. Go to [railway.app](https://railway.app) and create a new project
2. Click "New Service" → "GitHub Repo" or "Deploy from GitHub"
3. Select this repository (root directory)

### 2. Configure Environment Variables

In Railway, add the following environment variables:

- `GOOGLE_CLIENT_ID` - Your Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Your Google OAuth client secret
- `OPENROUTER_API_KEY` - Your OpenRouter API key (for AI features)
- `SESSION_SECRET` - Random string for session encryption (e.g., generate with `openssl rand -hex 32`)
- `NODE_ENV` - Set to `production`
- `BACKEND_URL` - (Optional) Your Railway domain URL. If not set, the app will use Railway's `RAILWAY_PUBLIC_DOMAIN` environment variable automatically

**Note:** `FRONTEND_URL` is no longer needed since the frontend is served from the same origin as the backend.

### 3. Update Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Navigate to APIs & Services → Credentials
3. Edit your OAuth 2.0 Client ID
4. Add authorized redirect URI: `https://your-app.railway.app/oauth/callback`
5. Add authorized JavaScript origin: `https://your-app.railway.app`

**Note:** Railway automatically provides `RAILWAY_PUBLIC_DOMAIN`, so the OAuth redirect URI will be constructed automatically. You can optionally set `BACKEND_URL` explicitly if you prefer.

### 4. Deploy

Railway will automatically:
1. Install dependencies (root, server, and frontend)
2. Build the frontend (`npm run build`)
3. Start the server (`npm start`)

The server will serve:
- API routes at `/api/*`
- OAuth routes at `/auth/*` and `/oauth/*`
- Static frontend files for all other routes

## Environment Variables Summary

```env
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
OPENROUTER_API_KEY=your_openrouter_api_key
SESSION_SECRET=random_secret_string
NODE_ENV=production
# BACKEND_URL is optional - Railway provides RAILWAY_PUBLIC_DOMAIN automatically
# BACKEND_URL=https://your-app.railway.app
```

## Local Development

### Option 1: Combined Development (Recommended)

From the root directory:

```bash
npm install
npm run dev
```

This runs both the server and frontend concurrently.

### Option 2: Separate Development

**Backend:**
```bash
cd server
npm install
cp .env.example .env  # Edit with your credentials
npm start
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

## Build Process

The Railway deployment process:

1. **Install dependencies:** Runs `npm install` at root, which triggers `postinstall` to install server and frontend dependencies
2. **Build frontend:** Runs `npm run build` which builds the frontend to `frontend/dist`
3. **Start server:** Runs `npm start` which starts the Express server
4. **Serve files:** In production, Express serves static files from `frontend/dist` and handles API routes

## Notes

- The backend uses session-based auth with cookies
- For production, ensure `NODE_ENV=production` is set on Railway
- Railway auto-assigns HTTPS domains
- Frontend API calls use relative URLs in production (same origin)
- CORS is only enabled in development when frontend runs on a different port

## Benefits of Single Service Deployment

- **Simpler deployment:** One service instead of two
- **Lower cost:** Only one Railway service to pay for
- **No CORS issues:** Frontend and backend on same origin
- **Easier configuration:** Fewer environment variables to manage
- **Better performance:** No cross-origin requests
