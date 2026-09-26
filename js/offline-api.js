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

function deriveTitle(text) {
    if (!text) return 'New Conversation';
    let clean = String(text)
        .replace(/[\r\n]+/g, ' ')
        .replace(/[#*_`~]/g, '')
        .trim();
    if (clean.length > 36) {
        clean = clean.substring(0, 36).trim() + '...';
    }
    return clean || 'New Conversation';
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
    try {
        localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(sessions));
    } catch (e) {
        console.warn('Failed to save chat sessions:', e);
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
        const session = getActiveSession();
        conversationHistory = session ? [...(session.messages || [])] : [];
    } else {
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
        const title = firstUser ? deriveTitle(firstUser.content) : 'New Conversation';
        currentSession = {
            id: activeSessionId || ('chat-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7)),
            title: title,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: [...conversationHistory]
        };
        activeSessionId = currentSession.id;
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
        // Update title if it was default
        if (currentSession.title === 'New Conversation') {
            const firstUser = conversationHistory.find(m => m.role === 'user');
            if (firstUser) currentSession.title = deriveTitle(firstUser.content);
        }
    }

    saveChatSessions(sessions);
    notifySessionChange();
}

function notifySessionChange() {
    sessionChangeListeners.forEach(listener => {
        try { listener(); } catch (e) { console.error(e); }
    });
}

function onSessionChange(callback) {
    if (typeof callback === 'function') {
        sessionChangeListeners.push(callback);
    }
}

/* ==================== INITIALIZE ACTIVE SESSION ==================== */
function initializeActiveSession() {
    // Purge any legacy session or history keys so they can never force-restore an old conversation
    try {
        localStorage.removeItem(STORAGE_KEYS.activeSession);
        localStorage.removeItem(STORAGE_KEYS.legacyHistory);
    } catch (_) {}

    const requestedChatId = getChatIdFromUrl();

    if (requestedChatId) {
        const sessions = getChatSessions();
        const matched = sessions.find(s => s.id === requestedChatId);
        if (matched) {
            activeSessionId = matched.id;
            conversationHistory = [...(matched.messages || [])];
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

    // Default on startup / fresh open: ALWAYS start in a new chat window!
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
            } else {
                activeSessionId = null;
                conversationHistory = [];
            }
        } else {
            activeSessionId = null;
            conversationHistory = [];
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
            const models = (json.data || []).map(m => m.id).filter(Boolean);
            if (models.length > 0) {
                availableModels = models;
                if (!currentSelectedModel || !models.includes(currentSelectedModel)) {
                    // Default to 2B if available, otherwise first model
                    const preferred = models.find(m => /2B/i.test(m)) || models[0];
                    currentSelectedModel = preferred;
                    localStorage.setItem(STORAGE_KEYS.selectedModel, currentSelectedModel);
                }
                return models;
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

function saveMemoryEntry(userMessage, assistantMessage) {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.memory);
        const parsed = JSON.parse(raw || '[]');
        const memory = Array.isArray(parsed) ? parsed : [];
        memory.unshift({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            user: userMessage,
            assistant: assistantMessage || '',
            createdAt: new Date().toISOString()
        });
        localStorage.setItem(STORAGE_KEYS.memory, JSON.stringify(memory.slice(0, 500)));
    } catch (error) {
        console.warn('Failed to store memory entry:', error);
    }
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
    return (!isNaN(parsed) && parsed >= 2 && parsed <= 64) ? parsed : 16;
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
    return (!isNaN(parsed) && parsed >= 512 && parsed <= 32768) ? parsed : 2048;
}

async function buildRequestMessages(history) {
    if (!Array.isArray(history)) return [];
    
    // Prune history using configurable history window size
    const maxHistory = getHistoryWindowSize();
    const recentHistory = history.length <= maxHistory
        ? [...history]
        : history.slice(-maxHistory);

    const requestMessages = [];

    // 1. Inject live system prompt from system_prompt.txt
    let systemPrompt = await fetchSystemPrompt();
    if (!systemPrompt) {
        systemPrompt = "You are Spark, an intelligent, helpful, and concise local AI assistant powered by Qwen 3.5.\nYou are running 100% offline and privately on the user's machine.";
    }

    // 2. Dynamically attach the thinking instruction controlled by the Thinking: Off/On button
    if (isThinkingEnabled()) {
        systemPrompt += "\n\n[Instruction: Deep Thinking Mode ENABLED]\nYou should think step-by-step and provide detailed reasoning inside <think>...</think> tags before providing your final answer.";
    } else {
        systemPrompt += "\n\n[Instruction: Fast Response Mode - Thinking DISABLED]\nDo NOT use <think> tags, internal monologue, or chain-of-thought reasoning. Answer directly, concisely, and immediately with the final response only.";
    }

    requestMessages.push({
        role: "system",
        content: systemPrompt
    });

    // 2. Add user & assistant chat messages
    requestMessages.push(...recentHistory);

    return requestMessages;
}

/**
 * Main function to fetch and stream response from the API
 * Directly uses the selected raw model name from models/
 */
async function fetchAndStreamResponse(userMessage, signal, uiUpdateCallback) {
    const normalizedMessage = String(userMessage || '').trim();
    if (!normalizedMessage) {
        uiUpdateCallback('[System Error]: Empty message cannot be sent.', true, false);
        return;
    }
    conversationHistory.push({ role: "user", content: normalizedMessage });
    saveActiveSessionMessages();

    const apiBase = resolveApiBase();
    let aiContent = "";
    let aiReasoning = "";

    const messages = await buildRequestMessages(conversationHistory);

    const requestBody = {
        messages: messages,
        stream: true,
        temperature: getTemperature(),
        max_tokens: getMaxTokens(),
        n_predict: getMaxTokens()
    };

    if (!isThinkingEnabled()) {
        // Hard-stop Qwen internal chain-of-thought to reply immediately without delay
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
            throw new Error(serverMessage);
        }

        if (!response.body) {
            throw new Error('Readable stream not available in response.');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = "";

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

                            // Handle Qwen 3.5 reasoning tokens
                            if (delta.reasoning_content) {
                                aiReasoning += delta.reasoning_content;
                                uiUpdateCallback(delta.reasoning_content, false, true);
                            }

                            // Handle standard message content
                            if (delta.content) {
                                aiContent += delta.content;
                                uiUpdateCallback(delta.content, false, false);
                            }
                        }
                    } catch (e) {
                        console.warn('Failed to parse SSE chunk:', trimmedLine, e);
                    }
                }
            }
        }

        // Combine reasoning and content for conversation history
        let fullRecord = aiContent;
        if (aiReasoning) {
            fullRecord = `<think>${aiReasoning}</think>\n\n` + aiContent;
        }

        conversationHistory.push({ role: "assistant", content: fullRecord });
        saveActiveSessionMessages();
        saveMemoryEntry(normalizedMessage, fullRecord);
        uiUpdateCallback("", true, false);

    } catch (error) {
        if (error.name === 'AbortError') {
            console.log("Generation stopped by user.");
            if (aiContent || aiReasoning) {
                let partial = aiContent;
                if (aiReasoning) partial = `<think>${aiReasoning}</think>\n\n` + aiContent;
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
window.isThinkingEnabled = isThinkingEnabled;
window.setThinkingEnabled = setThinkingEnabled;

})();
