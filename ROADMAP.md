# SparkV2 Offline — Development Roadmap

> **Last analyzed:** 2026-09-15  
> **Status:** Active development — multiple critical gaps and incomplete features identified

---

## Summary

The SparkV2 Offline chatbot app has a solid front-end foundation (chat UI, markdown rendering, theme system, memory page, settings page, profile page) and a launcher script (`server.py`) that starts `llama-server.exe`. However, **the app is not functional end-to-end** — the backend API layer is missing, several core features are stubbed or non-functional, and multiple pages have UI elements with no backing logic.

---

> **Note:** `download_model.py` is deprecated — users now manually place `.gguf` files in `models/`. No download feature is required.

---

## 🔴 CRITICAL — Must Fix (App Non-Functional)

### 1. No Backend API Server (`/v1/chat/completions` and `/health` endpoints)
- **File:** `server.py`
- **Problem:** `offline-api.js` sends POST requests to `http://127.0.0.1:5000/v1/chat/completions` and health checks to `http://127.0.0.1:5000/health`. `server.py` does **not** implement either endpoint. It only launches `llama-server.exe` as a subprocess and waits for it. There is no proxy, no API translation layer, and no OpenAI-compatible endpoint.
- **Impact:** Chat completely broken — no message can ever be sent or received.
- **Fix:** Implement a Python proxy server (using Flask or stdlib `http.server`) that:
  - Accepts `/v1/chat/completions` POST requests
  - Forwards them to `llama-server.exe`'s OpenAI-compatible API (or uses `llama-cpp-python` directly)
  - Streams SSE responses back to the client
  - Serves `/health` endpoint returning `{"status": "ok"}`

### 2. `requirements.txt` Does Not Match `server.py`
- **File:** `requirements.txt`, `server.py`
- **Problem:** `requirements.txt` lists `flask`, `torch`, `transformers`, `peft`, `bitsandbytes`, `accelerate`. But `server.py` docstring says "Zero external Python dependencies required" and uses only stdlib. The CUDA_INSTALL_GUIDE.md and LORA_CONVERSION_GUIDE.md reference `llama-cpp-python` and `Llama(...)` API that don't exist in the current codebase.
- **Impact:** Confusing for developers; misleading dependency installation.
- **Fix:** Either (a) rewrite `server.py` to actually use Flask + llama-cpp-python and keep requirements.txt, or (b) update requirements.txt to reflect the stdlib-only approach and remove the CUDA/LoRA guides.

---

## 🟠 HIGH — Core Features Missing or Non-Functional

### 3. Chat History Not Displayed in Sidebar
- **File:** `index.html`, `js/script.js`
- **Problem:** The sidebar shows 3 hardcoded chat names ("Explaining Quantum Physics", "Python Script Help", "Dinner Recipes"). `offline-api.js` saves conversations to `spark_chat_history` in localStorage, but nothing reads from it to populate the sidebar.
- **Fix:** Dynamically render conversation history from localStorage in the sidebar, with click-to-load and auto-generated titles.

### 4. Settings Page — All Interactive Elements Are Dead
- **File:** `settings.html`, `js/script.js` (`initSettingsPage`)
- **Problem:** `initSettingsPage` only handles the theme dropdown and model dropdown. All other controls have no handlers:
  - "Always show code blocks" toggle — no handler
  - "System Instructions" row — no click handler or navigation
  - "Chat History" toggle — no handler (and contradicts the hardcoded `checked` attribute)
  - "Clear All Chats" button — no `onclick` handler
- **Fix:** Add event handlers for each control; wire them to actual logic or navigation targets.

### 5. Profile Page — All Buttons Non-Functional
- **File:** `profile.html`
- **Problem:** Every action button is a stub:
  - "Save Changes" — no handler
  - "Edit" (avatar) — no handler
  - "Sign Out" — no handler
  - "Delete Account" — no handler
  - All form inputs are static (no save mechanism)
- **Fix:** Implement at minimum a working profile save flow (even if just localStorage persistence). Wire up sign-out and delete with confirmation dialogs.

### 6. No Conversation Naming / Auto-Titles
- **Files:** `index.html`, `js/script.js`, `offline-api.js`
- **Problem:** The sidebar shows hardcoded chat names. When a user starts a new chat, there is no mechanism to generate a title from the first message or conversation content.
- **Fix:** Generate conversation titles from the first user message (or first ~40 chars) and save them with the history entry.

### 7. No Server Startup Error Handling
- **File:** `server.py`
- **Problem:** If `llama-server.exe` fails to start (missing binary, corrupt model, port conflict), the script silently proceeds. The browser opens to a broken page with no indication of what went wrong.
- **Fix:** Add process output monitoring, exit code checking, and user-friendly error messages before opening the browser.

---

## 🟡 MEDIUM — Incomplete Features

### 8. Model Switching — Real Model Loading from `models/` Directory
- **Files:** `index.html`, `js/script.js`, `offline-api.js`, `server.py`
- **Current State:** The model selector shows hardcoded presets ("Qwen 3.5 Pro", "Qwen 3.5 Fast", "Qwen 3.5 Coding") that only change a label and localStorage value. No actual model switching occurs.
- **Planned Direction:** Scan the `models/` directory for all available `.gguf` files, display their actual filenames as selectable options in the model dropdown, and load the selected model server-side. The model presets (Pro/Fast/Coding) will be removed entirely — users select by actual model name only.
- **Fix:** (a) Add directory scanning in `server.py` to discover available `.gguf` models, (b) expose model list via `/health` or a new endpoint, (c) update front-end model selector to dynamically load available models from `models/`, (d) pass selected model path and parameters to `llama-server.exe` on load.

### 9. No Message Copy Button
- **File:** `js/script.js`, `css/style.css`
- **Problem:** Individual chat messages (user or AI) have no copy button. Only code blocks have copy functionality.
- **Fix:** Add a copy button on each message bubble that copies the full message text.

### 10. No Message Edit or Delete
- **Files:** `index.html`, `js/script.js`
- **Problem:** Once sent, messages cannot be edited or deleted by the user.
- **Fix:** Add hover actions (edit/delete) on user messages. For AI messages, a "regenerate" button would be useful.

### 11. No Export/Backup Functionality
- **Problem:** No way to export chat history or memory entries to a file. No import capability either.
- **Fix:** Add Export (JSON/HTML) and Import buttons in Settings or Profile page.

### 12. No Keyboard Shortcuts
- **Problem:** No Ctrl+N (new chat), Ctrl+Shift+L (clear memory), or other shortcuts.
- **Fix:** Implement common keyboard shortcuts.

---

## 🟢 LOW — Nice-to-Have / Future Enhancements

### 13. Text-to-Speech (TTS) Integration
- **Evidence:** `bin/llama-vulkan/llama-tts.exe` exists but no TTS feature in UI.
- **Fix:** Add a TTS toggle in settings and a speaker button on AI messages.

### 14. Vision / Image Input Support
- **Evidence:** `bin/llama-vulkan/llama-qwen2vl-cli.exe`, `llama-llava-cli.exe`, `llama-minicpmv-cli.exe` exist but no image upload UI.
- **Fix:** Add image upload button in chat input with multimodal model support.

### 15. Conversation Search
- **Problem:** No way to search through past conversations.
- **Fix:** Add a search bar in the sidebar to filter conversation history by keyword.

### 16. Auto-Stop / Token Limit Warning
- **Problem:** No indication of token usage or context window nearing limit.
- **Fix:** Display token count / context usage in the UI; add a warning at 80%/95% capacity.

### 17. Multi-Model Management
- **Problem:** Only one model file (`Qwen3.5-2B-Q4_K_M.gguf`) is present. No model management UI to switch between downloaded models.
- **Fix:** Add a model manager page or section that lists available `.gguf` files and allows loading them.

### 18. Responsive Desktop Layout Improvements
- **Problem:** The sidebar collapsed state (72px) shows icons but the chat history section and nav labels are completely hidden. There's no intermediate width for tablets.
- **Fix:** Add a mid-size breakpoint (768px–1024px) with a narrower expanded sidebar.

---

## 📋 Quick Reference Table

| # | Issue | Priority | Status | Files |
|---|-------|----------|--------|-------|
| 1 | Native API server endpoints | 🔴 CRITICAL | ✅ Built-in & Verified | `llama-server.exe`, `server.py` |
| 2 | requirements.txt cleanup | 🔴 CRITICAL | ✅ Resolved (0-dep) | `requirements.txt` |
| 3 | Chat history in sidebar | 🟠 HIGH | ✅ Completed | `index.html`, `script.js` |
| 4 | Settings controls non-functional | 🟠 HIGH | Stub | `settings.html`, `script.js` |
| 5 | Profile page all buttons dead | 🟠 HIGH | Stub | `profile.html` |
| 6 | Conversation auto-naming / sessions | 🟠 HIGH | ✅ Completed | `offline-api.js`, `script.js` |
| 7 | Server startup error handling | 🟠 HIGH | ✅ Completed | `server.py` |
| 8 | Model switching — real loading from models/ | 🟡 MEDIUM | ✅ Completed (Router) | `server.py`, `offline-api.js`, `script.js` |
| 9 | No message copy button | 🟡 MEDIUM | Missing | `script.js`, `style.css` |
| 10 | No message edit/delete | 🟡 MEDIUM | Missing | `script.js` |
| 11 | No export/import | 🟡 MEDIUM | Missing | Multiple |
| 12 | No keyboard shortcuts | 🟡 MEDIUM | Missing | `script.js` |
| 13 | TTS integration | 🟢 LOW | Not started | — |
| 14 | Vision/image input | 🟢 LOW | Not started | — |
| 15 | Conversation search | 🟢 LOW | Not started | — |
| 16 | Token usage indicator | 🟢 LOW | Not started | — |
| 17 | Multi-model management | 🟢 LOW | Not started | — |
| 18 | Tablet responsive layout | 🟢 LOW | Not started | `style.css` |

---

## 🚀 Recommended Immediate Actions

1. **Implement API proxy in `server.py`** — This unblocks all chat functionality. Use `http.server` (stdlib) or Flask to create `/v1/chat/completions` and `/health` endpoints that proxy to `llama-server.exe`.
2. **Wire sidebar chat history** — Read `spark_chat_history` from localStorage and render dynamic entries.
3. **Add handlers for Settings page controls** — At minimum wire "Clear All Chats" and "Chat History" toggle.
4. **Add server health check with error feedback** — Show meaningful error in the status pill when server is unreachable.
