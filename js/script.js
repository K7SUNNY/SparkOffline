const UI_STORAGE_KEYS = {
    theme: 'spark_theme',
    model: 'spark_default_model',
    memory: 'spark_memory'
};

function safeParseJSON(raw, fallback) {
    try {
        const parsed = JSON.parse(raw);
        return parsed ?? fallback;
    } catch {
        return fallback;
    }
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getThemeSelection() {
    const saved = localStorage.getItem(UI_STORAGE_KEYS.theme);
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
    return 'dark';
}

function resolveTheme(selection) {
    if (selection === 'light' || selection === 'dark') return selection;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyThemeSelection(selection) {
    const normalized = (selection === 'light' || selection === 'dark' || selection === 'system')
        ? selection
        : 'dark';

    localStorage.setItem(UI_STORAGE_KEYS.theme, normalized);

    const resolved = resolveTheme(normalized);
    if (document.body) {
        document.body.setAttribute('data-theme', resolved);
    }
}

// ==================== PROFILE & USER DATA HELPERS ====================

function getProfileData() {
    const raw = localStorage.getItem('spark_profile');
    const parsed = safeParseJSON(raw, {});
    return {
        name: parsed.name || 'Guest User',
        email: parsed.email || 'user@example.com',
        displayName: parsed.displayName || 'SparkUser',
        phone: parsed.phone || '',
        avatar: localStorage.getItem('spark_avatar') || 'assets/avatar.png',
        joined: parsed.joined || 'Dec 2024'
    };
}

function saveProfileData(data) {
    localStorage.setItem('spark_profile', JSON.stringify(data));
}

function syncGlobalProfileUI() {
    const profile = getProfileData();
    // Update all header avatars across pages
    const headerAvatars = document.querySelectorAll('.profile-btn .profile-img');
    headerAvatars.forEach(img => {
        if (img) img.src = profile.avatar;
    });

    // Update settings preview card if present
    const settingsAvatar = document.getElementById('settings-avatar-img');
    const settingsName = document.getElementById('settings-profile-name');
    const settingsEmail = document.getElementById('settings-profile-email');
    if (settingsAvatar) settingsAvatar.src = profile.avatar;
    if (settingsName) settingsName.textContent = profile.name;
    if (settingsEmail) settingsEmail.textContent = profile.email;
}


// ==================== IMAGE ATTACHMENTS & LIGHTBOX HELPERS ====================

function compressImage(file, maxDim = 640, quality = 0.85) {
    return new Promise((resolve, reject) => {
        if (!file || !file.type.startsWith('image/')) {
            return reject(new Error('File is not an image'));
        }
        if (file.type === 'image/svg+xml' || file.type === 'image/gif') {
            const reader = new FileReader();
            reader.onload = () => resolve({
                id: 'img-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
                dataUrl: reader.result,
                name: file.name,
                type: file.type,
                size: file.size
            });
            reader.onerror = reject;
            reader.readAsDataURL(file);
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let width = img.width;
                let height = img.height;
                if (width > maxDim || height > maxDim) {
                    if (width > height) {
                        height = Math.round((height * maxDim) / width);
                        width = maxDim;
                    } else {
                        width = Math.round((width * maxDim) / height);
                        height = maxDim;
                    }
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                const outType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
                const dataUrl = canvas.toDataURL(outType, quality);
                resolve({
                    id: 'img-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
                    dataUrl: dataUrl,
                    name: file.name,
                    type: outType,
                    size: Math.round(dataUrl.length * 0.75)
                });
            };
            img.onerror = () => {
                resolve({
                    id: 'img-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
                    dataUrl: e.target.result,
                    name: file.name,
                    type: file.type,
                    size: file.size
                });
            };
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function openImageLightbox(src, title = 'Image Preview') {
    const lightbox = document.getElementById('image-lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    const lightboxTitle = document.getElementById('lightbox-title');
    const downloadBtn = document.getElementById('lightbox-download-btn');
    if (!lightbox || !lightboxImg) return;

    lightboxImg.src = src;
    if (lightboxTitle) lightboxTitle.textContent = title || 'Image Preview';
    if (downloadBtn) {
        downloadBtn.href = src;
        const cleanName = (title ? String(title).replace(/[^a-z0-9_-]/gi, '_') : 'spark-image');
        downloadBtn.download = cleanName + '.png';
    }
    lightbox.classList.remove('hidden');
}

function closeImageLightbox() {
    const lightbox = document.getElementById('image-lightbox');
    if (lightbox) lightbox.classList.add('hidden');
}

function downloadImage(src, filename = 'spark-image.png') {
    const a = document.createElement('a');
    a.href = src;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

window.openImageLightbox = openImageLightbox;
window.closeImageLightbox = closeImageLightbox;
window.downloadImage = downloadImage;

// Marked.js Configuration with Code Highlighting, Copy Button & Image Rendering
if (typeof marked !== 'undefined') {
    const renderer = new marked.Renderer();
    renderer.code = function (tokenOrCode, lang) {
        let code;
        let language;

        if (typeof tokenOrCode === 'object' && tokenOrCode !== null) {
            code = tokenOrCode.text || '';
            language = tokenOrCode.lang || 'text';
        } else {
            code = tokenOrCode;
            language = lang || 'text';
        }

        code = String(code);
        const normalizedLanguage = String(language || 'text')
            .toLowerCase()
            .replace(/[^a-z0-9_+-]/g, '') || 'text';
        const displayLanguage = escapeHtml(normalizedLanguage);

        let highlightedCode = escapeHtml(code);
        if (window.hljs) {
            const validLang = hljs.getLanguage(normalizedLanguage) ? normalizedLanguage : 'plaintext';
            try {
                highlightedCode = hljs.highlight(code, { language: validLang }).value;
            } catch (error) {
                console.error('Highlight error:', error);
                highlightedCode = escapeHtml(code);
            }
        }

        // Detect SVG vector art and render interactive preview
        if (normalizedLanguage === 'svg' || (code.trim().startsWith('<svg') && code.trim().endsWith('</svg>'))) {
            return `
            <div class="svg-preview-wrapper">
                <div class="svg-preview-header">
                    <span>Generated Vector Graphic (SVG)</span>
                    <div class="svg-preview-actions">
                        <button type="button" class="svg-toggle-btn" onclick="const codeEl = this.closest('.svg-preview-wrapper').querySelector('.code-wrapper'); codeEl.style.display = codeEl.style.display === 'none' ? 'block' : 'none';">Toggle Code</button>
                        <button type="button" class="copy-btn">Copy</button>
                    </div>
                </div>
                <div class="svg-render-canvas">${code}</div>
                <div class="code-wrapper" style="display: none; border-top: 1px solid var(--border-color); border-radius: 0;">
                    <pre><code class="hljs language-xml">${highlightedCode}</code></pre>
                </div>
            </div>
            `;
        }

        return `
        <div class="code-wrapper">
            <div class="code-header">
                <span>${displayLanguage}</span>
                <button class="copy-btn" aria-label="Copy code block">Copy</button>
            </div>
            <pre><code class="hljs language-${displayLanguage}">${highlightedCode}</code></pre>
        </div>
        `;
    };

    // AI Generated Image rendering
    renderer.image = function (tokenOrHref, title, text) {
        let href, alt;
        if (typeof tokenOrHref === 'object' && tokenOrHref !== null) {
            href = tokenOrHref.href || '';
            alt = tokenOrHref.text || tokenOrHref.title || 'Generated image';
        } else {
            href = tokenOrHref || '';
            alt = text || title || 'Generated image';
        }

        const safeHref = escapeHtml(href);
        const safeAlt = escapeHtml(alt);
        const safeTitle = safeAlt.replace(/'/g, "\\'");

        return `
        <div class="ai-generated-image-card">
            <div class="ai-image-wrap" onclick="openImageLightbox('${safeHref}', '${safeTitle}')">
                <img src="${safeHref}" alt="${safeAlt}" class="ai-generated-img" loading="lazy" />
                <div class="ai-image-overlay">
                    <span class="ai-image-zoom-hint">
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
                        Click to Expand
                    </span>
                </div>
            </div>
            <div class="ai-image-footer">
                <span class="ai-image-caption">${safeAlt}</span>
                <button type="button" class="ai-image-download-btn" onclick="downloadImage('${safeHref}', 'generated-image.png')" title="Download Image">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                    <span>Download</span>
                </button>
            </div>
        </div>
        `;
    };

    marked.use({ renderer, breaks: true, gfm: true });
}

function renderMarkdownSafe(rawText) {
    if (!rawText) return '';
    if (typeof marked === 'undefined') {
        return escapeHtml(rawText);
    }
    let text = String(rawText);

    // Format completed <think>...</think> reasoning blocks
    text = text.replace(/<think>([\s\S]*?)<\/think>/gi, (match, thought) => {
        const trimmed = thought.trim();
        if (!trimmed) return '';
        return `<details class="thought-box" open>
            <summary class="thought-header">
                <span class="thought-icon">🧠</span>
                <span class="thought-label">Thinking Process</span>
            </summary>
            <div class="thought-body">${marked.parse(trimmed)}</div>
        </details>`;
    });

    // Format unclosed <think> during active streaming
    if (text.includes('<think>') && !text.includes('</think>')) {
        const parts = text.split('<think>');
        const before = parts[0] || '';
        const thinking = parts[1] || '';
        return (before ? marked.parse(before) : '') + `
            <div class="thought-box streaming">
                <div class="thought-header">
                    <span class="thought-spinner"></span>
                    <span class="thought-label">Thinking...</span>
                </div>
                <div class="thought-body">${marked.parse(thinking.trim())}</div>
            </div>`;
    }

    return marked.parse(text);
}

let currentRawText = '';
let currentReasoningText = '';
let currentContentText = '';
let isTyping = false;
let renderScheduled = false;
window.aiBubble = null;

function scheduleRender() {
    if (renderScheduled) return;
    renderScheduled = true;

    requestAnimationFrame(() => {
        renderScheduled = false;
        if (window.aiBubble) {
            let combined = '';
            const thinkingOn = typeof window.isThinkingEnabled !== 'function' || window.isThinkingEnabled();
            if (currentReasoningText && thinkingOn) {
                combined += `<think>${currentReasoningText}</think>\n\n`;
            }
            combined += currentContentText;
            currentRawText = combined;
            window.aiBubble.innerHTML = renderMarkdownSafe(combined);

            const chatArea = document.querySelector('.chat-area');
            if (chatArea) chatArea.scrollTop = chatArea.scrollHeight;
        }
    });
}

function initSidebar() {
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    const sidebarHeader = document.getElementById('sidebar-header');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobile-overlay');

    if (!sidebar || !overlay) return;

    function toggleSidebar() {
        const isMobile = window.innerWidth <= 768;
        if (isMobile) {
            sidebar.classList.toggle('open');
            overlay.classList.toggle('hidden');
        } else {
            sidebar.classList.toggle('expanded');
            sidebar.classList.toggle('collapsed');
        }
    }

    sidebarToggleBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSidebar();
    });

    sidebarHeader?.addEventListener('click', (e) => {
        if (window.innerWidth > 768) {
            if (e.target.closest('#sidebar-toggle-btn')) return;
            toggleSidebar();
        }
    });

    mobileMenuBtn?.addEventListener('click', toggleSidebar);

    overlay?.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.add('hidden');
    });

    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (window.innerWidth > 768) {
                if (overlay) overlay.classList.add('hidden');
                if (sidebar) sidebar.classList.remove('open');
            }
        }, 150);
    });

    // Global Chat Navigation Handler: Preserves ongoing conversation state on return
    const chatNavLinks = document.querySelectorAll(
        '.sidebar-nav a[href="/"], .sidebar-nav a[href="index.html"], .sidebar-nav a[href="."], .mobile-bottom-nav a[href="/"], .mobile-bottom-nav a[href="index.html"], .mobile-bottom-nav a[href="."]'
    );
    chatNavLinks.forEach((link) => {
        link.addEventListener('click', (e) => {
            const chatArea = document.getElementById('chat-area');
            if (chatArea) {
                e.preventDefault();
                // Already on chat view: do not reset active conversation!
                const chatInput = document.getElementById('chat-input');
                if (chatInput) chatInput.focus();
                if (typeof scrollToBottom === 'function') scrollToBottom();
                if (window.innerWidth <= 768 && sidebar) {
                    sidebar.classList.remove('open');
                    overlay?.classList.add('hidden');
                }
                return;
            }

            // On subpages (memory.html, settings.html, profile.html):
            // Check if there is an ongoing active session to resume
            const lastActiveId = localStorage.getItem('spark_active_session_id') ||
                (typeof window.getActiveSessionId === 'function' ? window.getActiveSessionId() : null);
            if (lastActiveId) {
                e.preventDefault();
                window.location.href = `index.html?chat=${encodeURIComponent(lastActiveId)}`;
            }
        });
    });
}

function renderSidebarHistory(filterText = '') {
    const container = document.getElementById('sidebar-history-list') || document.querySelector('.history-list');
    if (!container) return;

    const sessions = typeof window.getChatSessions === 'function' ? window.getChatSessions() : [];
    const activeId = typeof window.getActiveSessionId === 'function' ? window.getActiveSessionId() : null;

    const sidebarSearchInput = document.getElementById('sidebar-search-input');
    const query = String(filterText !== '' ? filterText : (sidebarSearchInput?.value || '')).toLowerCase().trim();
    const filtered = sessions.filter((session) => {
        if (!query) return true;
        if (String(session.title || '').toLowerCase().includes(query)) return true;
        if (Array.isArray(session.messages)) {
            return session.messages.some(m => String(m.content || '').toLowerCase().includes(query));
        }
        return false;
    });

    container.innerHTML = '';

    if (filtered.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'history-empty';
        empty.textContent = query ? 'No matching chats' : 'No recent chats';
        container.appendChild(empty);
        return;
    }

    filtered.forEach((session) => {
        const item = document.createElement('div');
        item.className = 'history-item' + (session.id === activeId ? ' active' : '');
        item.dataset.id = session.id;

        const title = document.createElement('span');
        title.className = 'history-item-title';
        title.textContent = session.title || 'New Conversation';
        title.title = session.title || 'New Conversation';

        const delBtn = document.createElement('button');
        delBtn.className = 'delete-chat-btn';
        delBtn.title = 'Delete chat';
        delBtn.setAttribute('aria-label', 'Delete chat');
        delBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        `;

        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (typeof window.deleteChatSession === 'function') {
                window.deleteChatSession(session.id);
            }
            if (session.id === activeId) {
                if (typeof window.hydrateChatHistory === 'function' && document.getElementById('chat-area')) {
                    window.hydrateChatHistory();
                }
            }
            renderSidebarHistory();
        });

        item.addEventListener('click', () => {
            if (typeof window.setActiveSessionId === 'function') {
                window.setActiveSessionId(session.id);
            }
            if (!document.getElementById('chat-area')) {
                window.location.href = 'index.html?chat=' + encodeURIComponent(session.id);
                return;
            }
            if (typeof window.hydrateChatHistory === 'function') {
                window.hydrateChatHistory();
            }
            renderSidebarHistory();
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('mobile-overlay');
            if (window.innerWidth <= 768 && sidebar) {
                sidebar.classList.remove('open');
                overlay?.classList.add('hidden');
            }
        });

        item.appendChild(title);
        item.appendChild(delBtn);
        container.appendChild(item);
    });
}
window.renderSidebarHistory = renderSidebarHistory;

function initSidebarHistory() {
    const sidebarSearchInput = document.getElementById('sidebar-search-input');
    sidebarSearchInput?.addEventListener('input', () => {
        renderSidebarHistory(sidebarSearchInput.value);
    });

    const newChatButtons = document.querySelectorAll('.new-chat-btn');
    newChatButtons.forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            if (typeof window.setActiveSessionId === 'function') {
                window.setActiveSessionId(null);
            }
            if (!document.getElementById('chat-area')) {
                window.location.href = 'index.html';
                return;
            }
            if (typeof window.startNewChat === 'function') {
                window.startNewChat();
            }
        });
    });

    renderSidebarHistory();
}

// ==================== OFFLINE SPREADSHEET (.xlsx / .csv) PARSER ====================

async function parseZipEntries(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    const view = new DataView(arrayBuffer);
    const entries = {};

    let eocdOffset = -1;
    for (let i = bytes.length - 22; i >= 0 && i >= bytes.length - 65557; i--) {
        if (view.getUint32(i, true) === 0x06054b50) {
            eocdOffset = i;
            break;
        }
    }

    if (eocdOffset === -1) {
        throw new Error("Invalid ZIP/XLSX archive (EOCD signature missing)");
    }

    const totalEntries = view.getUint16(eocdOffset + 10, true);
    const cdOffset = view.getUint32(eocdOffset + 16, true);

    let offset = cdOffset;
    for (let i = 0; i < totalEntries; i++) {
        if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) break;

        const method = view.getUint16(offset + 10, true);
        const compSize = view.getUint32(offset + 20, true);
        const nameLen = view.getUint16(offset + 28, true);
        const extraLen = view.getUint16(offset + 30, true);
        const commentLen = view.getUint16(offset + 32, true);
        const localHeaderOffset = view.getUint32(offset + 42, true);

        const nameBytes = bytes.subarray(offset + 46, offset + 46 + nameLen);
        const filename = new TextDecoder('utf-8').decode(nameBytes);

        if (localHeaderOffset + 30 <= bytes.length) {
            const localNameLen = view.getUint16(localHeaderOffset + 26, true);
            const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
            const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
            const compData = bytes.subarray(dataStart, dataStart + compSize);

            if (method === 0) {
                entries[filename] = new TextDecoder('utf-8').decode(compData);
            } else if (method === 8 && typeof DecompressionStream !== 'undefined') {
                try {
                    const ds = new DecompressionStream('deflate-raw');
                    const writer = ds.writable.getWriter();
                    writer.write(compData);
                    writer.close();
                    const resp = new Response(ds.readable);
                    const buf = await resp.arrayBuffer();
                    entries[filename] = new TextDecoder('utf-8').decode(buf);
                } catch (e) {
                    console.warn(`Could not decompress XLSX entry ${filename}:`, e);
                }
            }
        }

        offset += 46 + nameLen + extraLen + commentLen;
    }

    return entries;
}

function colToIdx(colStr) {
    let idx = 0;
    for (let i = 0; i < colStr.length; i++) {
        idx = idx * 26 + (colStr.toUpperCase().charCodeAt(i) - 64);
    }
    return Math.max(0, idx - 1);
}

function unescapeXml(str) {
    if (!str) return '';
    return str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
}

function parseSharedStrings(xmlStr) {
    if (!xmlStr) return [];
    const strings = [];
    const siRegex = /<si\b[^>]*>([\s\S]*?)<\/si>/gi;
    let match;
    while ((match = siRegex.exec(xmlStr)) !== null) {
        const inner = match[1];
        let text = '';
        const tRegex = /<t\b[^>]*>([^<]*)<\/t>/gi;
        let tMatch;
        while ((tMatch = tRegex.exec(inner)) !== null) {
            text += tMatch[1];
        }
        strings.push(unescapeXml(text));
    }
    return strings;
}

function parseSheetXmlToRows(xmlStr, sharedStrings) {
    if (!xmlStr) return [];
    const rows = [];
    const rowRegex = /<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/gi;
    let rowMatch;

    while ((rowMatch = rowRegex.exec(xmlStr)) !== null) {
        const rowContent = rowMatch[2];
        const rowCells = [];
        const cellRegex = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/gi;
        let cellMatch;

        while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
            const attrs = cellMatch[1] || '';
            const inner = cellMatch[2] || '';

            const rMatch = attrs.match(/\br="([A-Z]+)\d+"/i);
            const tMatch = attrs.match(/\bt="([^"]+)"/i);
            const colName = rMatch ? rMatch[1] : '';
            const cellType = tMatch ? tMatch[1] : '';

            let rawVal = '';
            const vMatch = inner.match(/<v\b[^>]*>([\s\S]*?)<\/v>/i);
            if (vMatch) {
                rawVal = vMatch[1];
            } else {
                const tInnerMatch = inner.match(/<t\b[^>]*>([\s\S]*?)<\/t>/i);
                if (tInnerMatch) {
                    rawVal = tInnerMatch[1];
                }
            }

            let val = '';
            if (cellType === 's' && rawVal !== '') {
                const sIdx = parseInt(rawVal, 10);
                val = (!isNaN(sIdx) && sharedStrings[sIdx] !== undefined) ? sharedStrings[sIdx] : '';
            } else if (cellType === 'b' && rawVal !== '') {
                val = rawVal === '1' ? 'TRUE' : 'FALSE';
            } else {
                val = rawVal;
            }

            const colIdx = colName ? colToIdx(colName) : rowCells.length;
            while (rowCells.length < colIdx) {
                rowCells.push('');
            }
            rowCells[colIdx] = unescapeXml(String(val)).trim();
        }

        if (rowCells.some(c => c !== '')) {
            rows.push(rowCells);
        }
    }

    return rows;
}

function rowsToMarkdownTable(rows, maxRows = 100) {
    if (!rows || rows.length === 0) return '_[Empty Sheet]_';

    const header = rows[0];
    const maxCols = Math.max(...rows.map(r => r.length));
    if (maxCols === 0) return '_[Empty Sheet]_';

    const normHeader = [];
    for (let c = 0; c < maxCols; c++) {
        normHeader.push((header[c] || `Column ${c + 1}`).replace(/\|/g, '\\|').trim());
    }

    let md = '| ' + normHeader.join(' | ') + ' |\n';
    md += '| ' + normHeader.map(() => '---').join(' | ') + ' |\n';

    const dataRows = rows.slice(1, maxRows);
    dataRows.forEach(row => {
        const line = [];
        for (let c = 0; c < maxCols; c++) {
            const val = (row[c] !== undefined ? String(row[c]) : '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
            line.push(val);
        }
        md += '| ' + line.join(' | ') + ' |\n';
    });

    if (rows.length > maxRows) {
        md += `\n_*(Showing first ${maxRows - 1} rows of ${rows.length - 1} data rows)*_\n`;
    }

    return md;
}

function parseCsvToMarkdown(csvText, delimiter = ',') {
    const lines = csvText.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length === 0) return '_[Empty CSV]_';

    const rows = lines.map(line => {
        const pattern = new RegExp(`(?:^|${delimiter})(?:"([^"]*(?:""[^"]*)*)"|([^"${delimiter}]*))`, 'g');
        const cells = [];
        let m;
        while ((m = pattern.exec(line)) !== null) {
            let val = m[1] !== undefined ? m[1].replace(/""/g, '"') : (m[2] !== undefined ? m[2] : '');
            cells.push(val.trim());
        }
        return cells;
    });

    return rowsToMarkdownTable(rows, 100);
}

async function parseXlsxToMarkdown(arrayBuffer, filename = 'Spreadsheet.xlsx') {
    try {
        const entries = await parseZipEntries(arrayBuffer);
        const sharedStrings = parseSharedStrings(entries['xl/sharedStrings.xml'] || '');

        const sheetNames = {};
        const wbXml = entries['xl/workbook.xml'] || '';
        const sheetTagRegex = /<sheet\b[^>]*\bname="([^"]+)"[^>]*\bsheetId="([^"]+)"/gi;
        let sMatch;
        while ((sMatch = sheetTagRegex.exec(wbXml)) !== null) {
            sheetNames[`sheet${sMatch[2]}`] = sMatch[1];
        }

        const sheetKeys = Object.keys(entries).filter(k => k.startsWith('xl/worksheets/sheet') && k.endsWith('.xml'));
        if (sheetKeys.length === 0) {
            return `_[Spreadsheet "${filename}" contains no readable worksheets]_`;
        }

        const markdownSections = [];
        for (const sheetKey of sheetKeys) {
            const sheetFile = sheetKey.split('/').pop().replace('.xml', '');
            const friendlyName = sheetNames[sheetFile] || sheetFile.toUpperCase();
            const xmlContent = entries[sheetKey];
            const rows = parseSheetXmlToRows(xmlContent, sharedStrings);
            if (rows.length > 0) {
                const tableMd = rowsToMarkdownTable(rows);
                markdownSections.push(`### Sheet: ${friendlyName}\n\n${tableMd}`);
            }
        }

        return markdownSections.length > 0
            ? markdownSections.join('\n\n---\n\n')
            : `_[Spreadsheet "${filename}" has empty sheets]_`;
    } catch (err) {
        console.error('Error parsing XLSX spreadsheet:', err);
        return `_[Unable to parse binary spreadsheet "${filename}": ${err.message || 'Corrupted file'}]_`;
    }
}

function initChatPage() {
    const chatInput = document.getElementById('chat-input');
    const chatArea = document.querySelector('.chat-area');
    const inputArea = document.querySelector('.input-area');
    if (!chatInput || !chatArea || !inputArea) return;

    const chatForm = document.getElementById('chat-form');
    const sendBtn = document.getElementById('send-btn');
    const modelBtn = document.getElementById('model-btn');
    const modelMenu = document.getElementById('model-menu');
    const currentModelText = document.getElementById('current-model');
    const welcomeScreen = document.getElementById('welcome-screen');
    const mobileNav = document.querySelector('.mobile-bottom-nav');
    const newChatBtn = document.querySelector('.new-chat-btn');
    const attachmentsTray = document.getElementById('attachments-preview-tray');
    const imageFileInput = document.getElementById('image-file-input');
    const attachImgBtn = document.getElementById('attach-img-btn');
    const inputContainer = document.querySelector('.clean-input-container');
    let pendingAttachments = [];

    function updateSendBtnState() {
        if (isGenerating) return;
        const hasText = chatInput.value.trim().length > 0;
        const hasAttachments = pendingAttachments.length > 0;
        sendBtn.disabled = !hasText && !hasAttachments;
    }

    // Pre-populate model pill immediately from cache if available
    const cachedModel = localStorage.getItem('spark_selected_model') || (typeof window.getSelectedModel === 'function' ? window.getSelectedModel() : '');
    if (cachedModel && currentModelText) {
        currentModelText.textContent = cachedModel.replace(/\.gguf$/i, '');
    }

    // Thinking quick toggle button in chat input footer
    const thinkingBtn = document.getElementById('thinking-quick-toggle');
    const thinkingLabel = document.getElementById('thinking-quick-label');

    function updateThinkingQuickBtn() {
        const isEnabled = typeof window.isThinkingEnabled === 'function'
            ? window.isThinkingEnabled()
            : localStorage.getItem('spark_enable_thinking') === 'true';

        if (thinkingBtn) {
            thinkingBtn.classList.toggle('active', isEnabled);
            thinkingBtn.setAttribute('title', isEnabled
                ? 'Deep Thinking is ON (Click to disable for instant replies)'
                : 'Deep Thinking is OFF (Instant replies, zero delay. Click to enable)');
        }
        if (thinkingLabel) {
            thinkingLabel.textContent = isEnabled ? 'Thinking: On' : 'Thinking: Off';
        }
    }

    if (thinkingBtn) {
        updateThinkingQuickBtn();
        thinkingBtn.addEventListener('click', () => {
            const current = typeof window.isThinkingEnabled === 'function'
                ? window.isThinkingEnabled()
                : localStorage.getItem('spark_enable_thinking') === 'true';
            const next = !current;
            if (typeof window.setThinkingEnabled === 'function') {
                window.setThinkingEnabled(next);
            } else {
                localStorage.setItem('spark_enable_thinking', next ? 'true' : 'false');
            }
            updateThinkingQuickBtn();
        });
    }

    // ==================== CONTEXT WINDOW USAGE GAUGE ====================
    const contextGaugePill = document.getElementById('context-gauge-pill');
    const contextGaugeText = document.getElementById('context-gauge-text');
    const contextCircleBar = document.getElementById('context-circle-bar');
    const contextPopover = document.getElementById('context-popover');
    const contextStatusBadge = document.getElementById('context-status-badge');
    const contextProgressBar = document.getElementById('context-progress-bar');
    const contextValUsed = document.getElementById('context-val-used');
    const contextValMax = document.getElementById('context-val-max');
    const contextValFree = document.getElementById('context-val-free');
    const contextValTurns = document.getElementById('context-val-turns');

    function formatNumberCommas(num) {
        return Number(num || 0).toLocaleString();
    }

    function updateContextGaugeUI(customUsage = null) {
        if (!contextGaugePill) return;

        const usage = customUsage || (typeof window.getContextUsage === 'function' ? window.getContextUsage() : null);
        if (!usage) return;

        const { usedTokens, maxTokens, freeTokens, percentage, status, totalTurns } = usage;

        // Update pill label & circular stroke
        if (contextGaugeText) {
            contextGaugeText.textContent = `Context: ${percentage}%`;
        }
        if (contextCircleBar) {
            contextCircleBar.setAttribute('stroke-dasharray', `${percentage}, 100`);
            if (status === 'danger') {
                contextCircleBar.setAttribute('stroke', '#ef4444');
            } else if (status === 'warning') {
                contextCircleBar.setAttribute('stroke', '#f59e0b');
            } else {
                contextCircleBar.setAttribute('stroke', '#6366f1');
            }
        }

        // Update pill modifier styling
        contextGaugePill.classList.remove('warning', 'danger');
        if (status === 'danger') {
            contextGaugePill.classList.add('danger');
            contextGaugePill.title = `Context Window: ${percentage}% consumed (${formatNumberCommas(usedTokens)} / ${formatNumberCommas(maxTokens)} tokens). Approaching limit!`;
        } else if (status === 'warning') {
            contextGaugePill.classList.add('warning');
            contextGaugePill.title = `Context Window: ${percentage}% consumed (${formatNumberCommas(usedTokens)} / ${formatNumberCommas(maxTokens)} tokens).`;
        } else {
            contextGaugePill.title = `Context Window: ${percentage}% consumed (${formatNumberCommas(usedTokens)} / ${formatNumberCommas(maxTokens)} tokens). Click for details.`;
        }

        // Update popover card if present
        if (contextStatusBadge) {
            contextStatusBadge.className = `context-status-badge ${status}`;
            contextStatusBadge.textContent = status === 'danger' ? 'Near Limit' : (status === 'warning' ? 'Heavy' : 'Normal');
        }
        if (contextProgressBar) {
            contextProgressBar.className = `context-fill ${status}`;
            contextProgressBar.style.width = `${percentage}%`;
        }
        if (contextValUsed) contextValUsed.textContent = formatNumberCommas(usedTokens);
        if (contextValMax) contextValMax.textContent = formatNumberCommas(maxTokens);
        if (contextValFree) contextValFree.textContent = formatNumberCommas(freeTokens);
        if (contextValTurns) contextValTurns.textContent = formatNumberCommas(totalTurns);
    }

    if (contextGaugePill && contextPopover) {
        contextGaugePill.addEventListener('click', (e) => {
            e.stopPropagation();
            const isHidden = contextPopover.classList.contains('hidden');
            if (modelMenu && !modelMenu.classList.contains('hidden')) {
                modelMenu.classList.add('hidden');
                modelBtn?.classList.remove('active');
            }
            contextPopover.classList.toggle('hidden', !isHidden);
            if (isHidden) {
                updateContextGaugeUI();
            }
        });

        document.addEventListener('click', (e) => {
            if (!contextGaugePill.contains(e.target) && !contextPopover.contains(e.target)) {
                contextPopover.classList.add('hidden');
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                contextPopover.classList.add('hidden');
            }
        });
    }

    window.addEventListener('spark_context_usage_updated', (e) => {
        updateContextGaugeUI(e.detail);
    });

    window.addEventListener('storage', (e) => {
        if (e.key === 'spark_context_window' || e.key === 'spark_history_window_size') {
            updateContextGaugeUI();
        }
    });

    updateContextGaugeUI();

    let isGenerating = false;
    let abortController = null;
    let firstChunkReceived = false;

    const aiIcon = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1v2h-1v1a2 2 0 0 1 2 2H5a2 2 0 0 1-2-2v-1H2v-2h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2Z"/>
        </svg>`;

    function scrollToBottom() {
        chatArea.scrollTop = chatArea.scrollHeight;
    }

    function hideWelcomeIfNeeded() {
        const welcome = document.getElementById('welcome-screen');
        if (welcome) {
            welcome.classList.add('hidden');
            setTimeout(() => {
                if (welcome && welcome.parentNode) {
                    welcome.parentNode.removeChild(welcome);
                }
            }, 300);
        }
    }

    function createMessageActionBar(sender, rawText, historyIndex, rowElement, perfStats = null) {
        const bar = document.createElement('div');
        bar.className = `message-action-bar ${sender}`;

        // 1. Copy Button
        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'msg-action-btn';
        copyBtn.title = 'Copy message text';
        copyBtn.setAttribute('aria-label', 'Copy message text');
        copyBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
                <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
            </svg>
            <span class="btn-tip">Copy</span>
        `;
        copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const cleanText = String(rawText || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim() || String(rawText || '');
            navigator.clipboard.writeText(cleanText).then(() => {
                const tip = copyBtn.querySelector('.btn-tip');
                if (tip) tip.textContent = 'Copied!';
                copyBtn.classList.add('copied');
                setTimeout(() => {
                    if (tip) tip.textContent = 'Copy';
                    copyBtn.classList.remove('copied');
                }, 2000);
            }).catch(err => console.error('Copy failed:', err));
        });
        bar.appendChild(copyBtn);

        if (sender === 'ai') {
            // 2. Regenerate AI Response Button
            const regenBtn = document.createElement('button');
            regenBtn.type = 'button';
            regenBtn.className = 'msg-action-btn';
            regenBtn.title = 'Regenerate answer';
            regenBtn.setAttribute('aria-label', 'Regenerate answer');
            regenBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                    <path d="M3 3v5h5"/>
                    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
                    <path d="M16 21h5v-5"/>
                </svg>
                <span class="btn-tip">Retry</span>
            `;
            regenBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (isGenerating) return;
                const idx = historyIndex !== null ? historyIndex : parseInt(rowElement?.dataset?.historyIndex, 10);
                handleRegenerateResponse(!isNaN(idx) ? idx : null);
            });
            bar.appendChild(regenBtn);

            // 3. Text-to-Speech (TTS) Speak Button
            if ('speechSynthesis' in window) {
                const ttsBtn = document.createElement('button');
                ttsBtn.type = 'button';
                ttsBtn.className = 'msg-action-btn';
                ttsBtn.title = 'Read aloud';
                ttsBtn.setAttribute('aria-label', 'Read aloud');
                ttsBtn.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                        <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                        <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
                    </svg>
                    <span class="btn-tip">Speak</span>
                `;
                ttsBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (window.speechSynthesis.speaking) {
                        window.speechSynthesis.cancel();
                        const tip = ttsBtn.querySelector('.btn-tip');
                        if (tip) tip.textContent = 'Speak';
                        ttsBtn.classList.remove('speaking');
                        return;
                    }

                    const cleanSpeech = String(rawText || '')
                        .replace(/<think>[\s\S]*?<\/think>/gi, '')
                        .replace(/```[\s\S]*?```/g, 'Code block omitted.')
                        .replace(/[#*`_~]/g, '')
                        .trim();

                    if (!cleanSpeech) return;

                    const utterance = new SpeechSynthesisUtterance(cleanSpeech);
                    utterance.rate = 1.05;
                    const tip = ttsBtn.querySelector('.btn-tip');
                    if (tip) tip.textContent = 'Stop';
                    ttsBtn.classList.add('speaking');

                    utterance.onend = () => {
                        if (tip) tip.textContent = 'Speak';
                        ttsBtn.classList.remove('speaking');
                    };
                    utterance.onerror = () => {
                        if (tip) tip.textContent = 'Speak';
                        ttsBtn.classList.remove('speaking');
                    };

                    window.speechSynthesis.speak(utterance);
                });
                bar.appendChild(ttsBtn);
            }

            // 4. Remember / Save Insight to Memory Button
            const rememberBtn = document.createElement('button');
            rememberBtn.type = 'button';
            rememberBtn.className = 'msg-action-btn remember-btn';
            rememberBtn.title = 'Save insight to memory';
            rememberBtn.setAttribute('aria-label', 'Save insight to memory');
            rememberBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/>
                    <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/>
                    <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/>
                </svg>
                <span class="btn-tip">Remember</span>
            `;
            rememberBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                let cleanText = String(rawText || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim() || String(rawText || '');
                if (cleanText.length > 300) {
                    cleanText = cleanText.slice(0, 300).trim() + '...';
                }
                if (!cleanText) return;

                if (typeof window.saveMemoryEntry === 'function') {
                    window.saveMemoryEntry(cleanText, '', 'chat_saved');
                }
                const tip = rememberBtn.querySelector('.btn-tip');
                if (tip) tip.textContent = 'Saved!';
                rememberBtn.classList.add('remembered');
                setTimeout(() => {
                    if (tip) tip.textContent = 'Remember';
                    rememberBtn.classList.remove('remembered');
                }, 2000);
            });
            bar.appendChild(rememberBtn);

            // 5. Performance Metrics Badge
            if (perfStats && perfStats.tokPerSec) {
                const perfBadge = document.createElement('span');
                perfBadge.className = 'perf-stats-chip';
                perfBadge.title = `Generated ${perfStats.totalTokens || 0} tokens in ${perfStats.totalSec || 0}s (${perfStats.ttft}s TTFT)`;
                perfBadge.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                    </svg>
                    <span>${perfStats.tokPerSec} tok/s</span>
                `;
                bar.appendChild(perfBadge);
            }
        } else {
            // 2. User Prompt: Edit Button
            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'msg-action-btn';
            editBtn.title = 'Edit prompt';
            editBtn.setAttribute('aria-label', 'Edit prompt');
            editBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                </svg>
                <span class="btn-tip">Edit</span>
            `;
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (isGenerating) return;

                const parentRow = rowElement || bar.closest('.message-row');
                if (!parentRow) return;
                const contentDiv = parentRow.querySelector('.message-content');
                if (!contentDiv) return;

                // Prevent opening multiple editors for the same message
                if (contentDiv.querySelector('.inline-message-editor')) return;

                const bubble = contentDiv.querySelector('.message-bubble');
                if (bubble) bubble.style.display = 'none';
                bar.style.display = 'none';

                const editor = document.createElement('div');
                editor.className = 'inline-message-editor';

                const textarea = document.createElement('textarea');
                textarea.className = 'inline-edit-textarea';
                textarea.value = rawText || '';
                textarea.rows = 2;

                const actions = document.createElement('div');
                actions.className = 'inline-edit-actions';

                const cancelBtn = document.createElement('button');
                cancelBtn.type = 'button';
                cancelBtn.className = 'inline-edit-btn cancel';
                cancelBtn.textContent = 'Cancel';

                const sendBtn = document.createElement('button');
                sendBtn.type = 'button';
                sendBtn.className = 'inline-edit-btn send';
                sendBtn.textContent = 'Save & Submit';

                actions.appendChild(cancelBtn);
                actions.appendChild(sendBtn);
                editor.appendChild(textarea);
                editor.appendChild(actions);

                contentDiv.appendChild(editor);

                const autoResize = () => {
                    textarea.style.height = 'auto';
                    textarea.style.height = Math.min(textarea.scrollHeight, 220) + 'px';
                };
                autoResize();
                textarea.addEventListener('input', autoResize);
                textarea.focus();

                const closeEditor = () => {
                    editor.remove();
                    if (bubble) bubble.style.display = '';
                    bar.style.display = '';
                };

                cancelBtn.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    closeEditor();
                });

                const executeEdit = () => {
                    const newText = textarea.value.trim();
                    if (!newText) return;

                    const idx = historyIndex !== null ? historyIndex : parseInt(parentRow.dataset.historyIndex, 10);
                    const history = typeof window.getConversationHistory === 'function' ? window.getConversationHistory() : [];
                    let savedImages = [];
                    let savedDocs = [];

                    if (!isNaN(idx) && idx >= 0 && idx < history.length) {
                        savedImages = history[idx]?.images || [];
                        savedDocs = history[idx]?.documents || history[idx]?.docs || [];
                        if (typeof window.truncateHistoryAt === 'function') {
                            window.truncateHistoryAt(idx);
                        }
                    }

                    // Remove downstream turns and this turn from DOM
                    hydrateChatHistory();

                    // Submit new turn with edited prompt text
                    submitTurnFromText(newText, savedImages, savedDocs);
                };

                sendBtn.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    executeEdit();
                });

                textarea.addEventListener('keydown', (ev) => {
                    if (ev.key === 'Escape') {
                        ev.preventDefault();
                        closeEditor();
                    } else if (ev.key === 'Enter' && !ev.shiftKey) {
                        ev.preventDefault();
                        executeEdit();
                    }
                });
            });
            bar.appendChild(editBtn);

            // 3. User Prompt: Remember / Save Fact Button
            const rememberBtn = document.createElement('button');
            rememberBtn.type = 'button';
            rememberBtn.className = 'msg-action-btn remember-btn';
            rememberBtn.title = 'Save fact to memory';
            rememberBtn.setAttribute('aria-label', 'Save fact to memory');
            rememberBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/>
                    <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/>
                    <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/>
                </svg>
                <span class="btn-tip">Remember</span>
            `;
            rememberBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                let cleanText = String(rawText || '').trim();
                if (cleanText.length > 300) {
                    cleanText = cleanText.slice(0, 300).trim() + '...';
                }
                if (!cleanText) return;

                if (typeof window.saveMemoryEntry === 'function') {
                    window.saveMemoryEntry(cleanText, '', 'chat_saved');
                }
                const tip = rememberBtn.querySelector('.btn-tip');
                if (tip) tip.textContent = 'Saved!';
                rememberBtn.classList.add('remembered');
                setTimeout(() => {
                    if (tip) tip.textContent = 'Remember';
                    rememberBtn.classList.remove('remembered');
                }, 2000);
            });
            bar.appendChild(rememberBtn);

            // 4. User Prompt: Delete Turn Button
            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'msg-action-btn delete';
            delBtn.title = 'Delete message';
            delBtn.setAttribute('aria-label', 'Delete message');
            delBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 6h18"/>
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                </svg>
                <span class="btn-tip">Delete</span>
            `;
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (isGenerating) return;
                const idx = historyIndex !== null ? historyIndex : parseInt(rowElement?.dataset?.historyIndex, 10);
                if (!isNaN(idx) && typeof window.removeTurnAtIndex === 'function') {
                    window.removeTurnAtIndex(idx);
                    hydrateChatHistory();
                    renderSidebarHistory();
                }
            });
            bar.appendChild(delBtn);
        }

        return bar;
    }

    function handleRegenerateResponse(targetIndex = null) {
        if (isGenerating) return;
        const history = typeof window.getConversationHistory === 'function' ? window.getConversationHistory() : [];
        if (!Array.isArray(history) || history.length === 0) return;

        let assistantIdx = -1;
        if (targetIndex !== null && !isNaN(targetIndex) && targetIndex >= 0 && targetIndex < history.length) {
            if (history[targetIndex]?.role === 'assistant') {
                assistantIdx = targetIndex;
            }
        }

        // Default to last assistant message if not specified
        if (assistantIdx === -1) {
            for (let i = history.length - 1; i >= 0; i--) {
                if (history[i]?.role === 'assistant') {
                    assistantIdx = i;
                    break;
                }
            }
        }

        if (assistantIdx === -1) return;

        // Find the user turn immediately preceding this assistant turn
        let userMsg = null;
        for (let i = assistantIdx - 1; i >= 0; i--) {
            if (history[i]?.role === 'user') {
                userMsg = history[i];
                break;
            }
        }

        if (!userMsg) return;

        // Truncate history at assistantIdx (removes this assistant turn and any subsequent turns)
        if (typeof window.truncateHistoryAt === 'function') {
            window.truncateHistoryAt(assistantIdx);
        } else if (typeof window.popLastAssistantTurn === 'function') {
            window.popLastAssistantTurn();
        }

        // Rehydrate chat UI to clear previous AI bubble and any subsequent bubbles
        hydrateChatHistory();

        // Trigger generation
        setGeneratingState(true);
        abortController = new AbortController();
        const loadingId = showTypingIndicator();

        currentRawText = '';
        currentReasoningText = '';
        currentContentText = '';
        window.aiBubble = null;
        firstChunkReceived = false;

        const streamFn = window.fetchAndStreamResponse || (typeof fetchAndStreamResponse === 'function' ? fetchAndStreamResponse : null);
        if (!streamFn) {
            removeTypingIndicator(loadingId);
            appendMessage('[System Error]: API streaming client not loaded.', 'ai');
            setGeneratingState(false);
            return;
        }

        streamFn(userMsg.content, abortController.signal, (chunk, isDone, isReasoning, perfStats) => {
            if (chunk && chunk.startsWith('[System Error]')) {
                removeTypingIndicator(loadingId);
                appendMessage(chunk, 'ai');
                setGeneratingState(false);
                renderSidebarHistory();
                return;
            }

            if (!firstChunkReceived && chunk) {
                removeTypingIndicator(loadingId);
                window.aiBubble = appendMessage('', 'ai');
                firstChunkReceived = true;
            }

            if (chunk) {
                if (isReasoning) {
                    currentReasoningText += chunk;
                } else {
                    currentContentText += chunk;
                }
                scheduleRender();
            }

            if (isDone) {
                if (!firstChunkReceived) removeTypingIndicator(loadingId);
                if (window.aiBubble) {
                    let finalCombined = '';
                    const thinkingOn = typeof window.isThinkingEnabled !== 'function' || window.isThinkingEnabled();
                    if (currentReasoningText && thinkingOn) {
                        finalCombined += `<think>${currentReasoningText}</think>\n\n`;
                    }
                    if (!currentContentText.trim() && currentReasoningText.trim()) {
                        finalCombined += currentReasoningText.trim();
                    } else {
                        finalCombined += currentContentText;
                    }
                    window.aiBubble.innerHTML = renderMarkdownSafe(finalCombined);

                    // Add message action bar to finished bubble
                    const contentContainer = window.aiBubble.closest('.message-content');
                    const parentRow = contentContainer?.closest('.message-row');
                    const curHist = typeof window.getConversationHistory === 'function' ? window.getConversationHistory() : [];
                    const aiIdx = curHist.length - 1;
                    if (parentRow && aiIdx >= 0) {
                        parentRow.dataset.historyIndex = String(aiIdx);
                    }
                    if (contentContainer && !contentContainer.querySelector('.message-action-bar')) {
                        contentContainer.appendChild(createMessageActionBar('ai', finalCombined, aiIdx >= 0 ? aiIdx : null, parentRow, perfStats));
                    }
                }
                setGeneratingState(false);
                abortController = null;
                renderSidebarHistory();
            }
        }, userMsg.images || [], { isRegeneration: true });
    }

    function appendMessage(text, sender, images = [], historyIndex = null, docs = []) {
        const row = document.createElement('div');
        row.className = `message-row ${sender}`;
        if (historyIndex !== null) {
            row.dataset.historyIndex = String(historyIndex);
        }

        const content = document.createElement('div');
        content.className = 'message-content';

        // Attached documents for user message
        if (sender === 'user' && Array.isArray(docs) && docs.length > 0) {
            const docsContainer = document.createElement('div');
            docsContainer.className = 'message-attachments-container docs-container';
            docs.forEach((doc) => {
                const docChip = document.createElement('div');
                const isSpreadsheet = doc.isSpreadsheet || doc.type === 'spreadsheet' || doc.ext === 'xlsx' || doc.ext === 'xls';
                const isXml = doc.ext === 'xml';
                const isCsv = doc.ext === 'csv' || doc.ext === 'tsv';
                let chipClass = 'message-doc-chip';
                if (isSpreadsheet || isCsv) chipClass += ' spreadsheet';
                else if (isXml) chipClass += ' xml';

                docChip.className = chipClass;
                docChip.title = `${doc.name || 'Document'} (${doc.sizeStr || ''})`;

                let iconSvg = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                        <polyline points="14 2 14 8 20 8"/>
                    </svg>
                `;
                if (isSpreadsheet || isCsv) {
                    iconSvg = `
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
                            <line x1="3" x2="21" y1="9" y2="9"/>
                            <line x1="3" x2="21" y1="15" y2="15"/>
                            <line x1="9" x2="9" y1="3" y2="21"/>
                            <line x1="15" x2="15" y1="3" y2="21"/>
                        </svg>
                    `;
                } else if (isXml) {
                    iconSvg = `
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="16 18 22 12 16 6"/>
                            <polyline points="8 6 2 12 8 18"/>
                        </svg>
                    `;
                }

                docChip.innerHTML = `
                    <span class="doc-chip-icon">${iconSvg}</span>
                    <span class="doc-chip-name">${escapeHtml(doc.name || 'Document')}</span>
                    ${doc.sizeStr ? `<span class="doc-chip-size">${escapeHtml(doc.sizeStr)}</span>` : ''}
                `;
                docsContainer.appendChild(docChip);
            });
            content.appendChild(docsContainer);
        }

        // Attached images for user message
        if (sender === 'user' && Array.isArray(images) && images.length > 0) {
            const attachContainer = document.createElement('div');
            attachContainer.className = 'message-attachments-container';
            images.forEach((imgSrc, idx) => {
                const imgWrap = document.createElement('div');
                imgWrap.className = 'message-attachment-thumb';
                const imgEl = document.createElement('img');
                imgEl.src = imgSrc;
                imgEl.alt = `Attached Image ${idx + 1}`;
                imgWrap.appendChild(imgEl);
                imgWrap.addEventListener('click', () => {
                    openImageLightbox(imgSrc, `Attached Image ${idx + 1}`);
                });
                attachContainer.appendChild(imgWrap);
            });
            content.appendChild(attachContainer);
        }

        let bubble = null;
        if (text || sender === 'ai') {
            bubble = document.createElement('div');
            bubble.className = 'message-bubble';
            bubble.style.whiteSpace = 'normal';

            if (sender === 'ai') {
                bubble.innerHTML = renderMarkdownSafe(text || '');
            } else {
                bubble.textContent = String(text || '');
            }
            content.appendChild(bubble);

            // Add action bar if text is present
            if (text) {
                const actionBar = createMessageActionBar(sender, text, historyIndex, row);
                content.appendChild(actionBar);
            }
        }

        if (sender === 'ai') {
            const avatar = document.createElement('div');
            avatar.className = 'message-avatar';
            avatar.innerHTML = aiIcon;
            row.appendChild(avatar);
        }

        row.appendChild(content);
        chatArea.appendChild(row);
        scrollToBottom();

        return bubble;
    }

    function showTypingIndicator() {
        const id = 'loading-' + Date.now();
        const row = document.createElement('div');
        row.className = 'message-row ai';
        row.id = id;

        row.innerHTML = `
            <div class="message-avatar">${aiIcon}</div>
            <div class="message-content">
                <div class="typing-indicator">
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                </div>
            </div>
        `;

        chatArea.appendChild(row);
        scrollToBottom();
        return id;
    }

    function removeTypingIndicator(id) {
        document.getElementById(id)?.remove();
    }

    function setGeneratingState(active) {
        isGenerating = active;
        chatInput.disabled = active;
        if (attachImgBtn) attachImgBtn.disabled = active;

        if (active) {
            sendBtn.disabled = false;
            sendBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`;
            sendBtn.title = 'Stop Generation';
            sendBtn.setAttribute('aria-label', 'Stop generation');
        } else {
            sendBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"></path><path d="m21.854 2.147-10.94 10.939"></path></svg>`;
            sendBtn.title = 'Send Message';
            sendBtn.setAttribute('aria-label', 'Send message');
            updateSendBtnState();
            chatInput.focus();
        }
    }

    function setSelectedModel(modelId) {
        if (!modelId) return;
        const cleanName = modelId.replace(/\.gguf$/i, '');
        currentModelText.textContent = cleanName;
        localStorage.setItem('spark_selected_model', modelId);
        if (typeof window.setSelectedModel === 'function') {
            window.setSelectedModel(modelId);
        }
        const allOptions = Array.from(modelMenu?.querySelectorAll('.model-option') || []);
        allOptions.forEach((opt) => {
            if (opt.dataset.value === modelId) {
                opt.classList.add('selected');
            } else {
                opt.classList.remove('selected');
            }
        });
    }

    async function loadDynamicModels() {
        if (typeof window.fetchAvailableModels !== 'function' || !modelMenu) return;
        const models = await window.fetchAvailableModels();
        if (!models || models.length === 0) {
            modelMenu.innerHTML = `
                <div class="model-option" style="cursor: default; opacity: 0.7;">
                    <span class="model-name">No models found in models/</span>
                </div>
            `;
            if (currentModelText && (!currentModelText.textContent || currentModelText.textContent === 'Loading model...')) {
                currentModelText.textContent = 'Server Offline';
            }
            return;
        }

        modelMenu.innerHTML = '';
        const saved = localStorage.getItem('spark_selected_model') || (typeof window.getSelectedModel === 'function' ? window.getSelectedModel() : '');
        const activeModel = (saved && models.includes(saved)) ? saved : models[0];

        models.forEach((modelId) => {
            const cleanName = modelId.replace(/\.gguf$/i, '');
            const isVision = /2b/i.test(cleanName) || /vision|vl/i.test(cleanName);
            const opt = document.createElement('div');
            opt.className = 'model-option' + (modelId === activeModel ? ' selected' : '');
            opt.dataset.value = modelId;

            opt.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                    <span class="model-name">${escapeHtml(cleanName)}</span>
                    ${isVision ? '<span style="font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: 6px; background: rgba(99, 102, 241, 0.18); color: #818cf8; border: 1px solid rgba(99, 102, 241, 0.35);">Vision</span>' : ''}
                </div>
                <span class="model-desc">${escapeHtml(cleanName)}.gguf ${isVision ? '· Multimodal Active' : ''}</span>
            `;

            opt.addEventListener('click', () => {
                setSelectedModel(modelId);
                modelMenu.classList.add('hidden');
            });

            modelMenu.appendChild(opt);
        });

        setSelectedModel(activeModel);
    }

    function renderWelcomeScreen() {
        chatArea.innerHTML = `
            <div id="welcome-screen" class="welcome-screen">
                <h2>Hey, I'm Spark</h2>
                <p>Powered by <strong>Qwen 3.5</strong> on your device with hardware acceleration. Ask me anything...</p>
            </div>
        `;
    }

    function hydrateChatHistory() {
        if (typeof window.getConversationHistory !== 'function') return;
        const history = window.getConversationHistory();

        chatArea.innerHTML = '';

        if (!Array.isArray(history) || history.length === 0) {
            renderWelcomeScreen();
            if (typeof updateContextGaugeUI === 'function') updateContextGaugeUI();
            return;
        }

        const visibleMessages = history.filter(
            (message) => message && typeof message === 'object' && message.role !== 'system'
        );
        if (visibleMessages.length === 0) {
            renderWelcomeScreen();
            if (typeof updateContextGaugeUI === 'function') updateContextGaugeUI();
            return;
        }

        visibleMessages.forEach((message, idx) => {
            if (message.role === 'assistant') {
                appendMessage(message.content || '', 'ai', [], idx);
            } else {
                appendMessage(message.content || '', 'user', message.images || [], idx, message.documents || message.docs || []);
            }
        });
        if (typeof updateContextGaugeUI === 'function') updateContextGaugeUI();
        scrollToBottom();
    }
    window.hydrateChatHistory = hydrateChatHistory;

    // New Chat Action: resets conversation cleanly without page reload flash
    function startNewChat() {
        if (isGenerating && abortController) {
            abortController.abort();
            abortController = null;
        }
        if (typeof window.setActiveSessionId === 'function') {
            window.setActiveSessionId(null);
        }
        pendingAttachments = [];
        renderAttachmentPreviews();
        hydrateChatHistory();
        renderSidebarHistory();
        setGeneratingState(false);
        chatInput.value = '';
        chatInput.style.height = 'auto';
        sendBtn.disabled = true;
        chatInput.focus();

        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('mobile-overlay');
        if (window.innerWidth <= 768 && sidebar) {
            sidebar.classList.remove('open');
            overlay?.classList.add('hidden');
        }
    }
    window.startNewChat = startNewChat;

    const newChatButtons = document.querySelectorAll('.new-chat-btn');
    newChatButtons.forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            startNewChat();
        });
    });

    const headerProfileBtn = document.querySelector('.top-header .profile-btn');
    headerProfileBtn?.addEventListener('click', () => {
        window.location.href = 'profile.html';
    });

    function submitTurnFromText(message, attachedImages = [], attachedDocs = []) {
        if (!message && attachedImages.length === 0 && attachedDocs.length === 0) return;

        // Build the combined prompt for the local model
        let promptToSend = message;
        if (attachedDocs.length > 0) {
            const docBlocks = attachedDocs.map(d => {
                if (d.isSpreadsheet || d.type === 'spreadsheet') {
                    return `[Attached Spreadsheet: ${d.name}]\n${d.content}`;
                }
                const lang = d.ext || 'txt';
                return `[Attached Document: ${d.name}]\n\`\`\`${lang}\n${d.content}\n\`\`\``;
            }).join('\n\n');
            promptToSend = docBlocks + (message ? `\n\n${message}` : '\n\nPlease analyze or answer questions about the attached document(s)/spreadsheet(s).');
        }

        hideWelcomeIfNeeded();

        // Calculate history index for action bar turn manipulation
        const currentHist = typeof window.getConversationHistory === 'function' ? window.getConversationHistory() : [];
        const userHistoryIndex = currentHist.length;

        appendMessage(
            message || (attachedDocs.length > 0 ? `[Attached: ${attachedDocs.map(d => d.name).join(', ')}]` : ''),
            'user',
            attachedImages,
            userHistoryIndex,
            attachedDocs
        );

        setGeneratingState(true);
        abortController = new AbortController();
        const loadingId = showTypingIndicator();

        currentRawText = '';
        currentReasoningText = '';
        currentContentText = '';
        window.aiBubble = null;
        firstChunkReceived = false;

        const streamFn = window.fetchAndStreamResponse || (typeof fetchAndStreamResponse === 'function' ? fetchAndStreamResponse : null);
        if (!streamFn) {
            removeTypingIndicator(loadingId);
            appendMessage('[System Error]: API streaming client not loaded.', 'ai');
            setGeneratingState(false);
            return;
        }

        streamFn(promptToSend, abortController.signal, (chunk, isDone, isReasoning, perfStats) => {
            if (chunk && chunk.startsWith('[System Error]')) {
                removeTypingIndicator(loadingId);
                const errorBubble = appendMessage(chunk, 'ai');
                if (errorBubble) {
                    const retryBtn = document.createElement('button');
                    retryBtn.className = 'btn copy-btn';
                    retryBtn.style.marginTop = '8px';
                    retryBtn.style.display = 'block';
                    retryBtn.textContent = 'Retry';
                    retryBtn.onclick = () => {
                        chatInput.value = message;
                        chatInput.focus();
                        chatInput.style.height = 'auto';
                        updateSendBtnState();
                        errorBubble.closest('.message-row')?.remove();
                    };
                    errorBubble.appendChild(retryBtn);
                }
                setGeneratingState(false);
                renderSidebarHistory();
                return;
            }

            if (!firstChunkReceived && chunk) {
                removeTypingIndicator(loadingId);
                window.aiBubble = appendMessage('', 'ai');
                firstChunkReceived = true;
            }

            if (chunk) {
                if (isReasoning) {
                    currentReasoningText += chunk;
                } else {
                    currentContentText += chunk;
                }
                scheduleRender();
            }

            if (isDone) {
                if (!firstChunkReceived) removeTypingIndicator(loadingId);
                // Final flush render
                if (window.aiBubble) {
                    let finalCombined = '';
                    const thinkingOn = typeof window.isThinkingEnabled !== 'function' || window.isThinkingEnabled();
                    if (currentReasoningText && thinkingOn) {
                        finalCombined += `<think>${currentReasoningText}</think>\n\n`;
                    }
                    if (!currentContentText.trim() && currentReasoningText.trim()) {
                        finalCombined += currentReasoningText.trim();
                    } else {
                        finalCombined += currentContentText;
                    }
                    window.aiBubble.innerHTML = renderMarkdownSafe(finalCombined);

                    // Add message action bar to finished bubble
                    const contentContainer = window.aiBubble.closest('.message-content');
                    const parentRow = contentContainer?.closest('.message-row');
                    const curHist = typeof window.getConversationHistory === 'function' ? window.getConversationHistory() : [];
                    const aiIdx = curHist.length - 1;
                    if (parentRow && aiIdx >= 0) {
                        parentRow.dataset.historyIndex = String(aiIdx);
                    }
                    if (contentContainer && !contentContainer.querySelector('.message-action-bar')) {
                        contentContainer.appendChild(createMessageActionBar('ai', finalCombined, aiIdx >= 0 ? aiIdx : null, parentRow, perfStats));
                    }
                }
                setGeneratingState(false);
                abortController = null;
                renderSidebarHistory();
            }
        }, attachedImages);
    }

    function handleFormSubmit() {
        if (isGenerating) {
            if (abortController) {
                abortController.abort();
                abortController = null;
            }
            return;
        }

        const message = chatInput.value.trim();
        const attachedImages = pendingAttachments.filter(p => p.type === 'image' || (!p.type && p.dataUrl)).map(p => p.dataUrl);
        const attachedDocs = pendingAttachments.filter(p => p.type === 'document' || p.type === 'spreadsheet' || p.isSpreadsheet);

        if (!message && attachedImages.length === 0 && attachedDocs.length === 0) return;

        // Reset input and attachments
        chatInput.value = '';
        chatInput.style.height = 'auto';
        pendingAttachments = [];
        renderAttachmentPreviews();

        submitTurnFromText(message, attachedImages, attachedDocs);
    }

    modelBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        modelMenu?.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
        if (!modelBtn?.contains(e.target) && !modelMenu?.contains(e.target)) {
            modelMenu?.classList.add('hidden');
        }
    });

    chatInput.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 150) + 'px';
        updateSendBtnState();
        scrollToBottom();
    });

    function formatBytes(bytes) {
        if (!bytes || bytes <= 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function renderAttachmentPreviews() {
        if (!attachmentsTray) return;
        attachmentsTray.innerHTML = '';
        if (pendingAttachments.length === 0) {
            attachmentsTray.classList.add('hidden');
            updateSendBtnState();
            return;
        }

        attachmentsTray.classList.remove('hidden');
        pendingAttachments.forEach((att) => {
            const card = document.createElement('div');

            if (att.type === 'document' || att.type === 'spreadsheet' || att.isSpreadsheet) {
                const isSpreadsheet = att.type === 'spreadsheet' || att.isSpreadsheet;
                const isXml = att.ext === 'xml';
                const isJson = att.ext === 'json';
                const isCsv = att.ext === 'csv' || att.ext === 'tsv';

                let cardClasses = 'attachment-preview-card document-card';
                if (isSpreadsheet || isCsv) cardClasses += ' spreadsheet-card';
                else if (isXml) cardClasses += ' xml-card';
                else if (isJson) cardClasses += ' json-card';

                card.className = cardClasses;
                card.title = `${att.name} (${att.sizeStr || ''})`;

                const iconWrap = document.createElement('div');
                iconWrap.className = 'doc-card-icon';

                if (isSpreadsheet || isCsv) {
                    iconWrap.innerHTML = `
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
                            <line x1="3" x2="21" y1="9" y2="9"/>
                            <line x1="3" x2="21" y1="15" y2="15"/>
                            <line x1="9" x2="9" y1="3" y2="21"/>
                            <line x1="15" x2="15" y1="3" y2="21"/>
                        </svg>
                    `;
                } else if (isXml) {
                    iconWrap.innerHTML = `
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="16 18 22 12 16 6"/>
                            <polyline points="8 6 2 12 8 18"/>
                        </svg>
                    `;
                } else {
                    iconWrap.innerHTML = `
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                            <polyline points="14 2 14 8 20 8"/>
                        </svg>
                    `;
                }
                card.appendChild(iconWrap);

                const infoWrap = document.createElement('div');
                infoWrap.className = 'doc-card-info';
                const nameEl = document.createElement('span');
                nameEl.className = 'doc-card-name';
                nameEl.textContent = att.name;
                const sizeEl = document.createElement('span');
                sizeEl.className = 'doc-card-size';
                sizeEl.textContent = `${(att.ext || 'doc').toUpperCase()} • ${att.sizeStr || ''}`;
                infoWrap.appendChild(nameEl);
                infoWrap.appendChild(sizeEl);
                card.appendChild(infoWrap);
            } else {
                card.className = 'attachment-preview-card';
                const img = document.createElement('img');
                img.src = att.dataUrl;
                img.alt = att.name || 'Attachment';
                card.appendChild(img);

                card.addEventListener('click', () => {
                    openImageLightbox(att.dataUrl, att.name || 'Attachment Preview');
                });
            }

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'attachment-remove-btn';
            removeBtn.title = 'Remove attachment';
            removeBtn.setAttribute('aria-label', 'Remove attachment');
            removeBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            `;
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                pendingAttachments = pendingAttachments.filter(p => p.id !== att.id);
                renderAttachmentPreviews();
            });

            card.appendChild(removeBtn);
            attachmentsTray.appendChild(card);
        });

        updateSendBtnState();
        scrollToBottom();
    }

    async function handleSelectedFiles(files) {
        if (!files || files.length === 0) return;
        const fileList = Array.from(files);

        for (const file of fileList) {
            const ext = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : 'txt';

            if (file.type && file.type.startsWith('image/')) {
                try {
                    const compressed = await compressImage(file, 640, 0.85);
                    pendingAttachments.push({
                        id: compressed.id,
                        type: 'image',
                        name: compressed.name,
                        dataUrl: compressed.dataUrl
                    });
                } catch (err) {
                    console.error('Error compressing attached image:', err);
                }
            } else if (ext === 'xlsx' || ext === 'xls') {
                if (file.size > 20 * 1024 * 1024) {
                    alert(`Spreadsheet "${file.name}" is larger than 20MB. Please select smaller files for offline processing.`);
                    continue;
                }

                try {
                    const arrayBuffer = await file.arrayBuffer();
                    const markdownTable = await parseXlsxToMarkdown(arrayBuffer, file.name);
                    pendingAttachments.push({
                        id: 'sheet-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
                        type: 'spreadsheet',
                        name: file.name,
                        ext: ext,
                        sizeStr: formatBytes(file.size),
                        content: markdownTable,
                        isSpreadsheet: true
                    });
                } catch (err) {
                    console.error('Error parsing spreadsheet:', err);
                    alert(`Could not process spreadsheet "${file.name}": ${err.message || err}`);
                }
            } else {
                // Text, Code, XML, JSON, CSV, TSV, SQL, Markdown, etc.
                if (file.size > 10 * 1024 * 1024) {
                    alert(`File "${file.name}" is larger than 10MB. Please select smaller files for offline processing.`);
                    continue;
                }

                try {
                    const textContent = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result);
                        reader.onerror = () => reject(reader.error);
                        reader.readAsText(file);
                    });

                    let finalContent = textContent;
                    let isSpreadsheet = false;
                    if (ext === 'csv') {
                        finalContent = parseCsvToMarkdown(textContent, ',');
                        isSpreadsheet = true;
                    } else if (ext === 'tsv') {
                        finalContent = parseCsvToMarkdown(textContent, '\t');
                        isSpreadsheet = true;
                    }

                    pendingAttachments.push({
                        id: 'doc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
                        type: isSpreadsheet ? 'spreadsheet' : 'document',
                        name: file.name,
                        ext: ext,
                        sizeStr: formatBytes(file.size),
                        content: finalContent,
                        isSpreadsheet: isSpreadsheet
                    });
                } catch (err) {
                    console.error('Error reading document file:', err);
                }
            }
        }
        renderAttachmentPreviews();
    }

    if (attachImgBtn && imageFileInput) {
        attachImgBtn.addEventListener('click', () => {
            imageFileInput.click();
        });

        imageFileInput.addEventListener('change', () => {
            if (imageFileInput.files && imageFileInput.files.length > 0) {
                handleSelectedFiles(imageFileInput.files);
                imageFileInput.value = '';
            }
        });
    }

    // Drag and Drop support on input container
    if (inputContainer) {
        ['dragenter', 'dragover'].forEach(eventName => {
            inputContainer.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                inputContainer.classList.add('drag-over');
            });
        });

        ['dragleave', 'drop'].forEach(eventName => {
            inputContainer.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                inputContainer.classList.remove('drag-over');
            });
        });

        inputContainer.addEventListener('drop', (e) => {
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                handleSelectedFiles(e.dataTransfer.files);
            }
        });
    }

    // Clipboard paste support (Ctrl+V with image in clipboard)
    window.addEventListener('paste', (e) => {
        if (!chatArea) return;
        const items = e.clipboardData?.items;
        if (!items) return;
        const imageFiles = [];
        for (let i = 0; i < items.length; i++) {
            if (items[i].type && items[i].type.startsWith('image/')) {
                const file = items[i].getAsFile();
                if (file) imageFiles.push(file);
            }
        }
        if (imageFiles.length > 0) {
            e.preventDefault();
            handleSelectedFiles(imageFiles);
        }
    });

    // Lightbox modal close listeners
    const lightboxCloseBtn = document.getElementById('lightbox-close-btn');
    const lightboxOverlay = document.getElementById('lightbox-backdrop');
    lightboxCloseBtn?.addEventListener('click', closeImageLightbox);
    lightboxOverlay?.addEventListener('click', closeImageLightbox);

    // Global keyboard shortcuts (Ctrl+N for new chat, Escape to close modals / abort)
    window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
            e.preventDefault();
            startNewChat();
        }
        if (e.key === 'Escape') {
            closeImageLightbox();
            modelMenu?.classList.add('hidden');
            if (isGenerating && abortController) {
                abortController.abort();
                abortController = null;
                setGeneratingState(false);
            }
        }
    });

    // Chat input keydown: Enter to submit, ArrowUp on empty input to recall last prompt
    chatInput.addEventListener('keydown', (e) => {
        const isMobile = window.innerWidth <= 768;

        if (e.key === 'ArrowUp' && chatInput.value === '') {
            e.preventDefault();
            const history = typeof window.getConversationHistory === 'function' ? window.getConversationHistory() : [];
            const lastUserMsg = history.slice().reverse().find(m => m && m.role === 'user');
            if (lastUserMsg && lastUserMsg.content) {
                chatInput.value = lastUserMsg.content;
                chatInput.style.height = 'auto';
                chatInput.style.height = Math.min(chatInput.scrollHeight, 150) + 'px';
                updateSendBtnState();
                chatInput.setSelectionRange(chatInput.value.length, chatInput.value.length);
            }
            return;
        }

        if (e.key === 'Enter') {
            if (isMobile) return;
            if (!e.shiftKey) {
                e.preventDefault();
                if (!sendBtn.disabled) handleFormSubmit();
            }
        }
    });

    // Header Export Chat button
    const exportChatBtn = document.getElementById('export-chat-btn');
    exportChatBtn?.addEventListener('click', () => {
        exportCurrentChatAsMarkdown();
    });

    chatForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        handleFormSubmit();
    });

    if (mobileNav) {
        chatInput.addEventListener('focus', () => {
            if (window.innerWidth <= 768) {
                mobileNav.style.display = 'none';
                inputArea.style.bottom = '0px';
                setTimeout(scrollToBottom, 300);
            }
        });

        chatInput.addEventListener('blur', () => {
            mobileNav.style.display = '';
            inputArea.style.bottom = '';
        });
    }

    chatInput.addEventListener('focus', () => setTimeout(scrollToBottom, 100));

    sendBtn.addEventListener('mousedown', (e) => e.preventDefault());
    sendBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        handleFormSubmit();
    });

    hydrateChatHistory();
    renderSidebarHistory();
    loadDynamicModels();

    if (typeof window.onSessionChange === 'function') {
        window.onSessionChange(renderSidebarHistory);
    }

    window.addEventListener('popstate', () => {
        hydrateChatHistory();
        renderSidebarHistory();
    });

    // Check server status indicator
    updateServerStatusIndicator();
    setInterval(updateServerStatusIndicator, 4000);
}

async function updateServerStatusIndicator() {
    const indicator = document.getElementById('server-status-dot');
    const label = document.getElementById('server-status-label');
    if (!indicator) return;

    const isAlive = typeof window.checkServerHealth === 'function'
        ? await window.checkServerHealth()
        : false;

    if (isAlive) {
        indicator.style.backgroundColor = '#10b981';
        indicator.title = 'Inference Server: Online';
        if (label) label.textContent = 'Qwen Online';
        const modelMenu = document.getElementById('model-menu');
        if (modelMenu && (!modelMenu.children.length || modelMenu.querySelector('.model-option[style]'))) {
            loadDynamicModels();
        }
    } else {
        indicator.style.backgroundColor = '#ef4444';
        indicator.title = 'Inference Server: Offline';
        if (label) label.textContent = 'Offline';
    }
}

function initMemoryPage() {
    const memoryList = document.getElementById('memory-list');
    if (!memoryList) return;

    const searchInput = document.getElementById('memory-search');
    const clearButton = document.getElementById('clear-memory-btn');
    const newMemoryInput = document.getElementById('new-memory-input');
    const addMemoryBtn = document.getElementById('add-memory-btn');

    function loadMemory() {
        const raw = localStorage.getItem(UI_STORAGE_KEYS.memory);
        const parsed = safeParseJSON(raw || '[]', []);
        return Array.isArray(parsed) ? parsed : [];
    }

    function saveMemory(items) {
        localStorage.setItem(UI_STORAGE_KEYS.memory, JSON.stringify(items));
    }

    let memoryItems = loadMemory();

    function renderMemory(filterText = '') {
        const query = String(filterText).toLowerCase().trim();
        const filtered = memoryItems.filter((item) => {
            const user = String(item.user || '').toLowerCase();
            const assistant = String(item.assistant || '').toLowerCase();
            return !query || user.includes(query) || assistant.includes(query);
        });

        memoryList.innerHTML = '';

        if (filtered.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.textContent = query
                ? 'No memories matched your search.'
                : 'No saved memories yet. Add your first memory above!';
            memoryList.appendChild(empty);
            return;
        }

        filtered.forEach((item) => {
            const card = document.createElement('div');
            card.className = 'memory-card';
            card.dataset.id = item.id;

            const textWrap = document.createElement('div');
            textWrap.className = 'memory-text';

            const type = item.type || (item.assistant ? 'auto' : 'manual');
            const badge = document.createElement('span');
            let badgeClass = 'memory-badge';
            let badgeLabel = 'Custom Fact';

            if (type === 'preference') {
                badgeClass += ' badge-preference';
                badgeLabel = 'Preference';
            } else if (type === 'chat_saved') {
                badgeClass += ' badge-saved';
                badgeLabel = 'Saved in Chat';
            } else if (type === 'manual') {
                badgeClass += ' badge-manual';
                badgeLabel = 'Custom Fact';
            } else {
                badgeClass += ' badge-note';
                badgeLabel = 'Note';
            }

            badge.className = badgeClass;
            badge.textContent = badgeLabel;
            textWrap.appendChild(badge);

            const textSpan = document.createElement('span');
            textSpan.textContent = item.user || '';
            textWrap.appendChild(textSpan);

            const date = document.createElement('span');
            date.className = 'memory-date';
            const timestamp = item.createdAt ? new Date(item.createdAt) : new Date();
            date.textContent = timestamp.toLocaleString();
            textWrap.appendChild(date);

            const deleteButton = document.createElement('button');
            deleteButton.className = 'delete-memory-btn';
            deleteButton.setAttribute('type', 'button');
            deleteButton.setAttribute('aria-label', 'Delete memory');
            deleteButton.title = 'Delete memory';
            deleteButton.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 6h18"></path>
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                </svg>
            `;

            card.appendChild(textWrap);
            card.appendChild(deleteButton);
            memoryList.appendChild(card);
        });
    }

    function handleAddMemory() {
        if (!newMemoryInput) return;
        const text = newMemoryInput.value.trim();
        if (!text) return;

        const newEntry = {
            id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            user: text,
            assistant: '',
            type: 'manual',
            createdAt: new Date().toISOString()
        };

        memoryItems.unshift(newEntry);
        saveMemory(memoryItems);
        newMemoryInput.value = '';
        renderMemory(searchInput?.value || '');
    }

    addMemoryBtn?.addEventListener('click', handleAddMemory);
    newMemoryInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAddMemory();
        }
    });

    searchInput?.addEventListener('input', () => {
        renderMemory(searchInput.value);
    });

    clearButton?.addEventListener('click', () => {
        if (memoryItems.length === 0) return;
        if (confirm('Are you sure you want to clear all saved memories?')) {
            memoryItems = [];
            saveMemory(memoryItems);
            renderMemory(searchInput?.value || '');
        }
    });

    memoryList.addEventListener('click', (event) => {
        const button = event.target.closest('.delete-memory-btn');
        if (!button) return;

        const card = button.closest('.memory-card');
        const id = card?.dataset.id;
        if (!id) return;

        memoryItems = memoryItems.filter((item) => item.id !== id);
        saveMemory(memoryItems);
        renderMemory(searchInput?.value || '');
    });

    window.addEventListener('spark_memory_updated', () => {
        memoryItems = loadMemory();
        renderMemory(searchInput?.value || '');
    });

    renderMemory();
}

// ==================== DATA EXPORT & IMPORT ====================

function downloadFile(content, fileName, mimeType = 'text/plain') {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 150);
}

function exportCurrentChatAsMarkdown() {
    const history = typeof window.getConversationHistory === 'function' ? window.getConversationHistory() : [];
    if (!history || history.length === 0) {
        alert('No messages in this chat session to export.');
        return;
    }

    const sessions = typeof window.getChatSessions === 'function' ? window.getChatSessions() : [];
    const activeId = typeof window.getActiveSessionId === 'function' ? window.getActiveSessionId() : null;
    const activeSession = sessions.find(s => s && s.id === activeId);
    const title = activeSession?.title || 'Spark Conversation';

    let md = `# ${title}\n\n`;
    md += `*Exported on ${new Date().toLocaleString()} from SparkOffline*\n\n---\n\n`;

    history.forEach((msg) => {
        if (!msg || msg.role === 'system') return;
        const role = msg.role === 'user' ? 'User' : 'Spark AI';
        md += `### ${role}\n\n${msg.content || ''}\n\n`;
    });

    const safeTitle = title.toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 30) || 'chat';
    downloadFile(md, `${safeTitle}_${Date.now()}.md`, 'text/markdown;charset=utf-8');
}

function exportSparkBackup() {
    try {
        const backupData = {
            version: '2.0.0',
            exportedAt: new Date().toISOString(),
            sessions: safeParseJSON(localStorage.getItem('spark_chat_sessions'), []),
            memories: safeParseJSON(localStorage.getItem('spark_memory'), []),
            profile: safeParseJSON(localStorage.getItem('spark_profile'), {}),
            avatar: localStorage.getItem('spark_avatar') || '',
            theme: localStorage.getItem('spark_theme') || 'dark',
            selectedModel: localStorage.getItem('spark_selected_model') || '',
            enableHistory: localStorage.getItem('spark_enable_history') !== 'false',
            alwaysExpandCode: localStorage.getItem('spark_always_expand_code') !== 'false'
        };

        const jsonStr = JSON.stringify(backupData, null, 2);
        const dateStr = new Date().toISOString().slice(0, 10);
        downloadFile(jsonStr, `spark-backup-${dateStr}.json`, 'application/json;charset=utf-8');
    } catch (err) {
        console.error('Backup export failed:', err);
        alert('Failed to export backup: ' + err.message);
    }
}

function importSparkBackup(jsonString) {
    try {
        const data = JSON.parse(jsonString);
        if (!data || typeof data !== 'object') {
            throw new Error('Invalid JSON backup file format.');
        }

        const sessionCount = Array.isArray(data.sessions) ? data.sessions.length : 0;
        const memCount = Array.isArray(data.memories) ? data.memories.length : 0;

        if (!confirm(`Restore backup containing ${sessionCount} chats and ${memCount} memories?\n\nThis will merge with your current offline data.`)) {
            return;
        }

        // Merge sessions
        if (Array.isArray(data.sessions)) {
            const existingSessions = safeParseJSON(localStorage.getItem('spark_chat_sessions'), []);
            const existingIds = new Set(existingSessions.map(s => s.id));
            data.sessions.forEach(s => {
                if (s && s.id && !existingIds.has(s.id)) {
                    existingSessions.push(s);
                }
            });
            localStorage.setItem('spark_chat_sessions', JSON.stringify(existingSessions));
        }

        // Merge memories
        if (Array.isArray(data.memories)) {
            const existingMem = safeParseJSON(localStorage.getItem('spark_memory'), []);
            const existingTexts = new Set(existingMem.map(m => (m.user || '').toLowerCase()));
            data.memories.forEach(m => {
                const text = (m && m.user || '').toLowerCase();
                if (text && !existingTexts.has(text)) {
                    existingMem.unshift(m);
                }
            });
            localStorage.setItem('spark_memory', JSON.stringify(existingMem));
        }

        // Restore profile if present
        if (data.profile && typeof data.profile === 'object' && Object.keys(data.profile).length > 0) {
            localStorage.setItem('spark_profile', JSON.stringify(data.profile));
        }
        if (data.avatar) {
            localStorage.setItem('spark_avatar', data.avatar);
        }

        alert('Backup successfully restored! Refreshing...');
        window.location.reload();
    } catch (err) {
        console.error('Backup restore failed:', err);
        alert('Failed to restore backup: ' + err.message);
    }
}

function initSettingsPage() {
    const selectContainers = Array.from(document.querySelectorAll('.custom-select-container'));
    if (selectContainers.length === 0) return;

    function setSelectValue(container, value) {
        const options = Array.from(container.querySelectorAll('.custom-option'));
        const target = options.find((option) => option.dataset.value === String(value)) || options[0];
        if (!target) return;

        options.forEach((option) => option.classList.remove('selected'));
        target.classList.add('selected');

        const selectedText = container.querySelector('.selected-text');
        if (selectedText) selectedText.textContent = target.textContent || '';
    }

    function handleSelectChange(container, value) {
        const settingKey = container?.dataset?.settingKey;
        if (settingKey) {
            localStorage.setItem(settingKey, value);
            if (settingKey === 'spark_selected_model' && typeof window.setSelectedModel === 'function') {
                window.setSelectedModel(value);
            }
            return;
        }

        // Theme dropdown
        if (value === 'system' || value === 'dark' || value === 'light') {
            applyThemeSelection(value);
            return;
        }

        localStorage.setItem('spark_selected_model', value);
        if (typeof window.setSelectedModel === 'function') {
            window.setSelectedModel(value);
        }
    }

    selectContainers.forEach((container) => {
        const settingKey = container.dataset.settingKey;
        if (settingKey) {
            let defaultValue = '';
            if (settingKey === 'spark_context_window') defaultValue = '4096';
            else if (settingKey === 'spark_max_tokens') defaultValue = '2048';
            else if (settingKey === 'spark_history_window_size') defaultValue = '24';
            else if (settingKey === 'spark_selected_model') defaultValue = '';

            const saved = localStorage.getItem(settingKey) || defaultValue;
            if (saved) {
                setSelectValue(container, saved);
            }
        } else if (container.querySelector('.custom-option[data-value="dark"]')) {
            setSelectValue(container, getThemeSelection());
        }

        const trigger = container.querySelector('.custom-select-trigger');
        const options = Array.from(container.querySelectorAll('.custom-option'));

        trigger?.addEventListener('click', (event) => {
            event.stopPropagation();
            selectContainers.forEach((other) => {
                if (other !== container) other.classList.remove('open');
            });
            container.classList.toggle('open');
        });

        options.forEach((option) => {
            option.addEventListener('click', () => {
                const value = option.dataset.value;
                if (!value) return;
                setSelectValue(container, value);
                container.classList.remove('open');
                handleSelectChange(container, value);
            });
        });
    });

    const modelContainer = document.getElementById('settings-model-container');
    if (modelContainer && typeof window.fetchAvailableModels === 'function') {
        window.fetchAvailableModels().then((models) => {
            if (!models || models.length === 0) return;
            const optionsContainer = modelContainer.querySelector('.custom-options');
            if (!optionsContainer) return;
            optionsContainer.innerHTML = '';

            const currentModel = localStorage.getItem('spark_selected_model') || models[0];

            models.forEach((modelId) => {
                const cleanName = modelId.replace(/\.gguf$/i, '');
                const opt = document.createElement('div');
                opt.className = 'custom-option' + (modelId === currentModel ? ' selected' : '');
                opt.dataset.value = modelId;
                opt.textContent = cleanName;

                opt.addEventListener('click', () => {
                    setSelectValue(modelContainer, modelId);
                    modelContainer.classList.remove('open');
                    handleSelectChange(modelContainer, modelId);
                });

                optionsContainer.appendChild(opt);
            });

            setSelectValue(modelContainer, currentModel);
        });
    }

    // Temperature slider & live badge
    const tempSlider = document.getElementById('temp-slider');
    const tempBadge = document.getElementById('temp-value-badge');
    if (tempSlider && tempBadge) {
        const savedTemp = localStorage.getItem('spark_temperature') || '0.70';
        const numTemp = parseFloat(savedTemp);
        const formatted = (!isNaN(numTemp) && numTemp >= 0.0 && numTemp <= 2.0 ? numTemp : 0.70).toFixed(2);
        tempSlider.value = formatted;
        tempBadge.textContent = formatted;

        tempSlider.addEventListener('input', () => {
            const val = parseFloat(tempSlider.value).toFixed(2);
            tempBadge.textContent = val;
            localStorage.setItem('spark_temperature', val);
        });
    }

    // Deep Thinking toggle in Settings
    const thinkingToggle = document.getElementById('toggle-thinking');
    if (thinkingToggle) {
        const isEnabled = typeof window.isThinkingEnabled === 'function'
            ? window.isThinkingEnabled()
            : localStorage.getItem('spark_enable_thinking') === 'true';
        thinkingToggle.checked = isEnabled;
        thinkingToggle.addEventListener('change', () => {
            if (typeof window.setThinkingEnabled === 'function') {
                window.setThinkingEnabled(thinkingToggle.checked);
            } else {
                localStorage.setItem('spark_enable_thinking', thinkingToggle.checked ? 'true' : 'false');
            }
        });
    }

    // Hint "?" toggle buttons
    const hintButtons = document.querySelectorAll('.hint-btn');
    hintButtons.forEach((btn) => {
        btn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const targetId = btn.getAttribute('data-hint');
            if (!targetId) return;
            const banner = document.getElementById(targetId);
            if (!banner) return;

            const isCurrentlyHidden = banner.classList.contains('hidden');
            if (isCurrentlyHidden) {
                banner.classList.remove('hidden');
                btn.classList.add('active');
            } else {
                banner.classList.add('hidden');
                btn.classList.remove('active');
            }
        });
    });

    // Wire settings toggles
    const codeBlocksToggle = document.getElementById('toggle-code-blocks');
    if (codeBlocksToggle) {
        codeBlocksToggle.checked = localStorage.getItem('spark_always_expand_code') !== 'false';
        codeBlocksToggle.addEventListener('change', () => {
            localStorage.setItem('spark_always_expand_code', codeBlocksToggle.checked ? 'true' : 'false');
        });
    }

    const chatHistoryToggle = document.getElementById('toggle-chat-history');
    if (chatHistoryToggle) {
        chatHistoryToggle.checked = localStorage.getItem('spark_enable_history') !== 'false';
        chatHistoryToggle.addEventListener('change', () => {
            localStorage.setItem('spark_enable_history', chatHistoryToggle.checked ? 'true' : 'false');
        });
    }

    // Wire Export Data Backup button
    const exportBackupBtn = document.getElementById('export-backup-btn');
    exportBackupBtn?.addEventListener('click', () => {
        exportSparkBackup();
    });

    // Wire Restore Data Backup button & file input
    const importBackupBtn = document.getElementById('import-backup-btn');
    const importBackupInput = document.getElementById('import-backup-input');
    importBackupBtn?.addEventListener('click', () => {
        importBackupInput?.click();
    });

    importBackupInput?.addEventListener('change', () => {
        if (!importBackupInput.files || importBackupInput.files.length === 0) return;
        const file = importBackupInput.files[0];
        const reader = new FileReader();
        reader.onload = (e) => {
            importSparkBackup(e.target.result);
            importBackupInput.value = '';
        };
        reader.readAsText(file);
    });

    // Clear All Chats button
    const clearChatsBtn = document.getElementById('clear-chats-btn') || document.querySelector('.setting-card .btn.btn-danger');
    if (clearChatsBtn) {
        clearChatsBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to delete all chat history? This cannot be undone.')) {
                if (typeof window.clearAllChatSessions === 'function') {
                    window.clearAllChatSessions();
                } else {
                    localStorage.removeItem('spark_chat_sessions');
                    localStorage.removeItem('spark_active_session_id');
                    localStorage.removeItem('spark_chat_history');
                }
                alert('All chat history cleared.');
            }
        });
    }

    const systemRow = document.getElementById('system-instructions-row');
    const previewBox = document.getElementById('system-instructions-preview');
    const previewText = document.getElementById('system-instructions-text');

    systemRow?.addEventListener('click', async () => {
        if (!previewBox) return;
        const isCurrentlyHidden = previewBox.style.display === 'none';
        if (isCurrentlyHidden) {
            previewBox.style.display = 'block';
            if (typeof window.fetchSystemPrompt === 'function') {
                const prompt = await window.fetchSystemPrompt();
                if (previewText) previewText.textContent = prompt || '(Empty system_prompt.txt)';
            }
        } else {
            previewBox.style.display = 'none';
        }
    });

    document.addEventListener('click', () => {
        selectContainers.forEach((container) => container.classList.remove('open'));
    });
}

function initProfilePage() {
    const profileNameInput = document.getElementById('profile-name');
    if (!profileNameInput) return; // Not on profile page

    const profileEmailInput = document.getElementById('profile-email');
    const profileDisplayInput = document.getElementById('profile-display-name');
    const profilePhoneInput = document.getElementById('profile-phone');
    const saveProfileBtn = document.getElementById('save-profile-btn');
    const avatarEditBtn = document.getElementById('avatar-edit-btn');
    const avatarFileInput = document.getElementById('avatar-file-input');
    const heroAvatarImg = document.getElementById('hero-avatar-img');
    const heroName = document.getElementById('profile-hero-name');
    const heroBadge = document.getElementById('profile-joined-badge');

    const statMessages = document.getElementById('stat-messages-val');
    const statSessions = document.getElementById('stat-sessions-val');
    const statMemories = document.getElementById('stat-memories-val');

    const signoutBtn = document.getElementById('profile-signout-btn');
    const deleteBtn = document.getElementById('profile-delete-btn');

    // Populate data
    const profile = getProfileData();
    profileNameInput.value = profile.name;
    if (profileEmailInput) profileEmailInput.value = profile.email;
    if (profileDisplayInput) profileDisplayInput.value = profile.displayName;
    if (profilePhoneInput) profilePhoneInput.value = profile.phone;
    if (heroName) heroName.textContent = profile.name;
    if (heroAvatarImg) heroAvatarImg.src = profile.avatar;
    if (heroBadge) heroBadge.textContent = 'Joined ' + (profile.joined || 'Local');

    // Calculate dynamic live statistics
    const sessions = typeof window.getChatSessions === 'function' ? window.getChatSessions() : [];
    let totalMessages = 0;
    sessions.forEach(s => {
        if (Array.isArray(s.messages)) totalMessages += s.messages.length;
    });

    const rawMem = localStorage.getItem('spark_memory');
    const memories = safeParseJSON(rawMem, []);

    if (statMessages) statMessages.textContent = totalMessages.toLocaleString();
    if (statSessions) statSessions.textContent = sessions.length.toLocaleString();
    if (statMemories) statMemories.textContent = (Array.isArray(memories) ? memories.length : 0).toLocaleString();

    // Save profile changes
    saveProfileBtn?.addEventListener('click', () => {
        const updated = {
            name: profileNameInput.value.trim() || 'Guest User',
            email: profileEmailInput?.value.trim() || 'user@example.com',
            displayName: profileDisplayInput?.value.trim() || 'SparkUser',
            phone: profilePhoneInput?.value.trim() || '',
            avatar: localStorage.getItem('spark_avatar') || 'assets/avatar.png',
            joined: profile.joined || 'Dec 2024'
        };
        saveProfileData(updated);
        if (heroName) heroName.textContent = updated.name;
        syncGlobalProfileUI();

        const originalText = saveProfileBtn.textContent;
        saveProfileBtn.textContent = 'Saved!';
        saveProfileBtn.style.backgroundColor = '#10b981';
        saveProfileBtn.style.color = '#ffffff';
        setTimeout(() => {
            saveProfileBtn.textContent = originalText;
            saveProfileBtn.style.backgroundColor = '';
            saveProfileBtn.style.color = '';
        }, 2000);
    });

    // Avatar upload
    avatarEditBtn?.addEventListener('click', () => {
        avatarFileInput?.click();
    });

    avatarFileInput?.addEventListener('change', async () => {
        if (!avatarFileInput.files || avatarFileInput.files.length === 0) return;
        const file = avatarFileInput.files[0];
        if (!file.type.startsWith('image/')) {
            alert('Please select an image file (PNG, JPG, WebP).');
            return;
        }

        try {
            const compressed = await compressImage(file, 256, 0.9);
            localStorage.setItem('spark_avatar', compressed.dataUrl);
            if (heroAvatarImg) heroAvatarImg.src = compressed.dataUrl;
            syncGlobalProfileUI();
        } catch (err) {
            console.error('Failed to process avatar:', err);
        }
    });

    // Sign out button
    signoutBtn?.addEventListener('click', () => {
        if (confirm('Sign out and switch to a fresh guest session?')) {
            if (typeof window.setActiveSessionId === 'function') {
                window.setActiveSessionId(null);
            }
            window.location.href = '/';
        }
    });

    // Reset all data button
    deleteBtn?.addEventListener('click', () => {
        if (confirm('DANGER: This will permanently delete all chat history, saved memories, and custom profile settings. Continue?')) {
            localStorage.clear();
            alert('All local data has been reset.');
            window.location.href = '/';
        }
    });
}

function initCopyButtons() {
    document.addEventListener('click', (event) => {
        const button = event.target.closest('.copy-btn');
        if (!button) return;

        const wrapper = button.closest('.code-wrapper');
        const codeElement = wrapper?.querySelector('code');
        if (!codeElement) return;

        const textToCopy = codeElement.innerText;
        navigator.clipboard.writeText(textToCopy).then(() => {
            const originalText = button.textContent;
            button.textContent = 'Copied!';
            setTimeout(() => {
                button.textContent = originalText;
            }, 2000);
        }).catch((error) => {
            console.error('Failed to copy:', error);
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    applyThemeSelection(getThemeSelection());
    syncGlobalProfileUI();
    initSidebar();
    initSidebarHistory();
    initChatPage();
    initMemoryPage();
    initSettingsPage();
    initProfilePage();
    initCopyButtons();
});

const systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
systemThemeQuery.addEventListener('change', () => {
    if (getThemeSelection() === 'system') {
        applyThemeSelection('system');
    }
});
