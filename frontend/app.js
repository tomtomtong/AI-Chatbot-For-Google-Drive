// Use relative URLs in production (same origin), or env variable in development
const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : 'http://localhost:3000');

class GoogleDriveUploader {
  constructor() {
    this.isAuthenticated = false;
    this.uploadHistory = JSON.parse(localStorage.getItem('uploadHistory') || '[]');
    this.chatHistory = [];
    this.init();
  }

  async init() {
    this.checkUrlParams();
    this.bindEvents();
    await this.checkAuthStatus();
    this.renderUploadHistory();
  }

  checkUrlParams() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('auth') === 'success') {
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('error')) {
      this.showStatus(`Authentication failed: ${params.get('error')}`, 'error');
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

  async checkAuthStatus() {
    try {
      const res = await fetch(`${API_URL}/api/auth/status`, { credentials: 'include' });
      const data = await res.json();
      this.isAuthenticated = data.authenticated;
      this.updateUI();
    } catch (error) {
      console.error('Auth check failed:', error);
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
      chatSection.classList.remove('hidden');
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
    const file = e.target.files[0];
    if (!file) return;

    const uploadBtn = document.getElementById('upload-btn');
    const hintInput = document.getElementById('upload-hint-input');
    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Uploading...';

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('hint', hintInput.value.trim());

      const res = await fetch(`${API_URL}/api/upload`, {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });
      const result = await res.json();

      if (result.success) {
        this.showStatus(result.message, 'success');
        this.addToHistory(result.file);
        this.renderUploadHistory();
        hintInput.value = '';
        if (result.moved) this.loadFolderStructure();
      } else {
        this.showStatus(result.message, 'error');
      }
    } catch (error) {
      this.showStatus('Upload failed', 'error');
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.textContent = 'Select File to Upload';
      e.target.value = '';
    }
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
      <div class="folder-header root-header"><span class="folder-icon">📁</span><span class="folder-name">${this.escapeHtml(structure.name)}</span></div>`;
    
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
      <div class="folder-header"><span class="folder-icon">${hasFolders ? '📁' : '📂'}</span>
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
        `• ${i.mimeType?.includes('folder') ? '📁' : '📄'} ${i.name}`
      ).join('\n');
    }

    // Latest file
    if (lower.includes('latest') || lower.includes('recent')) {
      const res = await fetch(`${API_URL}/api/files/latest`, { credentials: 'include' });
      const result = await res.json();
      if (!result.success) return result.message;
      const f = result.file;
      return `📄 Latest file: ${f.name}\nType: ${f.mimeType}\nLocation: ${f.parentName}\nModified: ${new Date(f.modifiedTime).toLocaleString()}`;
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
}

document.addEventListener('DOMContentLoaded', () => new GoogleDriveUploader());
