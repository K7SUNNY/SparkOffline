const STORAGE_KEYS = {
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
    const saved = localStorage.getItem(STORAGE_KEYS.theme);
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

    localStorage.setItem(STORAGE_KEYS.theme, normalized);

    const resolved = resolveTheme(normalized);
    if (document.body) {
        document.body.setAttribute('data-theme', resolved);
    }
}

// Marked.js Configuration with Code Highlighting & Copy Button
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

function renderMarkdownSafe(rawText) {
    if (!rawText) return '';
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

    sidebarHeader?.addEventListener('click', () => {
        if (window.innerWidth > 768 && sidebar.classList.contains('collapsed')) {
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
    const modelOptions = Array.from(document.querySelectorAll('.model-option'));
    const welcomeScreen = document.getElementById('welcome-screen');
    const mobileNav = document.querySelector('.mobile-bottom-nav');
    const newChatBtn = document.querySelector('.new-chat-btn');

    let isGenerating = false;
    let abortController = null;
    let firstChunkReceived = false;

    const modelLabelByValue = {
        pro: 'Qwen 3.5 Pro',
        fast: 'Qwen 3.5 Fast',
        coding: 'Qwen 3.5 Coding'
    };

    const aiIcon = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1v2h-1v1a2 2 0 0 1 2 2H5a2 2 0 0 1-2-2v-1H2v-2h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2Z"/>
        </svg>`;

    function scrollToBottom() {
        chatArea.scrollTop = chatArea.scrollHeight;
    }

    function hideWelcomeIfNeeded() {
        if (welcomeScreen && !welcomeScreen.classList.contains('hidden')) {
            welcomeScreen.classList.add('hidden');
            setTimeout(() => welcomeScreen.remove(), 300);
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

    function setSelectedModel(modelValue) {
        const option = modelOptions.find((item) => item.dataset.value === modelValue);
        const resolved = option?.dataset.value || 'pro';

        modelOptions.forEach((item) => item.classList.remove('selected'));
        if (option) option.classList.add('selected');

        currentModelText.textContent = modelLabelByValue[resolved] || modelLabelByValue.pro;
        localStorage.setItem(STORAGE_KEYS.model, resolved);

        if (typeof window.updateModel === 'function') {
            window.updateModel(resolved);
        }
    }

    function hydrateChatHistory() {
        if (typeof window.getConversationHistory !== 'function') return;
        const history = window.getConversationHistory();
        if (!Array.isArray(history) || history.length === 0) return;

        const visibleMessages = history.filter(
            (message) => message && typeof message === 'object' && message.role !== 'system'
        );
        if (visibleMessages.length === 0) return;

        hideWelcomeIfNeeded();
        visibleMessages.forEach((message) => {
            if (message.role === 'assistant') {
                appendMessage(message.content || '', 'ai');
            } else {
                appendMessage(message.content || '', 'user');
            }
        });
    }

    // New Chat Action: resets conversation cleanly without page reload flash
    newChatBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        if (isGenerating && abortController) {
            abortController.abort();
        }
        if (typeof window.clearConversationHistory === 'function') {
            window.clearConversationHistory();
        }
        chatArea.innerHTML = `
            <div id="welcome-screen" class="welcome-screen">
                <h2>Hey, I'm Spark</h2>
                <p>Powered by Qwen 3.5 local model. Ask me anything...</p>
            </div>
        `;
        setGeneratingState(false);
        chatInput.value = '';
        chatInput.focus();
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

        fetchAndStreamResponse(message, abortController.signal, (chunk, isDone, isReasoning) => {
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
            }
        });
    }

    modelBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        modelMenu?.classList.toggle('hidden');
    });

    modelOptions.forEach((option) => {
        option.addEventListener('click', () => {
            const modelValue = option.dataset.value || 'pro';
            setSelectedModel(modelValue);
            modelMenu?.classList.add('hidden');
        });
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

    const initialModel = localStorage.getItem(STORAGE_KEYS.model) || 'pro';
    setSelectedModel(initialModel);
    hydrateChatHistory();

    // Check server status indicator
    updateServerStatusIndicator();
    setInterval(updateServerStatusIndicator, 8000);
}

async function updateServerStatusIndicator() {
    const indicator = document.getElementById('server-status-dot');
    const label = document.getElementById('server-status-label');
    if (!indicator) return;

    const isAlive = await window.checkServerHealth?.();
    if (isAlive) {
        indicator.style.backgroundColor = '#10b981';
        indicator.title = 'Model Server: Online';
        if (label) label.textContent = 'Qwen Online';
    } else {
        indicator.style.backgroundColor = '#ef4444';
        indicator.title = 'Model Server: Offline';
        if (label) label.textContent = 'Offline';
    }
}

function initMemoryPage() {
    const memoryList = document.getElementById('memory-list');
    if (!memoryList) return;

    const searchInput = document.getElementById('memory-search');
    const clearButton = document.getElementById('clear-memory-btn');

    function loadMemory() {
        const raw = localStorage.getItem(STORAGE_KEYS.memory);
        const parsed = safeParseJSON(raw || '[]', []);
        return Array.isArray(parsed) ? parsed : [];
    }

    function saveMemory(items) {
        localStorage.setItem(STORAGE_KEYS.memory, JSON.stringify(items));
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
        const target = options.find((option) => option.dataset.value === value) || options[0];
        if (!target) return;

        options.forEach((option) => option.classList.remove('selected'));
        target.classList.add('selected');

        const selectedText = container.querySelector('.selected-text');
        if (selectedText) selectedText.textContent = target.textContent || '';
    }

    function handleSelectChange(value) {
        if (value === 'system' || value === 'dark' || value === 'light') {
            applyThemeSelection(value);
            return;
        }

        if (value === 'pro' || value === 'fast' || value === 'coding') {
            localStorage.setItem(STORAGE_KEYS.model, value);
            if (typeof window.updateModel === 'function') {
                window.updateModel(value);
            }
        }
    }

    selectContainers.forEach((container) => {
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
                handleSelectChange(value);
            });
        });

        if (container.querySelector('.custom-option[data-value="dark"]')) {
            setSelectValue(container, getThemeSelection());
        }

        if (container.querySelector('.custom-option[data-value="pro"]')) {
            setSelectValue(container, localStorage.getItem(STORAGE_KEYS.model) || 'pro');
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
