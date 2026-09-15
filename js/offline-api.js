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
let activeSessionId = localStorage.getItem(STORAGE_KEYS.activeSession) || null;
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
                localStorage.setItem(STORAGE_KEYS.activeSession, initialSession.id);
                activeSessionId = initialSession.id;
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

function getActiveSession() {
    const sessions = getChatSessions();
    if (!activeSessionId) return null;
    return sessions.find(s => s.id === activeSessionId) || null;
}

function setActiveSessionId(sessionId) {
    activeSessionId = sessionId;
    if (sessionId) {
        localStorage.setItem(STORAGE_KEYS.activeSession, sessionId);
        const session = getActiveSession();
        conversationHistory = session ? [...(session.messages || [])] : [];
    } else {
        localStorage.removeItem(STORAGE_KEYS.activeSession);
        conversationHistory = [];
    }
    // Maintain legacy sync
    try {
        localStorage.setItem(STORAGE_KEYS.legacyHistory, JSON.stringify(conversationHistory));
    } catch (_) {}

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
        if (sessions.length > 0) {
            setActiveSessionId(sessions[0].id);
        } else {
            setActiveSessionId(null);
        }
    } else {
        notifySessionChange();
    }
}

function clearAllChatSessions() {
    localStorage.removeItem(STORAGE_KEYS.sessions);
    localStorage.removeItem(STORAGE_KEYS.activeSession);
    localStorage.setItem(STORAGE_KEYS.legacyHistory, '[]');
    activeSessionId = null;
    conversationHistory = [];
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
        localStorage.setItem(STORAGE_KEYS.activeSession, activeSessionId);
        sessions.unshift(currentSession);
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
    try {
        localStorage.setItem(STORAGE_KEYS.legacyHistory, JSON.stringify(conversationHistory));
    } catch (_) {}

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
const initialActive = getActiveSession();
if (initialActive) {
    conversationHistory = [...(initialActive.messages || [])];
} else {
    const existing = getChatSessions();
    if (existing.length > 0) {
        activeSessionId = existing[0].id;
        localStorage.setItem(STORAGE_KEYS.activeSession, activeSessionId);
        conversationHistory = [...(existing[0].messages || [])];
    } else {
        conversationHistory = [];
    }
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

function buildRequestMessages(history) {
    if (!Array.isArray(history)) return [];
    if (history.length <= MAX_CONTEXT_MESSAGES) return history;
    return history.slice(-MAX_CONTEXT_MESSAGES);
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

    const requestBody = {
        messages: buildRequestMessages(conversationHistory),
        stream: true,
        temperature: 0.7,
        max_tokens: 2048
    };

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

})();
