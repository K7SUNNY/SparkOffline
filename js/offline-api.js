/**
 * SparkV2 Offline API
 * Handles communication with the local Python server
 */

// Global conversation history
let conversationHistory = [];
let currentModel = localStorage.getItem('spark_default_model') || 'pro';

// Model configuration
const modelConfigs = {
    'pro': { temperature: 0.7, max_tokens: 512 },
    'fast': { temperature: 0.5, max_tokens: 256 },
    'coding': { temperature: 0.3, max_tokens: 768 }
};
const MAX_CONTEXT_MESSAGES = 12;

function resolveApiBase() {
    const explicit = window.SPARK_API_BASE || localStorage.getItem('spark_api_base');
    if (explicit) return String(explicit).replace(/\/+$/, '');

    const isLocalBackendOrigin =
        (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost') &&
        window.location.port === '5000';

    if (isLocalBackendOrigin) return window.location.origin;
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

// Update model selection
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
 * @param {string} userMessage - The user's message
 * @param {AbortSignal} signal - Abort signal for stopping the request
 * @param {function} uiUpdateCallback - Callback to update UI with chunks
 */
async function fetchAndStreamResponse(userMessage, signal, uiUpdateCallback) {
    const normalizedMessage = String(userMessage || '').trim();
    if (!normalizedMessage) {
        uiUpdateCallback('[System Error]: Empty message cannot be sent.', true);
        return;
    }
    conversationHistory.push({ role: "user", content: normalizedMessage });
    saveConversationHistory();

    const config = modelConfigs[currentModel] || modelConfigs['pro'];
    const apiBase = resolveApiBase();
    let aiFullResponse = "";

    try {
        const response = await fetch(`${apiBase}/v1/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
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
                serverMessage = errorData.error || serverMessage;
            } catch (jsonError) {
                const fallbackText = await response.text();
                if (fallbackText) serverMessage = fallbackText;
            }
            throw new Error(serverMessage);
        }

        if (!response.body) {
            throw new Error('Readable stream not available in response.');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();

            if (done) {
                break;
            }

            buffer += decoder.decode(value, { stream: true });

            // Split by SSE data chunks
            const lines = buffer.split('\n');
            buffer = lines.pop() || "";

            for (const line of lines) {
                const trimmedLine = line.trim();

                // Skip empty lines and SSE control messages
                if (!trimmedLine || trimmedLine === 'data: [DONE]') {
                    continue;
                }

                // Parse SSE data
                if (trimmedLine.startsWith('data: ')) {
                    try {
                        const jsonStr = trimmedLine.slice(6);
                        const data = JSON.parse(jsonStr);

                        if (data.choices && data.choices[0] && data.choices[0].delta && data.choices[0].delta.content) {
                            const chunk = data.choices[0].delta.content;
                            aiFullResponse += chunk;
                            uiUpdateCallback(chunk, false);
                        }
                    } catch (e) {
                        // Skip malformed JSON
                        console.warn('Failed to parse SSE chunk:', e);
                    }
                }
            }
        }

        conversationHistory.push({ role: "assistant", content: aiFullResponse });
        saveConversationHistory();
        saveMemoryEntry(normalizedMessage, aiFullResponse);
        uiUpdateCallback("", true);

    } catch (error) {
        if (error.name === 'AbortError') {
            console.log("Generation stopped by user.");
            uiUpdateCallback("", true);
        } else {
            console.error("Fetch Error:", error);
            uiUpdateCallback(`[System Error]: Is the Python server running? ${error.message}`, true);
        }
    }
}

// Export for use in other scripts
window.fetchAndStreamResponse = fetchAndStreamResponse;
window.getConversationHistory = function () { return conversationHistory; };
window.getApiBase = resolveApiBase;
window.clearConversationHistory = function () {
    if (saveTimeout) clearTimeout(saveTimeout);
    conversationHistory = [];
    localStorage.setItem('spark_chat_history', '[]');
    console.log('Conversation history cleared');
};
