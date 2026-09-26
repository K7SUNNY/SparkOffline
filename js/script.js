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

// Marked.js Configuration with Code Highlighting & Copy Button
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
            if (currentReasoningText) {
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

    function appendMessage(text, sender) {
        const row = document.createElement('div');
        row.className = `message-row ${sender}`;

        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';
        bubble.style.whiteSpace = 'normal';

        if (sender === 'ai') {
            bubble.innerHTML = renderMarkdownSafe(text || '');
        } else {
            bubble.textContent = String(text || '');
        }

        const content = document.createElement('div');
        content.className = 'message-content';
        content.appendChild(bubble);

        if (sender === 'ai') {
            const avatar = document.createElement('div');
            avatar.className = 'message-avatar';
            avatar.innerHTML = aiIcon;
            row.appendChild(avatar);
        }

        row.appendChild(content);
        chatArea.appendChild(row);
        scrollToBottom();

        if (sender === 'ai') return bubble;
        return null;
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

        if (active) {
            sendBtn.disabled = false;
            sendBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`;
            sendBtn.title = 'Stop Generation';
            sendBtn.setAttribute('aria-label', 'Stop generation');
        } else {
            sendBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"></path><path d="m21.854 2.147-10.94 10.939"></path></svg>`;
            sendBtn.title = 'Send Message';
            sendBtn.setAttribute('aria-label', 'Send message');
            sendBtn.disabled = chatInput.value.trim().length === 0;
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
            const opt = document.createElement('div');
            opt.className = 'model-option' + (modelId === activeModel ? ' selected' : '');
            opt.dataset.value = modelId;

            opt.innerHTML = `
                <span class="model-name">${escapeHtml(cleanName)}</span>
                <span class="model-desc">${escapeHtml(cleanName)}.gguf</span>
            `;

            opt.addEventListener('click', () => {
                setSelectedModel(modelId);
                modelMenu.classList.add('hidden');
            });

            modelMenu.appendChild(opt);
        });

        setSelectedModel(activeModel);
    }

    function renderSidebarHistory() {
        const container = document.getElementById('sidebar-history-list') || document.querySelector('.history-list');
        if (!container) return;

        const sessions = typeof window.getChatSessions === 'function' ? window.getChatSessions() : [];
        const activeId = typeof window.getActiveSessionId === 'function' ? window.getActiveSessionId() : null;

        container.innerHTML = '';

        if (sessions.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'history-empty';
            empty.textContent = 'No recent chats';
            container.appendChild(empty);
            return;
        }

        sessions.forEach((session) => {
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
                    hydrateChatHistory();
                }
                renderSidebarHistory();
            });

            item.addEventListener('click', () => {
                if (typeof window.setActiveSessionId === 'function') {
                    window.setActiveSessionId(session.id);
                }
                if (!document.getElementById('chat-area')) {
                    window.location.href = '/?chat=' + encodeURIComponent(session.id);
                    return;
                }
                hydrateChatHistory();
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
            return;
        }

        const visibleMessages = history.filter(
            (message) => message && typeof message === 'object' && message.role !== 'system'
        );
        if (visibleMessages.length === 0) {
            renderWelcomeScreen();
            return;
        }

        visibleMessages.forEach((message) => {
            if (message.role === 'assistant') {
                appendMessage(message.content || '', 'ai');
            } else {
                appendMessage(message.content || '', 'user');
            }
        });
        scrollToBottom();
    }

    // New Chat Action: resets conversation cleanly without page reload flash
    function startNewChat() {
        if (isGenerating && abortController) {
            abortController.abort();
            abortController = null;
        }
        if (typeof window.setActiveSessionId === 'function') {
            window.setActiveSessionId(null);
        }
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

    const newChatButtons = document.querySelectorAll('.new-chat-btn');
    newChatButtons.forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            startNewChat();
        });
    });

    const chatsNavLinks = document.querySelectorAll('.sidebar-nav a[href="/"], .sidebar-nav a[href="index.html"], .sidebar-nav a[href="."]');
    chatsNavLinks.forEach((link) => {
        link.addEventListener('click', (e) => {
            if (document.getElementById('chat-area')) {
                e.preventDefault();
                startNewChat();
            }
        });
    });

    const mobileChatNavLinks = document.querySelectorAll('.mobile-bottom-nav a[href="/"], .mobile-bottom-nav a[href="index.html"], .mobile-bottom-nav a[href="."]');
    mobileChatNavLinks.forEach((link) => {
        link.addEventListener('click', (e) => {
            if (document.getElementById('chat-area')) {
                e.preventDefault();
                startNewChat();
            }
        });
    });

    const headerProfileBtn = document.querySelector('.top-header .profile-btn');
    headerProfileBtn?.addEventListener('click', () => {
        window.location.href = 'profile.html';
    });

    function handleFormSubmit() {
        if (isGenerating) {
            if (abortController) {
                abortController.abort();
                abortController = null;
            }
            return;
        }

        const message = chatInput.value.trim();
        if (!message) return;

        hideWelcomeIfNeeded();
        appendMessage(message, 'user');
        chatInput.value = '';
        chatInput.style.height = 'auto';

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

        streamFn(message, abortController.signal, (chunk, isDone, isReasoning) => {
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
                        sendBtn.disabled = false;
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
                    if (currentReasoningText) {
                        finalCombined += `<think>${currentReasoningText}</think>\n\n`;
                    }
                    finalCombined += currentContentText;
                    window.aiBubble.innerHTML = renderMarkdownSafe(finalCombined);
                }
                setGeneratingState(false);
                abortController = null;
                renderSidebarHistory();
            }
        });
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
        if (!isGenerating) sendBtn.disabled = this.value.trim().length === 0;
        scrollToBottom();
    });

    chatInput.addEventListener('keydown', (e) => {
        const isMobile = window.innerWidth <= 768;
        if (e.key === 'Enter') {
            if (isMobile) return;
            if (!e.shiftKey) {
                e.preventDefault();
                if (!sendBtn.disabled) handleFormSubmit();
            }
        }
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
                : 'No saved memories yet.';
            memoryList.appendChild(empty);
            return;
        }

        filtered.forEach((item) => {
            const card = document.createElement('div');
            card.className = 'memory-card';
            card.dataset.id = item.id;

            const textWrap = document.createElement('div');
            textWrap.className = 'memory-text';
            textWrap.textContent = item.user || '';

            const date = document.createElement('span');
            date.className = 'memory-date';
            const timestamp = item.createdAt ? new Date(item.createdAt) : new Date();
            date.textContent = timestamp.toLocaleString();
            textWrap.appendChild(date);

            const deleteButton = document.createElement('button');
            deleteButton.className = 'delete-memory-btn';
            deleteButton.setAttribute('type', 'button');
            deleteButton.setAttribute('aria-label', 'Delete memory');
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

    searchInput?.addEventListener('input', () => {
        renderMemory(searchInput.value);
    });

    clearButton?.addEventListener('click', () => {
        memoryItems = [];
        saveMemory(memoryItems);
        renderMemory(searchInput?.value || '');
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

    renderMemory();
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
            if (settingKey === 'spark_context_window') defaultValue = '2048';
            else if (settingKey === 'spark_max_tokens') defaultValue = '2048';
            else if (settingKey === 'spark_history_window_size') defaultValue = '16';
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

    // Clear All Chats button
    const clearChatsBtn = document.querySelector('.setting-card .btn.btn-danger');
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
    initSidebar();
    initChatPage();
    initMemoryPage();
    initSettingsPage();
    initCopyButtons();
});

const systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
systemThemeQuery.addEventListener('change', () => {
    if (getThemeSelection() === 'system') {
        applyThemeSelection('system');
    }
});
