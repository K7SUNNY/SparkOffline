# SparkV2 Debug & Performance Report

This document outlines all identified issues, errors, and optimization opportunities found during the debugging process of the SparkV2 project.

## Verification & Audit Update (2026-03-09)

Most of the previously reported logic and accessibility issues have been resolved. The focus of this audit shifted to the **performance** and **site flow (UX)** aspects of the application. 

### Resolved Issues (from previous passes)
- **Backend request validation**: Implemented (`validate_messages` and `parse_generation_config`).
- **Endpoints**: `/v1/health` and `/v1/cleanup` are implemented.
- **Frontend API Base**: dynamic resolution is fixed (`resolveApiBase`) avoiding CORS/routing mismatches.
- **Model Config Parsing**: Handled in backend and model selector values (`temperature`, `max_tokens`) are used during inference.
- **Persistence**: Chat history, memory, and settings are correctly persisted stringified in `localStorage`.
- **XSS Mitigation**: Markdown rendering uses `escapeHtml`.
- **Broken SVGs**: `iewBox` errors fixed to `viewBox` across all files.

---

## 🚀 Performance Issues Identified

### 1. UI Thread Blocking (Typing Indicator/Streaming rendering)
**Severity:** Critical  
**File:** `js/script.js` (line ~102)  
**Issue:** The `processQueue` function rendering the streaming chunks has a `TYPING_FRAME_DELAY_MS` of `1` millisecond. Furthermore, for every single character chunk, the code re-parses the entire `currentRawText` through Markdown and replaces the full `innerHTML` of the chat bubble. This approach completely blocks the main thread for long text outputs, causing massive lag and unresponsiveness.  
**Recommendation:** 
- Instead of setting `innerHTML` character-by-character, batch chunks and only parse Markdown periodically (e.g., every 50-100ms or on word boundaries/newlines).
- Alternatively, use a DOM-diffing approach when streaming markdown updates.

### 2. High Frequency Resize Layout Thrashing
**Severity:** Medium  
**File:** `js/script.js` (line ~161)  
**Issue:** The `initSidebar` attaches a bare `window.addEventListener('resize', ...)` without any debouncing.  
**Recommendation:** Wrap the resize event handler in a throttle or debounce function to limit execution to 100ms-200ms intervals if resizing logic becomes heavier.

### 3. Synchronous Large Storage Writes
**Severity:** Medium  
**File:** `js/offline-api.js`  
**Issue:** `saveConversationHistory` synchronously serializes the entire chat history and writes it to `localStorage` every time a chunk completes or message is sent. If history grows to megabytes, this blocks UI execution.  
**Recommendation:** Implement limits on `localStorage` history retention or write the large JSON strings asynchronously / throttling the writes.

### 4. GPU/CPU Hardware Limitations (Out of Memory)
**Severity:** High (Environment-specific)  
**File:** `server.py`  
**Issue:** Loading `unsloth/llama-3.2-3b-instruct-bnb-4bit` purely with `device_map="auto"` on machines without sufficient VRAM triggers CPU disk-offloading fallback, resulting in an "Out Of Memory" or "dispatched on the CPU" crash (`Exit code: 1`).  
**Recommendation:** Detect available VRAM. Provide fallback parameter such as `llm_int8_enable_fp32_cpu_offload=True` or explicitly drop to `device_map="cpu"` if VRAM is below ~6GB to prevent total back-end crashes.

---

## 🔄 User Journey & Flow Issues

### 1. "New Chat" Action Fails to Clear Chat
**Severity:** High  
**File:** `index.html` (line 50)  
**Issue:** The "New Chat" button simply executes `window.location.reload()`. Because chat history is eagerly loaded from `localStorage` on page initialization, reloading the page just re-renders the *exact same* chat history. It is impossible to start a new chat.  
**Recommendation:** Change the "New Chat" button action to actually clear the local storage history. e.g., `onclick="window.clearConversationHistory(); window.location.reload();"` or empty the DOM without reloading.

### 2. Full Page Reloads on Tab Switches
**Severity:** High  
**Files:** `index.html`, `memory.html`, `settings.html`, `profile.html`  
**Issue:** The application uses absolute multi-page linking (`href="memory.html"`, etc.). Clicking any nav item performs a hard page fetch and navigation. This causes a jarring flash, unloads the heavy JS state, reloads marked/highlight.js from scratch, and forces re-rendering of the UI upon re-entry.  
**Recommendation:** Transition the application into a Single Page Application (SPA). Instead of 4 separate HTML files, load the contents into a single hidden/visible container. This ensures state (like AI generating in the background) isn't wiped out if the user visits the settings page.

### 3. Mobile Navigation Misalignment
**Severity:** Medium  
**File:** `index.html` (mobile view)  
**Issue:** In mobile view, clicking the "Chat" button on the `mobile-bottom-nav` causes a hard reload of `index.html` again if not handled gracefully.  
**Recommendation:** If staying as a multi-page app, add logic so that clicking the *current* page's nav item scrolls to top or does nothing instead of reloading.

### 4. Zero-State and Retry Flow For Failed API Actions
**Severity:** Medium  
**File:** `js/offline-api.js` & `js/script.js`  
**Issue:** If the backend isn't loaded or crashes, the AI message bubble simply prints `[System Error]: Is the Python server running?`. There is no visual retry button. The user is forced to copy paste their text and try typing it manually again.  
**Recommendation:** Append an intentional `Retry` DOM button element around the System Error text to re-submit the last user prompt easily.

---

## 📋 Comprehensive Better Plan for SparkV2

To elevate SparkV2 from a functional local script to a polished app, the following architecture plan is recommended:

**Phase 1: Flow & UI Stability (Immediate)**
*   Fix the **New Chat button** logic in the sidebar by attaching an event listener that calls `clearConversationHistory()`.
*   Implement simple throttling/debouncing for Markdown parsing in `script.js`. Stop replacing `.innerHTML` for every single streamed token from the local python server.
*   Implement graceful catching for `server.py` OOM crashes to print friendly setup help rather than crashing out.

**Phase 2: Single-Page Architecture Refactor**
*   Merge `memory.html`, `profile.html`, `settings.html`, and `index.html` into a single DOM.
*   This will immediately solve the "page reload flash" problem and make the UI feel instantaneous.

**Phase 3: Robust Persistence & Async**
*   Move `localStorage` calls into IndexedDB using a lightweight wrapper like localForage. This prevents large conversation array parsing from blocking the JavaScript event loop.
*   Implement `requestAnimationFrame` for handling extreme rendering loops like typing animations.

**Phase 4: Backend Upgrades**
*   Transition `server.py` to use a dedicated highly integrated LLM engine (e.g. `llama.cpp` + `vLLM` or `Ollama` via API) if performance relies heavily on `device_map` issues. `transformers` `TextIteratorStreamer` is often sub-optimal for local fast inference compared to compiled C++ local servers.
