require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const { google } = require('googleapis');
const multer = require('multer');
const https = require('https');
const { Readable } = require('stream');
const path = require('path');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const PORT = process.env.PORT || 3000;
// In production, frontend is served from the same origin, so we use the backend URL
const FRONTEND_URL = process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173');
// Use Railway's public domain if available, otherwise fall back to BACKEND_URL or construct from request
const BACKEND_URL = process.env.RAILWAY_PUBLIC_DOMAIN 
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : (process.env.BACKEND_URL || (process.env.NODE_ENV === 'production' ? '' : `http://localhost:${PORT}`));

// Google OAuth2 configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

// Helper function to get redirect URI (constructs from request if needed)
function getRedirectUri(req) {
  if (BACKEND_URL) {
    return `${BACKEND_URL}/oauth/callback`;
  }
  // Fallback: construct from request
  const protocol = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${protocol}://${host}/oauth/callback`;
}

// OpenRouter configuration
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = 'x-ai/grok-4-fast';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Middleware
// CORS configuration
if (FRONTEND_URL && FRONTEND_URL !== '') {
  // Development: frontend on different port
  app.use(cors({
    origin: FRONTEND_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));
  console.log('[CORS] Enabled for:', FRONTEND_URL);
} else {
  // Production: same origin, no CORS needed
  console.log('[CORS] Same origin mode (production)');
}
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  name: 'sessionId', // Explicit session name
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true
  }
}));

// Log session middleware
app.use((req, res, next) => {
  if (req.path.startsWith('/api/auth') || req.path.startsWith('/oauth') || req.path.startsWith('/auth')) {
    console.log('[Session]', req.method, req.path, {
      sessionId: req.sessionID,
      hasSession: !!req.session,
      hasTokens: !!req.session?.tokens
    });
  }
  next();
});

// Serve static files from frontend dist folder in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/dist')));
}

// Create OAuth2 client
function createOAuth2Client(redirectUri) {
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, redirectUri);
}

// Get authenticated OAuth2 client from session
function getAuthenticatedClient(req) {
  if (!req.session.tokens) {
    throw new Error('Not authenticated');
  }
  const redirectUri = getRedirectUri(req);
  const oauth2Client = createOAuth2Client(redirectUri);
  oauth2Client.setCredentials(req.session.tokens);
  return oauth2Client;
}


// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Start OAuth flow
app.get('/auth/google', (req, res) => {
  const redirectUri = getRedirectUri(req);
  console.log('[Auth] Starting OAuth flow:', { redirectUri, sessionId: req.sessionID });
  const oauth2Client = createOAuth2Client(redirectUri);
  const scopes = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/drive'
  ];
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
  });
  console.log('[Auth] Redirecting to Google:', authUrl);
  res.redirect(authUrl);
});

// OAuth callback
app.get('/oauth/callback', async (req, res) => {
  const { code } = req.query;
  console.log('[OAuth Callback] Received callback:', { 
    hasCode: !!code, 
    codeLength: code?.length,
    sessionId: req.sessionID,
    cookies: req.headers.cookie ? 'present' : 'missing'
  });
  
  if (!code) {
    console.error('[OAuth Callback] No code provided');
    const redirectUrl = FRONTEND_URL || '/';
    return res.redirect(`${redirectUrl}?error=no_code`);
  }
  try {
    const redirectUri = getRedirectUri(req);
    console.log('[OAuth Callback] Using redirect URI:', redirectUri);
    const oauth2Client = createOAuth2Client(redirectUri);
    const { tokens } = await oauth2Client.getToken(code);
    console.log('[OAuth Callback] Tokens received:', { 
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token 
    });
    
    // Save session
    req.session.tokens = tokens;
    
    // Save session explicitly
    req.session.save((err) => {
      if (err) {
        console.error('[OAuth Callback] Session save error:', err);
      } else {
        console.log('[OAuth Callback] Session saved successfully:', {
          sessionId: req.sessionID,
          hasTokens: !!req.session.tokens
        });
      }
      
      const redirectUrl = FRONTEND_URL || '/';
      console.log('[OAuth Callback] Redirecting to:', redirectUrl);
      res.redirect(`${redirectUrl}?auth=success`);
    });
  } catch (error) {
    console.error('[OAuth Callback] Error:', error.message, error.stack);
    const redirectUrl = FRONTEND_URL || '/';
    res.redirect(`${redirectUrl}?error=${encodeURIComponent(error.message || 'auth_failed')}`);
  }
});

// Check auth status
app.get('/api/auth/status', (req, res) => {
  const hasTokens = !!req.session.tokens;
  console.log('[Auth Status] Request received:', {
    hasSession: !!req.session,
    hasTokens,
    sessionId: req.sessionID,
    cookies: req.headers.cookie ? 'present' : 'missing'
  });
  res.json({ authenticated: hasTokens });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Get folder structure
app.get('/api/folders', async (req, res) => {
  try {
    const oauth2Client = getAuthenticatedClient(req);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    const allFolders = [];
    let nextPageToken = null;

    do {
      const response = await drive.files.list({
        q: "mimeType='application/vnd.google-apps.folder' and trashed=false and 'me' in owners",
        fields: 'nextPageToken, files(id, name, parents)',
        pageSize: 1000,
        pageToken: nextPageToken,
      });
      allFolders.push(...(response.data.files || []));
      nextPageToken = response.data.nextPageToken;
    } while (nextPageToken);

    // Build tree structure
    const folderMap = new Map();
    const rootFolders = [];

    allFolders.forEach(folder => {
      folderMap.set(folder.id, { id: folder.id, name: folder.name, parents: folder.parents || ['root'], folders: [] });
    });

    allFolders.forEach(folder => {
      const folderObj = folderMap.get(folder.id);
      const parentId = folder.parents?.[0] || 'root';
      if (parentId === 'root' || !folderMap.has(parentId)) {
        rootFolders.push(folderObj);
      } else {
        folderMap.get(parentId).folders.push(folderObj);
      }
    });

    const sortFolders = (list) => {
      list.sort((a, b) => a.name.localeCompare(b.name));
      list.forEach(f => sortFolders(f.folders));
    };
    sortFolders(rootFolders);

    res.json({ success: true, structure: { id: 'root', name: 'My Drive', path: '', folders: rootFolders } });
  } catch (error) {
    console.error('Folder fetch error:', error);
    res.status(error.message === 'Not authenticated' ? 401 : 500).json({ success: false, message: error.message });
  }
});


// Upload file
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    const oauth2Client = getAuthenticatedClient(req);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const hintText = req.body.hint;

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file provided' });
    }

    const fileMetadata = { name: req.file.originalname };
    const media = { mimeType: req.file.mimetype, body: Readable.from(req.file.buffer) };

    const response = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id,name,webViewLink,parents',
    });

    let moved = false;
    let moveMessage = '';

    // Try to find matching folder using AI
    if (hintText || req.file.originalname) {
      const matchedFolder = await findMatchingFolder(drive, hintText, req.file.originalname, {
        extension: req.file.originalname.split('.').pop(),
        fileType: getFileType(req.file.originalname),
        size: req.file.size
      });

      if (matchedFolder) {
        const file = await drive.files.get({ fileId: response.data.id, fields: 'parents' });
        const previousParents = file.data.parents.join(',');
        await drive.files.update({
          fileId: response.data.id,
          addParents: matchedFolder.id,
          removeParents: previousParents,
          fields: 'id,name,parents'
        });
        moved = true;
        moveMessage = ` and moved to "${matchedFolder.name}"`;
      } else {
        moveMessage = hintText ? ' (no matching folder found)' : '';
      }
    }

    res.json({
      success: true,
      file: response.data,
      moved,
      message: `File "${req.file.originalname}" uploaded successfully${moveMessage}!`
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(error.message === 'Not authenticated' ? 401 : 500).json({ success: false, message: error.message });
  }
});

function getFileType(filename) {
  const ext = '.' + filename.split('.').pop().toLowerCase();
  const typeMap = {
    '.jpg': 'Image', '.jpeg': 'Image', '.png': 'Image', '.gif': 'Image', '.webp': 'Image',
    '.mp4': 'Video', '.avi': 'Video', '.mov': 'Video', '.mkv': 'Video',
    '.mp3': 'Audio', '.wav': 'Audio', '.flac': 'Audio',
    '.pdf': 'Document', '.doc': 'Document', '.docx': 'Document',
    '.xls': 'Spreadsheet', '.xlsx': 'Spreadsheet',
    '.ppt': 'Presentation', '.pptx': 'Presentation',
    '.txt': 'Text', '.zip': 'Archive', '.rar': 'Archive',
    '.js': 'Code', '.ts': 'Code', '.py': 'Code', '.html': 'Code', '.css': 'Code'
  };
  return typeMap[ext] || 'File';
}

async function findMatchingFolder(drive, hintText, fileName, fileMetadata) {
  if (!OPENROUTER_API_KEY) return null;

  try {
    const allFolders = [];
    let nextPageToken = null;
    do {
      const response = await drive.files.list({
        q: "mimeType='application/vnd.google-apps.folder' and trashed=false and 'me' in owners",
        fields: 'nextPageToken, files(id, name)',
        pageSize: 1000,
        pageToken: nextPageToken,
      });
      allFolders.push(...(response.data.files || []));
      nextPageToken = response.data.nextPageToken;
    } while (nextPageToken);

    if (allFolders.length === 0) return null;

    const folderList = allFolders.map(f => f.name).join(', ');
    const fileInfo = [
      fileName ? `File name: "${fileName}"` : '',
      fileMetadata.extension ? `Extension: ${fileMetadata.extension}` : '',
      fileMetadata.fileType ? `Type: ${fileMetadata.fileType}` : ''
    ].filter(Boolean).join(', ');

    const requestBody = JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [
        { role: 'system', content: `Match files to folders. Available folders: ${folderList}. Return ONLY the exact folder name or "NONE".` },
        { role: 'user', content: `${fileInfo}${hintText ? `. Hint: "${hintText}"` : ''}. Which folder?` }
      ],
      temperature: 0.3
    });

    return new Promise((resolve) => {
      const req = https.request({
        hostname: 'openrouter.ai',
        path: '/api/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer': BACKEND_URL
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            const folderName = response.choices?.[0]?.message?.content?.trim().replace(/^["']|["']$/g, '');
            if (!folderName || folderName.toLowerCase() === 'none') {
              resolve(null);
            } else {
              resolve(allFolders.find(f => f.name.toLowerCase() === folderName.toLowerCase()) || null);
            }
          } catch { resolve(null); }
        });
      });
      req.on('error', () => resolve(null));
      req.write(requestBody);
      req.end();
    });
  } catch { return null; }
}


// Create folder
app.post('/api/folders', async (req, res) => {
  try {
    const oauth2Client = getAuthenticatedClient(req);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const { name, parentId = 'root' } = req.body;

    const fileMetadata = {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId !== 'root' ? [parentId] : undefined
    };

    const response = await drive.files.create({ resource: fileMetadata, fields: 'id,name,webViewLink' });
    res.json({ success: true, folder: response.data, message: `Folder "${name}" created!` });
  } catch (error) {
    res.status(error.message === 'Not authenticated' ? 401 : 500).json({ success: false, message: error.message });
  }
});

// Move file
app.post('/api/files/move', async (req, res) => {
  try {
    const oauth2Client = getAuthenticatedClient(req);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const { fileId, newParentId } = req.body;

    const file = await drive.files.get({ fileId, fields: 'parents' });
    const previousParents = file.data.parents.join(',');

    const response = await drive.files.update({
      fileId,
      addParents: newParentId,
      removeParents: previousParents,
      fields: 'id,name,parents'
    });

    res.json({ success: true, file: response.data, message: 'File moved!' });
  } catch (error) {
    res.status(error.message === 'Not authenticated' ? 401 : 500).json({ success: false, message: error.message });
  }
});

// Search files
app.get('/api/files/search', async (req, res) => {
  try {
    const oauth2Client = getAuthenticatedClient(req);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const { q } = req.query;

    const response = await drive.files.list({
      q: `name contains '${q}' and trashed=false`,
      fields: 'files(id, name, mimeType, parents, size, modifiedTime)',
      orderBy: 'name',
      pageSize: 50
    });

    res.json({ success: true, items: response.data.files || [] });
  } catch (error) {
    res.status(error.message === 'Not authenticated' ? 401 : 500).json({ success: false, message: error.message });
  }
});

// Get latest file
app.get('/api/files/latest', async (req, res) => {
  try {
    const oauth2Client = getAuthenticatedClient(req);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    const response = await drive.files.list({
      q: "trashed=false and 'me' in owners and mimeType != 'application/vnd.google-apps.folder'",
      fields: 'files(id, name, mimeType, size, modifiedTime, webViewLink, parents)',
      orderBy: 'modifiedTime desc',
      pageSize: 1
    });

    if (response.data.files?.length > 0) {
      const file = response.data.files[0];
      let parentName = 'My Drive';
      if (file.parents?.length > 0) {
        try {
          const parent = await drive.files.get({ fileId: file.parents[0], fields: 'name' });
          parentName = parent.data.name;
        } catch {}
      }
      res.json({ success: true, file: { ...file, parentName } });
    } else {
      res.json({ success: false, message: 'No files found' });
    }
  } catch (error) {
    res.status(error.message === 'Not authenticated' ? 401 : 500).json({ success: false, message: error.message });
  }
});

// Chat with AI
app.post('/api/chat', async (req, res) => {
  if (!OPENROUTER_API_KEY) {
    return res.json({ success: false, message: 'AI not configured' });
  }

  try {
    const { messages, driveContext } = req.body;
    const systemMessage = {
      role: 'system',
      content: `You are a Google Drive assistant. ${driveContext || ''}`
    };

    const requestBody = JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [systemMessage, ...messages]
    });

    const aiReq = https.request({
      hostname: 'openrouter.ai',
      path: '/api/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': BACKEND_URL
      }
    }, (aiRes) => {
      let data = '';
      aiRes.on('data', chunk => data += chunk);
      aiRes.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.choices?.[0]) {
            res.json({ success: true, message: response.choices[0].message.content });
          } else {
            res.json({ success: false, message: response.error?.message || 'AI error' });
          }
        } catch { res.json({ success: false, message: 'Parse error' }); }
      });
    });

    aiReq.on('error', (e) => res.json({ success: false, message: e.message }));
    aiReq.write(requestBody);
    aiReq.end();
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// Serve frontend for all non-API routes in production (SPA fallback)
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    // Don't serve index.html for API routes
    if (req.path.startsWith('/api') || req.path.startsWith('/auth') || req.path.startsWith('/oauth')) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  if (process.env.NODE_ENV === 'production') {
    console.log('Serving frontend from static files');
  }
});
