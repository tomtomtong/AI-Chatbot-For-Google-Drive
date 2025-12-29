// Use relative URLs in production (same origin), or env variable in development
const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : 'http://localhost:3000');

class GoogleDriveUploader {
  constructor() {
    this.isAuthenticated = false;
    this.uploadHistory = JSON.parse(localStorage.getItem('uploadHistory') || '[]');
    this.chatHistory = [];
    this.justLoggedIn = false; // Track if we just completed login
    this.init();
  }

  async init() {
    console.log('[App] Initializing...');
    this.checkUrlParams();
    this.bindEvents();
    await this.checkAuthStatus();
    this.renderUploadHistory();
    this.loadVisitorCount();
    console.log('[App] Initialization complete');
  }

  checkUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const authParam = params.get('auth');
    const errorParam = params.get('error');
    
    console.log('[Auth] URL params:', { auth: authParam, error: errorParam });
    console.log('[Auth] Current URL:', window.location.href);
    console.log('[Auth] Current cookies:', document.cookie || 'no cookies');
    console.log('[Auth] API_URL:', API_URL || '(empty - using relative URLs)');
    
    if (authParam === 'success') {
      console.log('[Auth] Login successful, checking auth status...');
      this.justLoggedIn = true; // Mark that we just logged in
      this.showAuthDebug('Login successful! Verifying session...');
      this.hideAuthError();
      window.history.replaceState({}, '', window.location.pathname);
      // Force a fresh auth check after successful login with a small delay to ensure session is saved
      setTimeout(() => {
        this.checkAuthStatus();
      }, 1000); // Increased delay to allow cookie propagation
    } else if (errorParam) {
      console.error('[Auth] Login error:', errorParam);
      const decodedError = decodeURIComponent(errorParam);
      this.showAuthError(`Authentication failed: ${decodedError}`);
      this.showAuthDebug(`Error: ${decodedError}`);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }

  bindEvents() {
    document.getElementById('login-btn').addEventListener('click', () => this.handleLogin());
    document.getElementById('logout-btn').addEventListener('click', () => this.handleLogout());
    document.getElementById('upload-btn').addEventListener('click', () => document.getElementById('file-input').click());
    document.getElementById('file-input').addEventListener('change', (e) => this.handleUpload(e));
    document.getElementById('refresh-folders-btn').addEventListener('click', () => this.loadFolderStructure());
    document.getElementById('chat-send-btn').addEventListener('click', () => this.handleChatMessage());
    document.getElementById('chat-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleChatMessage();
    });
  }

  async checkAuthStatus(retryCount = 0) {
    const maxRetries = 5; // Increased retries
    try {
      const apiEndpoint = API_URL ? `${API_URL}/api/auth/status` : '/api/auth/status';
      console.log('[Auth] Checking authentication status...', { 
        API_URL: API_URL || '(empty)', 
        endpoint: apiEndpoint,
        attempt: retryCount + 1,
        justLoggedIn: this.justLoggedIn,
        cookies: document.cookie || 'no cookies'
      });
      
      if (retryCount === 0) {
        this.showAuthDebug('Checking authentication...');
        this.hideAuthError();
      }
      
      const res = await fetch(apiEndpoint, { 
        credentials: 'include',
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache'
        }
      });
      
      console.log('[Auth] Response status:', res.status, res.statusText);
      const responseHeaders = Object.fromEntries(res.headers.entries());
      console.log('[Auth] Response headers:', responseHeaders);
      
      // Check for Set-Cookie header
      const setCookieHeader = res.headers.get('Set-Cookie');
      if (setCookieHeader) {
        console.log('[Auth] Set-Cookie header received:', setCookieHeader);
      } else {
        console.log('[Auth] No Set-Cookie header in response');
      }
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error('[Auth] Response error:', errorText);
        throw new Error(`HTTP ${res.status}: ${res.statusText} - ${errorText}`);
      }
      
      const data = await res.json();
      console.log('[Auth] Auth status response:', data);
      this.isAuthenticated = data.authenticated;
      
      if (this.isAuthenticated) {
        console.log('[Auth] ✅ User is authenticated!');
        this.justLoggedIn = false; // Reset flag
        this.hideAuthDebug();
        this.hideAuthError();
      } else {
        console.log('[Auth] ❌ User is NOT authenticated');
        console.log('[Auth] Session info:', {
          cookies: document.cookie || 'no cookies',
          justLoggedIn: this.justLoggedIn,
          retryCount
        });
        
        // Retry if we just came from a successful login
        if (retryCount < maxRetries && this.justLoggedIn) {
          console.log('[Auth] Retrying auth check...', retryCount + 1);
          this.showAuthDebug(`Verifying session... (attempt ${retryCount + 2}/${maxRetries + 1})`);
          setTimeout(() => this.checkAuthStatus(retryCount + 1), 1500); // Longer delay
          return;
        }
        
        // If we've exhausted retries after login, show error
        if (this.justLoggedIn && retryCount >= maxRetries) {
          this.showAuthError('Session verification failed. Please try logging in again.');
          this.showAuthDebug('Session cookie may not be set. Check browser console for details.');
          this.justLoggedIn = false;
        } else {
          this.showAuthDebug('Not authenticated. Please sign in.');
        }
      }
      
      this.updateUI();
    } catch (error) {
      console.error('[Auth] Auth check failed:', error);
      console.error('[Auth] Error details:', {
        message: error.message,
        stack: error.stack,
        cookies: document.cookie || 'no cookies'
      });
      
      // Retry on network errors or if we just logged in
      if (retryCount < maxRetries && (this.justLoggedIn || error.message.includes('Failed to fetch') || error.message.includes('Network'))) {
        console.log('[Auth] Retrying auth check...', retryCount + 1);
        this.showAuthDebug(`Connection issue, retrying... (attempt ${retryCount + 2}/${maxRetries + 1})`);
        setTimeout(() => this.checkAuthStatus(retryCount + 1), 1500);
        return;
      }
      
      const errorMsg = `Authentication check failed: ${error.message}`;
      this.showAuthError(errorMsg);
      this.showAuthDebug(`Error: ${error.message}. Check console for details.`);
      this.isAuthenticated = false;
      this.justLoggedIn = false;
      this.updateUI();
    }
  }

  showAuthError(message) {
    const el = document.getElementById('auth-error');
    if (el) {
      el.textContent = message;
      el.style.display = 'block';
    }
  }

  hideAuthError() {
    const el = document.getElementById('auth-error');
    if (el) {
      el.style.display = 'none';
    }
  }

  showAuthDebug(message) {
    const el = document.getElementById('auth-debug');
    if (el) {
      el.textContent = `Debug: ${message}`;
      el.style.display = 'block';
    }
  }

  hideAuthDebug() {
    const el = document.getElementById('auth-debug');
    if (el) {
      el.style.display = 'none';
    }
  }

  updateUI() {
    const loginView = document.getElementById('login-view');
    const authenticatedView = document.getElementById('authenticated-view');
    const uploadSection = document.getElementById('upload-section');
    const folderSection = document.getElementById('folder-structure-section');
    const chatSection = document.getElementById('chatbot-section');

    if (this.isAuthenticated) {
      loginView.classList.add('hidden');
      authenticatedView.classList.remove('hidden');
      uploadSection.classList.remove('hidden');
      folderSection.classList.remove('hidden');
      chatSection.classList.add('hidden'); // Hidden for now
      this.loadFolderStructure();
    } else {
      loginView.classList.remove('hidden');
      authenticatedView.classList.add('hidden');
      uploadSection.classList.add('hidden');
      folderSection.classList.add('hidden');
      chatSection.classList.add('hidden');
    }
  }

  handleLogin() {
    console.log('[Auth] Initiating login, redirecting to:', `${API_URL}/auth/google`);
    window.location.href = `${API_URL}/auth/google`;
  }

  async handleLogout() {
    try {
      await fetch(`${API_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' });
      this.isAuthenticated = false;
      this.updateUI();
      this.showStatus('Signed out successfully', 'success');
    } catch (error) {
      this.showStatus('Sign out failed', 'error');
    }
  }


  async handleUpload(e) {
    const files = Array.from(e.target.files);
    if (!files || files.length === 0) return;

    const uploadBtn = document.getElementById('upload-btn');
    const hintInput = document.getElementById('upload-hint-input');
    const progressContainer = document.getElementById('upload-progress-container');
    
    // Validate description is provided
    const hint = hintInput.value.trim();
    if (!hint) {
      this.showStatus('Please enter a description for the files', 'error');
      hintInput.focus();
      e.target.value = '';
      return;
    }
    
    uploadBtn.disabled = true;
    uploadBtn.textContent = files.length === 1 ? 'Uploading...' : `Uploading ${files.length} files...`;
    
    // Show progress container for multiple files
    if (files.length > 1) {
      progressContainer.style.display = 'block';
      progressContainer.innerHTML = '';
    }
    let successCount = 0;
    let errorCount = 0;
    let movedCount = 0;
    const results = [];

    // Upload files sequentially to avoid overwhelming the server
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      // Show progress for this file
      if (files.length > 1) {
        this.showFileProgress(file.name, i + 1, files.length, 'uploading');
      }

      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('hint', hint);

        const res = await fetch(`${API_URL}/api/upload`, {
          method: 'POST',
          body: formData,
          credentials: 'include'
        });
        const result = await res.json();

        if (result.success) {
          successCount++;
          if (result.moved) movedCount++;
          this.addToHistory(result.file);
          results.push({ file: result.file, success: true });
          
          if (files.length > 1) {
            this.showFileProgress(file.name, i + 1, files.length, 'success');
          } else {
            this.showStatus(result.message, 'success');
          }
        } else {
          errorCount++;
          results.push({ file: { name: file.name }, success: false, error: result.message });
          
          if (files.length > 1) {
            this.showFileProgress(file.name, i + 1, files.length, 'error', result.message);
          } else {
            this.showStatus(result.message, 'error');
          }
        }
      } catch (error) {
        errorCount++;
        results.push({ file: { name: file.name }, success: false, error: error.message });
        
        if (files.length > 1) {
          this.showFileProgress(file.name, i + 1, files.length, 'error', error.message);
        } else {
          this.showStatus('Upload failed', 'error');
        }
      }
    }

    // Show summary for multiple files
    if (files.length > 1) {
      const summary = `Uploaded ${successCount} of ${files.length} file${files.length > 1 ? 's' : ''}${movedCount > 0 ? ` (${movedCount} organized)` : ''}`;
      this.showStatus(successCount === files.length ? summary : `${summary}. ${errorCount} failed.`, 
                     successCount === files.length ? 'success' : 'error');
      
      // Hide progress container after a delay
      setTimeout(() => {
        progressContainer.style.display = 'none';
      }, 5000);
    }

    // Update history and folder structure if needed
    if (successCount > 0) {
      this.renderUploadHistory();
      if (movedCount > 0) this.loadFolderStructure();
    }

    // Clear input
    hintInput.value = '';
    uploadBtn.disabled = false;
    uploadBtn.textContent = 'Select Files to Upload';
    e.target.value = '';
  }

  showFileProgress(fileName, current, total, status, errorMessage = '') {
    const progressContainer = document.getElementById('upload-progress-container');
    const fileId = `progress-${current}`;
    let progressItem = document.getElementById(fileId);
    
    if (!progressItem) {
      progressItem = document.createElement('div');
      progressItem.id = fileId;
      progressItem.className = 'upload-progress-item';
      progressContainer.appendChild(progressItem);
    }

    const statusIcon = status === 'success' ? '✓' : status === 'error' ? '✗' : '⟳';
    const statusClass = status === 'success' ? 'success' : status === 'error' ? 'error' : 'uploading';
    const shortName = fileName.length > 40 ? fileName.substring(0, 37) + '...' : fileName;
    
    progressItem.innerHTML = `
      <span class="progress-icon ${statusClass}">${statusIcon}</span>
      <span class="progress-text">[${current}/${total}] ${this.escapeHtml(shortName)}</span>
      ${errorMessage ? `<span class="progress-error">${this.escapeHtml(errorMessage)}</span>` : ''}
    `;
    progressItem.className = `upload-progress-item ${statusClass}`;
  }

  showStatus(message, type) {
    const el = document.getElementById('upload-status');
    el.textContent = message;
    el.className = `status-message ${type}`;
    if (type === 'success') setTimeout(() => { el.textContent = ''; el.className = 'status-message'; }, 5000);
  }

  addToHistory(file) {
    this.uploadHistory.unshift({ id: file.id, name: file.name, webViewLink: file.webViewLink, uploadedAt: new Date().toISOString() });
    if (this.uploadHistory.length > 10) this.uploadHistory = this.uploadHistory.slice(0, 10);
    localStorage.setItem('uploadHistory', JSON.stringify(this.uploadHistory));
  }

  renderUploadHistory() {
    const list = document.getElementById('history-list');
    if (this.uploadHistory.length === 0) {
      list.innerHTML = '<p style="color: #5f6368; font-style: italic;">No uploads yet</p>';
      return;
    }
    list.innerHTML = this.uploadHistory.map(item => `
      <div class="history-item">
        <span class="file-name">${this.escapeHtml(item.name)}</span>
        <a href="${item.webViewLink}" target="_blank" class="file-link">View in Drive</a>
      </div>
    `).join('');
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  async loadFolderStructure() {
    const tree = document.getElementById('folder-tree');
    const loading = document.getElementById('folder-loading');
    const btn = document.getElementById('refresh-folders-btn');

    loading.style.display = 'block';
    tree.innerHTML = '';
    btn.disabled = true;

    try {
      const res = await fetch(`${API_URL}/api/folders`, { credentials: 'include' });
      const result = await res.json();
      loading.style.display = 'none';

      if (result.success) {
        this.renderFolderStructure(result.structure);
      } else {
        tree.innerHTML = `<div class="error-message">${result.message}</div>`;
      }
    } catch (error) {
      loading.style.display = 'none';
      tree.innerHTML = `<div class="error-message">Failed to load folders</div>`;
    } finally {
      btn.disabled = false;
    }
  }

  renderFolderStructure(structure) {
    const tree = document.getElementById('folder-tree');
    let html = `<div class="folder-structure"><div class="root-folder">
      <div class="folder-header root-header"><span class="folder-icon">[Folder]</span><span class="folder-name">${this.escapeHtml(structure.name)}</span></div>`;
    
    if (structure.folders?.length > 0) {
      html += '<div class="root-children">';
      structure.folders.forEach(f => html += this.renderFolderItem(f, 0));
      html += '</div>';
    }
    html += '</div></div>';
    tree.innerHTML = html;

    tree.querySelectorAll('.folder-header').forEach(header => {
      header.addEventListener('click', function() {
        this.closest('.folder-item, .root-folder')?.classList.toggle('expanded');
      });
    });
  }

  renderFolderItem(folder, level) {
    const hasFolders = folder.folders?.length > 0;
    let html = `<div class="folder-item" style="padding-left: ${level * 20}px;">
      <div class="folder-header"><span class="folder-icon">${hasFolders ? '[Folder]' : '[File]'}</span>
      <span class="folder-name">${this.escapeHtml(folder.name)}</span>
      ${hasFolders ? `<span class="folder-count">(${folder.folders.length})</span>` : ''}</div>`;
    
    if (hasFolders) {
      html += '<div class="folder-children">';
      folder.folders.forEach(f => html += this.renderFolderItem(f, level + 1));
      html += '</div>';
    }
    return html + '</div>';
  }


  async handleChatMessage() {
    const input = document.getElementById('chat-input');
    const btn = document.getElementById('chat-send-btn');
    const message = input.value.trim();
    if (!message) return;

    input.disabled = true;
    btn.disabled = true;
    this.addChatMessage(message, 'user');
    input.value = '';

    try {
      this.chatHistory.push({ role: 'user', content: message });
      const response = await this.processChatMessage(message);
      this.chatHistory.push({ role: 'assistant', content: response });
      this.addChatMessage(response, 'bot');
    } catch (error) {
      this.addChatMessage(`Error: ${error.message}`, 'bot');
    } finally {
      input.disabled = false;
      btn.disabled = false;
      input.focus();
    }
  }

  async processChatMessage(message) {
    const lower = message.toLowerCase();

    // Create folder
    if (lower.includes('create') && lower.includes('folder')) {
      const match = message.match(/folder.*?(?:called|named)?\s*['"]?([^'"]+)['"]?$/i);
      if (!match) return "Please specify a folder name, e.g., 'Create a folder called Documents'";
      
      const res = await fetch(`${API_URL}/api/folders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: match[1].trim() }),
        credentials: 'include'
      });
      const result = await res.json();
      if (result.success) {
        this.loadFolderStructure();
        return `✅ Created folder "${match[1].trim()}"!`;
      }
      return `❌ ${result.message}`;
    }

    // Search
    if (lower.includes('search') || lower.includes('find')) {
      const match = message.match(/(?:search|find).*?['"]?([^'"]+)['"]?$/i);
      if (!match) return "What would you like to search for?";
      
      const res = await fetch(`${API_URL}/api/files/search?q=${encodeURIComponent(match[1].trim())}`, { credentials: 'include' });
      const result = await res.json();
      if (!result.success) return `❌ ${result.message}`;
      if (result.items.length === 0) return `No items found matching "${match[1]}"`;
      
      return `Found ${result.items.length} item(s):\n` + result.items.slice(0, 10).map(i => 
        `• ${i.mimeType?.includes('folder') ? '[Folder]' : '[File]'} ${i.name}`
      ).join('\n');
    }

    // Latest file
    if (lower.includes('latest') || lower.includes('recent')) {
      const res = await fetch(`${API_URL}/api/files/latest`, { credentials: 'include' });
      const result = await res.json();
      if (!result.success) return result.message;
      const f = result.file;
      return `Latest file: ${f.name}\nType: ${f.mimeType}\nLocation: ${f.parentName}\nModified: ${new Date(f.modifiedTime).toLocaleString()}`;
    }

    // AI chat fallback
    const res = await fetch(`${API_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: this.chatHistory }),
      credentials: 'include'
    });
    const result = await res.json();
    return result.success ? result.message : `Sorry: ${result.message}`;
  }

  addChatMessage(content, role) {
    const messages = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = `chat-message ${role}-message`;
    div.innerHTML = `<div class="message-content">${this.escapeHtml(content).replace(/\n/g, '<br>')}</div>`;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  }

  async loadVisitorCount() {
    try {
      // First, increment the visitor count (this visit)
      const res = await fetch(`${API_URL}/api/visitors`, { 
        credentials: 'include',
        cache: 'no-store'
      });
      if (res.ok) {
        const data = await res.json();
        const countEl = document.getElementById('visitor-count');
        if (countEl) {
          countEl.textContent = data.count.toLocaleString();
        }
      }
    } catch (error) {
      console.error('[Visitor] Error loading visitor count:', error);
      // Try to get count without incrementing as fallback
      try {
        const res = await fetch(`${API_URL}/api/visitors/count`, { 
          credentials: 'include',
          cache: 'no-store'
        });
        if (res.ok) {
          const data = await res.json();
          const countEl = document.getElementById('visitor-count');
          if (countEl) {
            countEl.textContent = data.count.toLocaleString();
          }
        }
      } catch (fallbackError) {
        console.error('[Visitor] Fallback also failed:', fallbackError);
      }
    }
  }
}

document.addEventListener('DOMContentLoaded', () => new GoogleDriveUploader());
