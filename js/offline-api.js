/**
 * SparkV2 Offline API Client
 * Handles multi-session chat history, dynamic discovery of raw .gguf models,
 * and streaming communication with the local llama.cpp router engine.
 */

(function () {
    'use strict';

    const STORAGE_KEYS = {
    sessions: 'spark_chat_sessions',
    activeSession: 'spark_active_session_id',
    legacyHistory: 'spark_chat_history',
    selectedModel: 'spark_selected_model',
    memory: 'spark_memory',
    apiBase: 'spark_api_base'
};

const MAX_CONTEXT_MESSAGES = 16;

let conversationHistory = [];
let availableModels = [];
let currentSelectedModel = localStorage.getItem(STORAGE_KEYS.selectedModel) || '';
let activeSessionId = null;
let sessionChangeListeners = [];

function resolveApiBase() {
    const explicit = window.SPARK_API_BASE || localStorage.getItem(STORAGE_KEYS.apiBase);
    if (explicit) return String(explicit).replace(/\/+$/, '');

    // If currently hosted on port 5000 or similar, use same origin
    if (window.location.port === '5000' || window.location.port === '8080') {
        return window.location.origin;
    }
    return 'http://127.0.0.1:5000';
}

function fetchWithTimeout(url, options = {}, timeoutMs = 4000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const signal = options.signal || controller.signal;
    return fetch(url, { ...options, signal }).finally(() => clearTimeout(timer));
}

function deriveTitle(text, hasImages = false) {
    if (!text) return hasImages ? 'Image Conversation' : 'New Conversation';
    let clean = String(text)
        .replace(/[\r\n]+/g, ' ')
        .replace(/[#*_`~]/g, '')
        .trim();
    if (clean.length > 36) {
        clean = clean.substring(0, 36).trim() + '...';
    }
    return clean || (hasImages ? 'Image Conversation' : 'New Conversation');
}

/* ==================== MULTI-SESSION PERSISTENCE ==================== */

function getChatSessions() {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.sessions);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                return parsed.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
            }
        }
    } catch (e) {
        console.warn('Failed to parse chat sessions:', e);
    }

    // Migration from single spark_chat_history
    try {
        const legacyRaw = localStorage.getItem(STORAGE_KEYS.legacyHistory);
        if (legacyRaw) {
            const legacy = JSON.parse(legacyRaw);
            if (Array.isArray(legacy) && legacy.length > 0) {
                const firstUserMsg = legacy.find(m => m && m.role === 'user');
                const title = firstUserMsg ? deriveTitle(firstUserMsg.content) : 'Previous Chat';
                const initialSession = {
                    id: 'chat-' + Date.now(),
                    title: title,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    messages: legacy
                };
                const initialList = [initialSession];
                localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(initialList));
                try { localStorage.removeItem(STORAGE_KEYS.legacyHistory); } catch (_) {}
                return initialList;
            }
        }
    } catch (e) {
        console.warn('Migration error:', e);
    }

    return [];
}

function saveChatSessions(sessions) {
    if (!Array.isArray(sessions)) return;
    if (localStorage.getItem('spark_enable_history') === 'false') {
        return;
    }
    try {
        localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(sessions));
    } catch (e) {
        console.warn('Failed to save chat sessions (quota exceeded?), attempting cleanup:', e);
        try {
            // Level 1: Strip base64 images from all non-active / older sessions
            const pruned = sessions.map(sess => {
                if (sess.id === activeSessionId) return sess;
                return {
                    ...sess,
                    messages: (sess.messages || []).map(m => {
                        if (m.images && m.images.length > 0) {
                            return { ...m, images: [] };
                        }
                        return m;
                    })
                };
            });
            localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(pruned));
        } catch (e2) {
            console.warn('Level 1 cleanup failed, attempting Level 2 cleanup:', e2);
            try {
                // Level 2: Strip base64 images from all sessions completely, keeping text
                const prunedAll = sessions.map(sess => ({
                    ...sess,
                    messages: (sess.messages || []).map(m => {
                        if (m.images && m.images.length > 0) {
                            return { ...m, images: [] };
                        }
                        return m;
                    })
                }));
                localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(prunedAll));
            } catch (e3) {
                console.error('Critical: LocalStorage full even after stripping all images', e3);
            }
        }
    }
}

function getCleanChatBasePath() {
    if (typeof window === 'undefined') return '/';
    const path = window.location.pathname || '/';
    if (path.endsWith('index.html')) {
        return path.replace(/index\.html$/, '') || '/';
    }
    return path || '/';
}

function getChatIdFromUrl() {
    if (typeof window === 'undefined') return null;
    try {
        const params = new URLSearchParams(window.location.search);
        return params.get('chat') || params.get('session') || params.get('c') || params.get('id');
    } catch {
        return null;
    }
}

function getActiveSession() {
    const sessions = getChatSessions();
    if (!activeSessionId) return null;
    return sessions.find(s => s.id === activeSessionId) || null;
}

function setActiveSessionId(sessionId) {
    activeSessionId = sessionId;
    if (sessionId) {
        try { localStorage.setItem(STORAGE_KEYS.activeSession, sessionId); } catch (_) {}
        const session = getActiveSession();
        conversationHistory = session ? [...(session.messages || [])] : [];
    } else {
        try { localStorage.removeItem(STORAGE_KEYS.activeSession); } catch (_) {}
        conversationHistory = [];
    }

    // Sync URL without full page reload
    if (typeof window !== 'undefined' && window.history && (window.history.pushState || window.history.replaceState)) {
        try {
            const basePath = getCleanChatBasePath();
            const currentChat = getChatIdFromUrl();
            if (sessionId) {
                if (currentChat !== sessionId) {
                    const newUrl = `${basePath}?chat=${encodeURIComponent(sessionId)}`;
                    window.history.pushState({ sessionId }, '', newUrl);
                }
            } else {
                if (currentChat !== null || window.location.search.length > 0) {
                    window.history.pushState({ sessionId: null }, '', basePath);
                }
            }
        } catch (_) {}
    }

    notifySessionChange();
}

function createNewSession(initialTitle = 'New Conversation') {
    const newSession = {
        id: 'chat-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
        title: initialTitle,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: []
    };
    const sessions = getChatSessions();
    sessions.unshift(newSession);
    saveChatSessions(sessions);
    setActiveSessionId(newSession.id);
    return newSession;
}

function deleteChatSession(sessionId) {
    let sessions = getChatSessions();
    sessions = sessions.filter(s => s.id !== sessionId);
    saveChatSessions(sessions);

    try {
        const storedActive = localStorage.getItem(STORAGE_KEYS.activeSession);
        if (storedActive === sessionId) {
            localStorage.removeItem(STORAGE_KEYS.activeSession);
        }
    } catch (_) {}

    if (activeSessionId === sessionId) {
        setActiveSessionId(null);
    } else {
        notifySessionChange();
    }
}

function clearAllChatSessions() {
    localStorage.removeItem(STORAGE_KEYS.sessions);
    try { localStorage.removeItem(STORAGE_KEYS.activeSession); } catch (_) {}
    try { localStorage.removeItem(STORAGE_KEYS.legacyHistory); } catch (_) {}
    activeSessionId = null;
    conversationHistory = [];
    if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
        try {
            window.history.replaceState(null, '', getCleanChatBasePath());
        } catch (_) {}
    }
    notifySessionChange();
}

function saveActiveSessionMessages() {
    const sessions = getChatSessions();
    let currentSession = sessions.find(s => s.id === activeSessionId);

    if (!currentSession) {
        // Auto-create session if sending a message from fresh state
        const firstUser = conversationHistory.find(m => m.role === 'user');
        const hasImages = firstUser && Array.isArray(firstUser.images) && firstUser.images.length > 0;
        const title = firstUser ? deriveTitle(firstUser.content, hasImages) : 'New Conversation';
        currentSession = {
            id: activeSessionId || ('chat-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7)),
            title: title,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: [...conversationHistory]
        };
        activeSessionId = currentSession.id;
        try { localStorage.setItem(STORAGE_KEYS.activeSession, activeSessionId); } catch (_) {}
        sessions.unshift(currentSession);

        if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
            try {
                const basePath = getCleanChatBasePath();
                const newUrl = `${basePath}?chat=${encodeURIComponent(activeSessionId)}`;
                window.history.replaceState({ sessionId: activeSessionId }, '', newUrl);
            } catch (_) {}
        }
    } else {
        currentSession.messages = [...conversationHistory];
        currentSession.updatedAt = Date.now();
        try { localStorage.setItem(STORAGE_KEYS.activeSession, currentSession.id); } catch (_) {}
        // Update title if it was default
        if (currentSession.title === 'New Conversation') {
            const firstUser = conversationHistory.find(m => m.role === 'user');
            const hasImages = firstUser && Array.isArray(firstUser.images) && firstUser.images.length > 0;
            if (firstUser) currentSession.title = deriveTitle(firstUser.content, hasImages);
        }
    }

    saveChatSessions(sessions);
    notifySessionChange();
}

function notifySessionChange() {
    sessionChangeListeners.forEach(listener => {
        try { listener(); } catch (e) { console.error(e); }
    });
    if (typeof notifyContextUsageChange === 'function') {
        notifyContextUsageChange();
    }
}

function onSessionChange(callback) {
    if (typeof callback === 'function') {
        sessionChangeListeners.push(callback);
    }
}

/* ==================== INITIALIZE ACTIVE SESSION ==================== */
function initializeActiveSession() {
    try {
        localStorage.removeItem(STORAGE_KEYS.legacyHistory);
    } catch (_) {}

    // 1. Explicit ?chat=<id> parameter in URL takes highest priority
    const requestedChatId = getChatIdFromUrl();
    if (requestedChatId) {
        const sessions = getChatSessions();
        const matched = sessions.find(s => s.id === requestedChatId);
        if (matched) {
            activeSessionId = matched.id;
            conversationHistory = [...(matched.messages || [])];
            try { localStorage.setItem(STORAGE_KEYS.activeSession, activeSessionId); } catch (_) {}
            return;
        } else {
            // Clean up invalid chat parameter from URL
            if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
                try {
                    window.history.replaceState(null, '', getCleanChatBasePath());
                } catch (_) {}
            }
        }
    }

    // 2. Explicit ?new=1 or ?new=true query signals starting a fresh new chat
    if (typeof window !== 'undefined' && window.location && window.location.search) {
        const params = new URLSearchParams(window.location.search);
        if (params.get('new') === '1' || params.get('new') === 'true') {
            activeSessionId = null;
            conversationHistory = [];
            try { localStorage.removeItem(STORAGE_KEYS.activeSession); } catch (_) {}
            if (window.history && window.history.replaceState) {
                try {
                    window.history.replaceState(null, '', getCleanChatBasePath());
                } catch (_) {}
            }
            return;
        }
    }

    // 3. User returned to / from another page (e.g. Memory, Settings, Profile):
    // Resume their ongoing active session if one exists!
    try {
        const storedActiveId = localStorage.getItem(STORAGE_KEYS.activeSession);
        if (storedActiveId) {
            const sessions = getChatSessions();
            const matched = sessions.find(s => s.id === storedActiveId);
            if (matched) {
                activeSessionId = matched.id;
                conversationHistory = [...(matched.messages || [])];
                if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
                    try {
                        const newUrl = `${getCleanChatBasePath()}?chat=${encodeURIComponent(matched.id)}`;
                        window.history.replaceState({ sessionId: matched.id }, '', newUrl);
                    } catch (_) {}
                }
                return;
            } else {
                localStorage.removeItem(STORAGE_KEYS.activeSession);
            }
        }
    } catch (_) {}

    // 4. Default if no previous active session: start in clean new chat
    activeSessionId = null;
    conversationHistory = [];
}

initializeActiveSession();

if (typeof window !== 'undefined') {
    window.addEventListener('popstate', () => {
        const requestedChatId = getChatIdFromUrl();

        if (requestedChatId) {
            const sessions = getChatSessions();
            const matched = sessions.find(s => s.id === requestedChatId);
            if (matched) {
                activeSessionId = matched.id;
                conversationHistory = [...(matched.messages || [])];
                try { localStorage.setItem(STORAGE_KEYS.activeSession, activeSessionId); } catch (_) {}
            } else {
                activeSessionId = null;
                conversationHistory = [];
                try { localStorage.removeItem(STORAGE_KEYS.activeSession); } catch (_) {}
            }
        } else {
            activeSessionId = null;
            conversationHistory = [];
            try { localStorage.removeItem(STORAGE_KEYS.activeSession); } catch (_) {}
        }
        notifySessionChange();
    });
}

/* ==================== DYNAMIC MODEL DISCOVERY ==================== */

async function fetchAvailableModels() {
    const apiBase = resolveApiBase();
    try {
        const res = await fetchWithTimeout(`${apiBase}/v1/models`, {
            method: 'GET',
            cache: 'no-store'
        }, 4000);
        if (res.ok) {
            const json = await res.json();
            const rawModels = (json.data || []).map(m => m.id).filter(Boolean);
            const filtered = [];
            const seen = new Set();
            for (const id of rawModels) {
                if (/mmproj/i.test(id)) continue;
                const clean = id.replace(/\.gguf$/i, '');
                if (!seen.has(clean)) {
                    seen.add(clean);
                    filtered.push(id);
                }
            }
            if (filtered.length > 0) {
                availableModels = filtered;
                if (!currentSelectedModel || !filtered.includes(currentSelectedModel)) {
                    // Default to 2B if available, otherwise first model
                    const preferred = filtered.find(m => /2B/i.test(m)) || filtered[0];
                    currentSelectedModel = preferred;
                    localStorage.setItem(STORAGE_KEYS.selectedModel, currentSelectedModel);
                }
                return filtered;
            }
        }
    } catch (e) {
        console.warn('Failed to discover models from server:', e);
    }
    return currentSelectedModel ? [currentSelectedModel] : [];
}

function getSelectedModel() {
    return currentSelectedModel || localStorage.getItem(STORAGE_KEYS.selectedModel) || '';
}

function setSelectedModel(modelId) {
    currentSelectedModel = modelId;
    localStorage.setItem(STORAGE_KEYS.selectedModel, modelId);
    console.log('Selected model set to:', modelId);
}

function getActiveMemories(limit = 15) {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.memory);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];

        // Prioritize: 1) Explicit preferences, 2) Manual custom facts, 3) Chat saved, 4) Legacy/notes
        const preferences = parsed.filter(m => m && m.type === 'preference');
        const manual = parsed.filter(m => m && (m.type === 'manual' || (!m.type && !m.assistant)));
        const chatSaved = parsed.filter(m => m && m.type === 'chat_saved');
        const legacy = parsed.filter(m => m && m.type !== 'preference' && m.type !== 'manual' && m.type !== 'chat_saved');

        const combined = [...preferences, ...manual, ...chatSaved, ...legacy];
        const results = [];
        const seen = new Set();

        for (const item of combined) {
            const text = String(item.user || item.text || '').trim();
            if (!text) continue;
            const normalized = text.toLowerCase();
            if (!seen.has(normalized)) {
                seen.add(normalized);
                results.push(text);
            }
            if (results.length >= limit) break;
        }
        return results;
    } catch (e) {
        console.warn('Failed to retrieve active memories:', e);
        return [];
    }
}

function saveMemoryEntry(userMessage, assistantMessage = '', type = 'manual') {
    const userClean = String(userMessage || '').trim();
    if (!userClean) return null;

    try {
        const raw = localStorage.getItem(STORAGE_KEYS.memory);
        const parsed = JSON.parse(raw || '[]');
        const memory = Array.isArray(parsed) ? parsed : [];
        
        // Avoid duplicate memories (case-insensitive check)
        const exists = memory.some(m => {
            const existing = String(m.user || m.text || '').trim().toLowerCase();
            return existing === userClean.toLowerCase();
        });
        if (exists) return null;

        const entry = {
            id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            user: userClean,
            assistant: assistantMessage ? String(assistantMessage).slice(0, 300) : '',
            type: type, // 'manual', 'preference', 'chat_saved'
            createdAt: new Date().toISOString()
        };

        memory.unshift(entry);
        localStorage.setItem(STORAGE_KEYS.memory, JSON.stringify(memory.slice(0, 500)));

        try {
            window.dispatchEvent(new CustomEvent('spark_memory_updated', { detail: entry }));
        } catch (_) {}

        return entry;
    } catch (error) {
        console.warn('Failed to store memory entry:', error);
        return null;
    }
}

function extractAndSavePreferences(userPrompt) {
    const text = String(userPrompt || '').trim();
    // Only inspect short to medium user messages, avoid code, attachments, JSON
    if (!text || text.length < 5 || text.length > 500) return null;
    if (text.startsWith('```') || text.startsWith('[Attached') || text.startsWith('{') || text.startsWith('<')) return null;

    const patterns = [
        // "Remember that X", "Remember this: X", "Please remember X"
        {
            regex: /^(?:please\s+)?remember\s+(?:that\s+|this:?\s*)?(.+)$/i,
            format: (m) => m[1].trim()
        },
        // "Note that X", "Keep in mind that X"
        {
            regex: /^(?:please\s+)?(?:note\s+that|keep\s+in\s+mind\s+(?:that\s+)?)(.+)$/i,
            format: (m) => m[1].trim()
        },
        // "I prefer X", "My preference is X"
        {
            regex: /^(?:i\s+prefer|my\s+preference\s+is)\s+(.+)$/i,
            format: (m) => `User prefers: ${m[1].trim()}`
        },
        // "Always do X", "Never do X" (standing instructions)
        {
            regex: /^(always|never)\s+([^.!?\n]+[.!?]?)/i,
            format: (m) => `Rule: ${m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase()} ${m[2].trim()}`
        },
        // "My name is X", "Call me X"
        {
            regex: /^(?:my\s+name\s+is|call\s+me)\s+([A-Za-z0-9_\-\s]{2,40})$/i,
            format: (m) => `User name: ${m[1].trim()}`
        },
        // "I work as a/an X", "I am a/an X"
        {
            regex: /^(?:i\s+work\s+as\s+(?:a|an)?\s*|i\s+am\s+(?:a|an)\s+)([A-Za-z0-9_\-\s]{2,40})$/i,
            format: (m) => `User role: ${m[1].trim()}`
        },
        // "My tech stack is X", "I develop with X", "I use X"
        {
            regex: /^(?:my\s+(?:tech\s+)?stack\s+is|i\s+(?:mostly\s+)?develop\s+with|i\s+(?:primarily\s+)?use)\s+([^.!?\n]+)/i,
            format: (m) => `User tech stack: ${m[1].trim()}`
        }
    ];

    for (const p of patterns) {
        const match = text.match(p.regex);
        if (match) {
            const formattedFact = p.format(match);
            if (formattedFact && formattedFact.length >= 3) {
                const saved = saveMemoryEntry(formattedFact, '', 'preference');
                if (saved) {
                    console.log(`[Spark Memory] Extracted preference: "${formattedFact}"`);
                }
                return formattedFact;
            }
        }
    }
    return null;
}


let cachedSystemPrompt = null;
let lastPromptFetchTime = 0;

async function fetchSystemPrompt() {
    const now = Date.now();
    // Cache for 2.5 seconds so rapid messages don't refetch, but edits in system_prompt.txt apply immediately
    if (cachedSystemPrompt !== null && (now - lastPromptFetchTime < 2500)) {
        return cachedSystemPrompt;
    }
    const apiBase = resolveApiBase();
    try {
        const res = await fetchWithTimeout(`${apiBase}/system_prompt.txt?t=${now}`, {
            method: 'GET',
            cache: 'no-store'
        }, 2000);
        if (res.ok) {
            const raw = await res.text();
            if (raw && raw.trim().length > 0) {
                cachedSystemPrompt = raw.trim();
                lastPromptFetchTime = now;
                return cachedSystemPrompt;
            }
        }
    } catch (e) {
        console.warn('Could not load system_prompt.txt, using fallback:', e);
    }
    return cachedSystemPrompt || '';
}

const SETTINGS_STORAGE_KEYS = {
    contextWindow: 'spark_context_window',
    maxTokens: 'spark_max_tokens',
    historyWindowSize: 'spark_history_window_size',
    temperature: 'spark_temperature',
    enableThinking: 'spark_enable_thinking'
};

function isThinkingEnabled() {
    // Default to false so Qwen responds immediately without long thinking
    return localStorage.getItem(SETTINGS_STORAGE_KEYS.enableThinking) === 'true';
}

function setThinkingEnabled(enabled) {
    localStorage.setItem(SETTINGS_STORAGE_KEYS.enableThinking, enabled ? 'true' : 'false');
}

function getHistoryWindowSize() {
    const saved = localStorage.getItem(SETTINGS_STORAGE_KEYS.historyWindowSize);
    const parsed = parseInt(saved, 10);
    return (!isNaN(parsed) && parsed >= 2 && parsed <= 64) ? parsed : 24;
}

function getMaxTokens() {
    const saved = localStorage.getItem(SETTINGS_STORAGE_KEYS.maxTokens);
    const parsed = parseInt(saved, 10);
    return (!isNaN(parsed) && parsed >= 128 && parsed <= 8192) ? parsed : 2048;
}

function getTemperature() {
    const saved = localStorage.getItem(SETTINGS_STORAGE_KEYS.temperature);
    const parsed = parseFloat(saved);
    return (!isNaN(parsed) && parsed >= 0.0 && parsed <= 2.0) ? parsed : 0.7;
}

function getContextWindow() {
    const saved = localStorage.getItem(SETTINGS_STORAGE_KEYS.contextWindow);
    const parsed = parseInt(saved, 10);
    return (!isNaN(parsed) && parsed >= 512 && parsed <= 32768) ? parsed : 4096;
}

function estimateMessageTokens(message) {
    if (!message) return 0;
    let tokens = 0;
    if (typeof message.content === 'string') {
        const text = message.content;
        const isStructured = /[<>{}\[\]=_\/\\`~|]/.test(text) && (text.includes('<') || text.includes('{') || text.includes('|'));
        const charsPerToken = isStructured ? 2.3 : 3.6;
        tokens += Math.ceil(text.length / charsPerToken);
    } else if (Array.isArray(message.content)) {
        for (const part of message.content) {
            if (part && part.type === 'text' && part.text) {
                const text = part.text;
                const isStructured = /[<>{}\[\]=_\/\\`~|]/.test(text) && (text.includes('<') || text.includes('{') || text.includes('|'));
                const charsPerToken = isStructured ? 2.3 : 3.6;
                tokens += Math.ceil(text.length / charsPerToken);
            } else if (part && part.type === 'image_url') {
                tokens += 420; // 640px image uses ~413 tokens in Qwen2-VL / Qwen3.5
            }
        }
    }
    if (Array.isArray(message.images) && message.images.length > 0) {
        tokens += message.images.length * 420;
    }
    tokens += 4; // Turn framing overhead
    return tokens;
}

function getContextUsage() {
    const maxTokens = getContextWindow();
    let usedTokens = 0;

    // 1. System prompt overhead
    const sysPrompt = cachedSystemPrompt || "You are Spark, an intelligent, helpful, and concise local AI assistant powered by Qwen 3.5.\nYou are running 100% offline and privately on the user's machine.";
    usedTokens += Math.ceil(sysPrompt.length / 3.8);

    // 2. Active memories overhead
    const memories = getActiveMemories(15);
    if (Array.isArray(memories)) {
        for (const mem of memories) {
            usedTokens += Math.ceil(String(mem).length / 3.8) + 2;
        }
    }

    // 3. Active conversation history turns
    const maxHistory = getHistoryWindowSize();
    const effectiveHistory = conversationHistory.length <= maxHistory
        ? conversationHistory
        : conversationHistory.slice(-maxHistory);

    for (const msg of effectiveHistory) {
        usedTokens += estimateMessageTokens(msg);
    }

    const percentage = Math.min(100, Math.round((usedTokens / maxTokens) * 100));
    let status = 'healthy';
    if (percentage >= 90) {
        status = 'danger';
    } else if (percentage >= 75) {
        status = 'warning';
    }

    return {
        usedTokens: Math.max(usedTokens, 0),
        maxTokens: maxTokens,
        freeTokens: Math.max(maxTokens - usedTokens, 0),
        percentage: percentage,
        status: status,
        totalTurns: effectiveHistory.length,
        maxHistoryTurns: maxHistory
    };
}

function notifyContextUsageChange() {
    if (typeof window !== 'undefined') {
        const usage = getContextUsage();
        window.dispatchEvent(new CustomEvent('spark_context_usage_updated', { detail: usage }));
    }
}

function downscaleBase64Image(dataUrl, maxDim = 640) {
    return new Promise((resolve) => {
        if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
            return resolve(dataUrl);
        }
        if (typeof Image === 'undefined' || typeof document === 'undefined') {
            return resolve(dataUrl);
        }
        const img = new Image();
        img.onload = () => {
            if (img.width <= maxDim && img.height <= maxDim) {
                return resolve(dataUrl);
            }
            let width = img.width;
            let height = img.height;
            if (width > height) {
                height = Math.round((height * maxDim) / width);
                width = maxDim;
            } else {
                width = Math.round((width * maxDim) / height);
                height = maxDim;
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.82));
        };
        img.onerror = () => resolve(dataUrl);
        img.src = dataUrl;
    });
}

async function buildRequestMessages(history) {
    if (!Array.isArray(history)) return [];
    
    // 1. Determine context token capacity & generation reservation
    const maxContextTokens = getContextWindow(); // e.g. 4096 or 8192
    const outputReserve = Math.min(1024, getMaxTokens());
    // Safe prompt budget leaving room for generation output
    const promptBudget = Math.max(1024, maxContextTokens - outputReserve);

    // 2. Inject live system prompt from system_prompt.txt
    let systemPrompt = await fetchSystemPrompt();
    if (!systemPrompt) {
        systemPrompt = "You are Spark, an intelligent, helpful, and concise local AI assistant powered by Qwen 3.5.\nYou are running 100% offline and privately on the user's machine.";
    }

    if (isThinkingEnabled()) {
        systemPrompt += "\n\n[Instruction: Deep Thinking Mode ENABLED]\nYou should think step-by-step and provide detailed reasoning inside <think>...</think> tags before providing your final answer.";
    } else {
        systemPrompt += "\n\n[Instruction: Fast Response Mode - Thinking DISABLED]\nDo NOT use <think> tags, internal monologue, or chain-of-thought reasoning. Answer directly, concisely, and immediately with the final response only.";
    }

    const activeMemories = getActiveMemories(10);
    if (activeMemories.length > 0) {
        systemPrompt += "\n\n[User Memories & Preferences]:\n" +
            "The following facts, preferences, and details have been remembered about the user. Use them naturally when relevant:\n" +
            activeMemories.map(m => `• ${m}`).join("\n");
    }

    const systemMessage = {
        role: "system",
        content: systemPrompt
    };

    const sysTokens = estimateMessageTokens(systemMessage);
    let remainingBudget = Math.max(512, promptBudget - sysTokens);

    // 3. Format turns from history
    const maxHistory = getHistoryWindowSize();
    const recentHistory = history.length <= maxHistory
        ? [...history]
        : history.slice(-maxHistory);

    let lastImageUserIdx = -1;
    for (let i = recentHistory.length - 1; i >= 0; i--) {
        const item = recentHistory[i];
        if (item && item.role === 'user' && Array.isArray(item.images) && item.images.length > 0) {
            lastImageUserIdx = i;
            break;
        }
    }

    const allFormattedTurns = [];
    for (let i = 0; i < recentHistory.length; i++) {
        const msg = recentHistory[i];
        if (!msg || typeof msg !== 'object') continue;

        if (msg.role === 'assistant') {
            let cleanAssistant = String(msg.content || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
            if (!cleanAssistant) {
                cleanAssistant = String(msg.content || '').replace(/<\/?think>/gi, '').trim() || 'I understand.';
            }
            allFormattedTurns.push({
                role: "assistant",
                content: cleanAssistant
            });
        } else if (msg.role === 'user') {
            const hasImages = Array.isArray(msg.images) && msg.images.length > 0;
            const textContent = String(msg.content || '').trim();

            if (hasImages) {
                if (i === lastImageUserIdx) {
                    const parts = [];
                    if (textContent) {
                        parts.push({ type: "text", text: textContent });
                    } else {
                        parts.push({ type: "text", text: "Please describe or analyze this image." });
                    }
                    for (const imgUrl of msg.images) {
                        const safeUrl = await downscaleBase64Image(imgUrl, 640);
                        parts.push({
                            type: "image_url",
                            image_url: {
                                url: safeUrl
                            }
                        });
                    }
                    allFormattedTurns.push({
                        role: "user",
                        content: parts
                    });
                } else {
                    const fallbackText = textContent 
                        ? `[User previously attached an image with question]: ${textContent}`
                        : `[User previously attached an image in this conversation]`;
                    allFormattedTurns.push({
                        role: "user",
                        content: fallbackText
                    });
                }
            } else {
                allFormattedTurns.push({
                    role: "user",
                    content: textContent || ''
                });
            }
        }
    }

    if (allFormattedTurns.length === 0) {
        return [systemMessage];
    }

    // 4. Sliding Context Window: Walk backwards from latest turn to oldest
    // The latest turn MUST always be included
    const selectedTurns = [];
    const latestTurn = allFormattedTurns[allFormattedTurns.length - 1];
    let latestTokens = estimateMessageTokens(latestTurn);

    // If the latest turn alone exceeds the remaining budget, truncate text safely
    if (latestTokens > remainingBudget) {
        if (typeof latestTurn.content === 'string') {
            const isStructured = /[<>{}\[\]=_\/\\`~|]/.test(latestTurn.content);
            const charsPerTok = isStructured ? 2.3 : 3.5;
            const maxChars = Math.max(300, Math.floor((remainingBudget - 120) * charsPerTok));
            latestTurn.content = latestTurn.content.slice(0, maxChars) + "\n\n... [Content truncated to fit within model context capacity] ...";
            latestTokens = estimateMessageTokens(latestTurn);
        }
    }

    selectedTurns.unshift(latestTurn);
    remainingBudget -= latestTokens;

    // Prepend older turns as long as they fit in the remaining budget
    for (let i = allFormattedTurns.length - 2; i >= 0; i--) {
        const turn = allFormattedTurns[i];
        const tokens = estimateMessageTokens(turn);
        if (tokens <= remainingBudget) {
            selectedTurns.unshift(turn);
            remainingBudget -= tokens;
        } else {
            // Context limit reached; older turns naturally roll off
            console.log(`[Spark Context] Pruning older turn ${i} (${tokens} tokens) to remain within context budget (${remainingBudget} tokens left).`);
            break;
        }
    }

    const requestMessages = [systemMessage, ...selectedTurns];

    // 5. Append assistant prefill if thinking disabled
    if (!isThinkingEnabled()) {
        requestMessages.push({
            role: "assistant",
            content: "</think>"
        });
    }

    return requestMessages;
}

/**
 * Main function to fetch and stream response from the API
 * Directly uses the selected raw model name from models/
 */
async function fetchAndStreamResponse(userMessage, signal, uiUpdateCallback, attachedImages = [], options = {}) {
    const isRegen = options && options.isRegeneration === true;
    const normalizedMessage = String(userMessage || '').trim();
    const hasImages = Array.isArray(attachedImages) && attachedImages.length > 0;

    if (!isRegen) {
        if (!normalizedMessage && !hasImages) {
            uiUpdateCallback('[System Error]: Empty message cannot be sent.', true, false);
            return;
        }
        conversationHistory.push({
            role: "user",
            content: normalizedMessage,
            images: hasImages ? [...attachedImages] : []
        });
        saveActiveSessionMessages();
    }

    const apiBase = resolveApiBase();
    let aiContent = "";
    let aiReasoning = "";
    const startTime = performance.now();
    let firstTokenTime = null;
    let tokenCount = 0;

    const messages = await buildRequestMessages(conversationHistory);

    const requestBody = {
        messages: messages,
        stream: true,
        temperature: getTemperature(),
        max_tokens: getMaxTokens(),
        n_predict: getMaxTokens()
    };

    if (!isThinkingEnabled()) {
        // Stop reasoning budget in inference backend
        requestBody.reasoning_budget = 0;
        requestBody.chat_template_kwargs = { reasoning: false };
    }

    const targetModel = getSelectedModel();
    if (targetModel) {
        requestBody.model = targetModel;
    }

    try {
        const response = await fetch(`${apiBase}/v1/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream'
            },
            body: JSON.stringify(requestBody),
            signal: signal
        });

        if (!response.ok) {
            let serverMessage = `Server error: ${response.status}`;
            try {
                const errorData = await response.json();
                serverMessage = errorData.error?.message || errorData.error || serverMessage;
            } catch (_) {
                const fallbackText = await response.text();
                if (fallbackText) serverMessage = fallbackText;
            }
            if (/exceeds the available context size/i.test(serverMessage)) {
                serverMessage = `[Context Limit Exceeded]: The prompt and active conversation exceeded the model's context capacity. Older messages have been rolled off; if this file is extremely large, please attach a smaller excerpt or increase Context Window in Settings.`;
            }
            throw new Error(serverMessage);
        }

        if (!response.body) {
            throw new Error('Readable stream not available in response.');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = "";
        let hasStrippedPrefill = false;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || "";

            for (const line of lines) {
                const trimmedLine = line.trim();
                if (!trimmedLine || trimmedLine === 'data: [DONE]') continue;

                if (trimmedLine.startsWith('data:')) {
                    try {
                        const jsonStr = trimmedLine.replace(/^data:\s*/, '');
                        const data = JSON.parse(jsonStr);

                        if (data.choices && data.choices[0] && data.choices[0].delta) {
                            const delta = data.choices[0].delta;

                            // Handle Qwen 3.5 reasoning tokens ONLY when deep thinking is enabled
                            if (delta.reasoning_content && isThinkingEnabled()) {
                                if (!firstTokenTime) firstTokenTime = performance.now();
                                tokenCount += 1;
                                aiReasoning += delta.reasoning_content;
                                uiUpdateCallback(delta.reasoning_content, false, true);
                            }

                            // Handle standard message content
                            if (delta.content) {
                                let chunk = delta.content;
                                if (!hasStrippedPrefill && !isThinkingEnabled()) {
                                    chunk = chunk.replace(/^<\/think>\s*/i, '');
                                    if (chunk.length > 0 || aiContent.length > 0) {
                                        hasStrippedPrefill = true;
                                    }
                                }
                                if (chunk) {
                                    if (!firstTokenTime) firstTokenTime = performance.now();
                                    tokenCount += 1;
                                    aiContent += chunk;
                                    uiUpdateCallback(chunk, false, false);
                                }
                            }
                        }
                    } catch (e) {
                        console.warn('Failed to parse SSE chunk:', trimmedLine, e);
                    }
                }
            }
        }

        // Clean any leading/trailing prefill traces from stored content
        aiContent = aiContent.replace(/^<\/think>\s*/i, '').trim();

        // Combine reasoning and content for conversation history
        let fullRecord = aiContent;
        if (isThinkingEnabled() && aiReasoning.trim()) {
            fullRecord = `<think>${aiReasoning.trim()}</think>\n\n` + fullRecord;
        } else if (!fullRecord && aiReasoning.trim()) {
            fullRecord = aiReasoning.trim();
        }

        const totalSec = (performance.now() - startTime) / 1000;
        const ttftSec = firstTokenTime ? ((firstTokenTime - startTime) / 1000).toFixed(2) : '0.00';
        const tokPerSec = totalSec > 0 ? (tokenCount / totalSec).toFixed(1) : '0.0';
        const perfStats = {
            ttft: ttftSec,
            tokPerSec: tokPerSec,
            totalTokens: tokenCount,
            totalSec: totalSec.toFixed(1)
        };

        conversationHistory.push({ role: "assistant", content: fullRecord });
        saveActiveSessionMessages();
        // Mem0 Intelligent Memory: Only extract explicit user preferences/facts, NEVER routine dialogue
        extractAndSavePreferences(normalizedMessage);
        uiUpdateCallback("", true, false, perfStats);

    } catch (error) {
        if (error.name === 'AbortError') {
            console.log("Generation stopped by user.");
            if (aiContent || aiReasoning) {
                let partial = aiContent ? aiContent.trim() : '';
                if (!partial && aiReasoning.trim()) {
                    partial = aiReasoning.trim();
                } else if (aiReasoning.trim()) {
                    partial = `<think>${aiReasoning.trim()}</think>\n\n` + partial;
                }
                conversationHistory.push({ role: "assistant", content: partial });
                saveActiveSessionMessages();
            }
            uiUpdateCallback("", true, false);
        } else {
            console.error("Fetch Error:", error);
            uiUpdateCallback(`[System Error]: Unable to connect to local AI server at ${apiBase}.\n\nEnsure start.bat or python server.py is running.`, true, false);
        }
    }
}

// Robust Server Health Check
async function checkServerHealth() {
    try {
        const apiBase = resolveApiBase();
        const res = await fetchWithTimeout(`${apiBase}/health`, {
            method: 'GET',
            cache: 'no-store'
        }, 3000);
        return res.ok || res.status === 503;
    } catch {
        return false;
    }
}

// Global exports
window.fetchAndStreamResponse = fetchAndStreamResponse;
window.getConversationHistory = function () { return conversationHistory; };
window.getApiBase = resolveApiBase;
window.checkServerHealth = checkServerHealth;
window.clearConversationHistory = function () {
    conversationHistory = [];
    saveActiveSessionMessages();
};
window.removeTurnAtIndex = function (index) {
    if (index >= 0 && index < conversationHistory.length) {
        const isUser = conversationHistory[index]?.role === 'user';
        if (isUser && conversationHistory[index + 1]?.role === 'assistant') {
            conversationHistory.splice(index, 2);
        } else {
            conversationHistory.splice(index, 1);
        }
        saveActiveSessionMessages();
    }
};
window.popLastAssistantTurn = function () {
    if (conversationHistory.length > 0 && conversationHistory[conversationHistory.length - 1].role === 'assistant') {
        const popped = conversationHistory.pop();
        saveActiveSessionMessages();
        return popped;
    }
    return null;
};
window.truncateHistoryAt = function (index) {
    if (index >= 0 && index <= conversationHistory.length) {
        conversationHistory = conversationHistory.slice(0, index);
        saveActiveSessionMessages();
        return true;
    }
    return false;
};

// Multi-session exports
window.getChatSessions = getChatSessions;
window.getActiveSessionId = function () { return activeSessionId; };
window.setActiveSessionId = setActiveSessionId;
window.createNewSession = createNewSession;
window.deleteChatSession = deleteChatSession;
window.clearAllChatSessions = clearAllChatSessions;
window.onSessionChange = onSessionChange;

// Dynamic raw model exports
window.fetchAvailableModels = fetchAvailableModels;
window.getSelectedModel = getSelectedModel;
window.setSelectedModel = setSelectedModel;
window.fetchSystemPrompt = fetchSystemPrompt;
window.getTemperature = getTemperature;
window.getMaxTokens = getMaxTokens;
window.getHistoryWindowSize = getHistoryWindowSize;
window.getContextWindow = getContextWindow;
window.getContextUsage = getContextUsage;
window.estimateMessageTokens = estimateMessageTokens;
window.notifyContextUsageChange = notifyContextUsageChange;
window.isThinkingEnabled = isThinkingEnabled;
window.setThinkingEnabled = setThinkingEnabled;

// Memory exports
window.getActiveMemories = getActiveMemories;
window.saveMemoryEntry = saveMemoryEntry;
window.extractAndSavePreferences = extractAndSavePreferences;

})();
