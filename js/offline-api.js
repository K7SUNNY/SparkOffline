/**
 * SparkV2 Offline API Client
 * Handles streaming communication with the local Qwen model engine
 */

let conversationHistory = [];
let currentModel = localStorage.getItem('spark_default_model') || 'pro';

// Model configuration optimized for Qwen3.5-2B
const modelConfigs = {
    'pro': { temperature: 0.7, max_tokens: 2048, name: 'Qwen 3.5 Pro' },
    'fast': { temperature: 0.5, max_tokens: 1024, name: 'Qwen 3.5 Fast' },
    'coding': { temperature: 0.2, max_tokens: 2048, name: 'Qwen 3.5 Coding' }
};
const MAX_CONTEXT_MESSAGES = 16;

function resolveApiBase() {
    const explicit = window.SPARK_API_BASE || localStorage.getItem('spark_api_base');
    if (explicit) return String(explicit).replace(/\/+$/, '');

    // If currently hosted on port 5000 or similar, use same origin
    if (window.location.port === '5000' || window.location.port === '8080') {
        return window.location.origin;
    }
    return 'http://127.0.0.1:5000';
}

function loadConversationHistory() {
    try {
        const raw = localStorage.getItem('spark_chat_history');
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];

        return parsed.filter((message) => {
            return (
                message &&
                typeof message === 'object' &&
                typeof message.role === 'string' &&
                typeof message.content === 'string'
            );
        });
    } catch (error) {
        console.warn('Failed to load chat history from storage:', error);
        return [];
    }
}

let saveTimeout = null;
function saveConversationHistory() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        try {
            localStorage.setItem('spark_chat_history', JSON.stringify(conversationHistory));
        } catch (error) {
            console.warn('Failed to save chat history:', error);
        }
    }, 100);
}

function saveMemoryEntry(userMessage, assistantMessage) {
    try {
        const raw = localStorage.getItem('spark_memory');
        const parsed = JSON.parse(raw || '[]');
        const memory = Array.isArray(parsed) ? parsed : [];
        memory.unshift({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            user: userMessage,
            assistant: assistantMessage || '',
            createdAt: new Date().toISOString()
        });
        localStorage.setItem('spark_memory', JSON.stringify(memory.slice(0, 500)));
    } catch (error) {
        console.warn('Failed to store memory entry:', error);
    }
}

function buildRequestMessages(history) {
    if (!Array.isArray(history)) return [];
    if (history.length <= MAX_CONTEXT_MESSAGES) return history;
    return history.slice(-MAX_CONTEXT_MESSAGES);
}

conversationHistory = loadConversationHistory();

window.updateModel = function (modelKey) {
    if (!modelConfigs[modelKey]) {
        console.warn(`Unknown model "${modelKey}". Falling back to "pro".`);
        currentModel = 'pro';
        return;
    }
    currentModel = modelKey;
    localStorage.setItem('spark_default_model', modelKey);
    console.log('Model updated to:', modelKey);
};

/**
 * Main function to fetch and stream response from the API
 * Supports both normal content and Qwen 3.5 reasoning_content tokens
 */
async function fetchAndStreamResponse(userMessage, signal, uiUpdateCallback) {
    const normalizedMessage = String(userMessage || '').trim();
    if (!normalizedMessage) {
        uiUpdateCallback('[System Error]: Empty message cannot be sent.', true, false);
        return;
    }
    conversationHistory.push({ role: "user", content: normalizedMessage });
    saveConversationHistory();

    const config = modelConfigs[currentModel] || modelConfigs['pro'];
    const apiBase = resolveApiBase();
    let aiContent = "";
    let aiReasoning = "";

    try {
        const response = await fetch(`${apiBase}/v1/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream'
            },
            body: JSON.stringify({
                messages: buildRequestMessages(conversationHistory),
                stream: true,
                temperature: config.temperature,
                max_tokens: config.max_tokens
            }),
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
        saveConversationHistory();
        saveMemoryEntry(normalizedMessage, fullRecord);
        uiUpdateCallback("", true, false);

    } catch (error) {
        if (error.name === 'AbortError') {
            console.log("Generation stopped by user.");
            if (aiContent || aiReasoning) {
                let partial = aiContent;
                if (aiReasoning) partial = `<think>${aiReasoning}</think>\n\n` + aiContent;
                conversationHistory.push({ role: "assistant", content: partial });
                saveConversationHistory();
            }
            uiUpdateCallback("", true, false);
        } else {
            console.error("Fetch Error:", error);
            uiUpdateCallback(`[System Error]: Unable to connect to local AI server at ${apiBase}.\n\nEnsure start.bat or python server.py is running.`, true, false);
        }
    }
}

// Server health check helper
async function checkServerHealth() {
    try {
        const apiBase = resolveApiBase();
        const res = await fetch(`${apiBase}/health`, { signal: AbortSignal.timeout(2000) });
        return res.ok;
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
    if (saveTimeout) clearTimeout(saveTimeout);
    conversationHistory = [];
    localStorage.setItem('spark_chat_history', '[]');
    console.log('Conversation history cleared');
};
