# SparkOffline — Development Roadmap

> **Last updated:** 2026-09-30  
> **Status:** Active development — core chat & vision functional; focusing on UI integrity, memory wiring, message actions, and data portability.

---

## 📊 Project Status Overview

| Capability | Current State | Notes |
|---|---|---|
| **Local LLM Engine** | ✅ Complete | Vulkan GPU / CPU `llama-server.exe` with zero Python dependencies |
| **Multimodal Vision** | ✅ Complete | Auto-pairing `.gguf` models with `mmproj-*.gguf` projectors |
| **Multi-Model Router** | ✅ Complete | Dynamic model discovery via `/v1/models` and `models.ini` routing |
| **Multi-Session History**| ✅ Complete | Dynamic sidebar sessions, auto-naming, URL query routing |
| **Thinking Toggle** | ✅ Complete | Deep reasoning (`<think>`) toggle with instant bypass prefill |
| **Image Input & Lightbox** | ✅ Complete | Drag & drop, clipboard paste (Ctrl+V), thumbnail tray, lightbox |
| **Memory Persistence** | ⚠️ Placebo / Broken | UI records turns to localStorage, but prompt never injects them |
| **Profile Page** | ❌ Broken / Mockup | Form inputs have no IDs, buttons have no handlers, fake stats |
| **Settings Toggles** | ⚠️ Partially Broken | Model, temp, context work; code-block & history toggles are stubs |
| **Message Actions** | ❌ Missing | No message copy, regenerate, or edit buttons |
| **Document Ingestion** | ❌ Missing | Cannot attach `.txt`, `.py`, `.md`, `.json` code/text files |
| **Data Export / Import** | ❌ Missing | No backup/restore for chat sessions or memories |

---

## 🔴 Phase 1: Integrity & Broken Feature Fixes (Immediate Priority)

### 1. Connect Memory System to Inference Prompt
- **Files:** `js/offline-api.js`, `js/script.js`, `memory.html`
- **Current Problem:** 
  `offline-api.js` automatically records user/assistant turns into `localStorage['spark_memory']`, and `memory.html` allows viewing and searching them. However, **`buildRequestMessages()` in `offline-api.js` never injects these memories into the prompt sent to the LLM**. The model has 0% awareness of saved memories. Additionally, users have no way to manually add custom memory items.
- **Tasks to Implement:**
  - [ ] Update `buildRequestMessages()` in `offline-api.js` to retrieve active memories from `localStorage` and inject them into the system prompt block (e.g. `[User Memories & Preferences]: ...`).
  - [ ] Add an "Add New Memory" input bar + button in `memory.html` so users can store custom facts or preferences.
  - [ ] Filter out repetitive or trivial chat messages from auto-memory to prevent context bloat.
  - [ ] Add a memory limit/toggle in Settings to control how many memories are injected (e.g., top 5–10).

### 2. Wire the Profile Page (`profile.html`)
- **Files:** `profile.html`, `js/script.js`, `settings.html`
- **Current Problem:** 
  `profile.html` is an un-wired HTML mockup. The inputs have hardcoded text and no IDs. "Save Changes", avatar "Edit", "Sign Out", and "Delete Account" buttons have no event listeners. The stats grid shows hardcoded dummy values (`1,240 Messages`, `48 Hours Saved`, `12 Day Streak`).
- **Tasks to Implement:**
  - [ ] Add proper element IDs to all inputs (`profile-name`, `profile-email`, `profile-display-name`, `profile-phone`) and action buttons in `profile.html`.
  - [ ] Implement `initProfilePage()` in `js/script.js`:
    - Load saved profile data from `localStorage['spark_profile']` (with sensible defaults).
    - Save updated profile data on clicking "Save Changes" with instant feedback toast/alert.
    - Wire avatar upload button with a hidden file input (converting image to base64 and saving to `spark_avatar`).
  - [ ] Compute live statistics from `localStorage`:
    - **Messages:** Total messages count across all sessions in `spark_chat_sessions`.
    - **Sessions:** Total conversation threads created.
    - **Memories:** Total active memory entries.
  - [ ] Wire "Sign Out" and "Delete Account" with confirmation modals (clears profile and chat history cleanly).
  - [ ] Sync the Profile preview card on `settings.html` and header avatar with saved profile data.

### 3. Wire Inactive Settings Toggles
- **Files:** `settings.html`, `js/script.js`
- **Current Problem:** 
  The "Always show code blocks" toggle and "Chat History (Save chats to this device)" toggle are static checkboxes with no IDs, no storage keys, and no event handlers.
- **Tasks to Implement:**
  - [ ] Add IDs (`toggle-code-blocks`, `toggle-chat-history`) and wire them in `initSettingsPage()`.
  - [ ] Store preferences in `spark_always_expand_code` and `spark_enable_history`.
  - [ ] Connect `spark_enable_history` to `offline-api.js`: when disabled, chats are kept in memory only for the current session and not written to `localStorage`.

### 4. Optimize `server.py` Router Arguments
- **Files:** `server.py`
- **Current Problem:** 
  `server.py` passes both `--models-preset models.ini` and `--models-dir models/` to `llama-server.exe`. This causes the server to scan raw files in `models/` on top of the preset definitions, which can trigger errors if non-LLM `.gguf` files exist.
- **Tasks to Implement:**
  - [ ] When `--models-preset` is active, avoid passing redundant `--models-dir` or filter model directories so only explicitly mapped router models are exposed.

---

## 🟠 Phase 2: Core Chat Usability & Productivity (High Priority)

### 5. Message Action Bar (Copy, Regenerate, Edit, Delete)
- **Files:** `index.html`, `js/script.js`, `css/style.css`
- **Current Problem:** 
  Users cannot copy entire AI messages (only individual code blocks have copy buttons). There is no "Regenerate" button to retry an answer, and no way to edit a past prompt if a typo was made.
- **Tasks to Implement:**
  - [ ] Add a clean hover action bar to every message bubble:
    - **AI Messages:**
      - 📋 **Copy:** Copies the full raw markdown text to clipboard with "Copied!" feedback.
      - 🔄 **Regenerate:** Triggers a fresh response generation for the preceding user prompt, replacing or branching the assistant turn.
    - **User Messages:**
      - 📋 **Copy:** Copies the user's prompt text.
      - ✏️ **Edit:** Loads the prompt back into the input bar for quick editing and re-submission.
      - 🗑️ **Delete:** Removes this turn from the active session.

### 6. Keyboard Shortcuts
- **Files:** `js/script.js`
- **Tasks to Implement:**
  - [ ] `Ctrl + N` / `Cmd + N`: Create and switch to a New Chat.
  - [ ] `Escape`: Stop active generation (if running) or close open modals/lightboxes.
  - [ ] `Up Arrow` (when chat input is empty): Load the last sent message into the input for quick editing.
  - [ ] `Ctrl + /` or `Ctrl + K`: Quick focus on search or settings.

### 7. Sidebar Conversation Search
- **Files:** `index.html`, `js/script.js`, `css/style.css`
- **Current Problem:** 
  Finding older chats requires scrolling through the entire history list.
- **Tasks to Implement:**
  - [ ] Add a search input above the Recent Chats list in the sidebar.
  - [ ] Filter session titles and message contents in real time as the user types.
  - [ ] Highlight matching keywords and show empty state if no conversations match.

---

## 🟡 Phase 3: File Ingestion & Data Management (Medium Priority)

### 8. Text & Code Document File Attachments
- **Files:** `index.html`, `js/script.js`, `css/style.css`
- **Current Problem:** 
  The file picker and drop zone only accept `image/*`. Users cannot attach code files (`.py`, `.js`, `.cpp`, `.html`), text files (`.txt`, `.md`), or structured files (`.json`, `.csv`) for analysis.
- **Tasks to Implement:**
  - [ ] Expand file input accept attribute to include documents: `.txt, .py, .js, .ts, .html, .css, .json, .csv, .md, .c, .cpp, .java, .sql`.
  - [ ] Implement client-side file reading (`FileReader.readAsText`).
  - [ ] Render a file badge in the attachment preview tray with filename, size, and document icon.
  - [ ] Format attached file contents cleanly into the prompt context:
    ```markdown
    [Attached Document: example.py]
    ```python
    <file content>
    ```
    ```

### 9. Chat Data Export & Import (Backup & Restore)
- **Files:** `settings.html`, `js/offline-api.js`, `js/script.js`
- **Current Problem:** 
  All user data resides in browser `localStorage`. Clearing browser data wipes all chat history and memories with no recovery path.
- **Tasks to Implement:**
  - [ ] **Export to JSON:** Download a full `.json` backup containing all chat sessions, settings, and memories.
  - [ ] **Export Current Chat to Markdown:** Download the active conversation as a formatted `.md` file.
  - [ ] **Import Backup (JSON):** File picker to upload a previously exported backup with merge or replace options.
  - [ ] Add buttons under "Data & Privacy" section in `settings.html`.

---

## 🟢 Phase 4: Performance Insights & Hardware Gauges (Nice-to-Have)

### 10. Generation Speed & Performance Metrics
- **Files:** `js/offline-api.js`, `js/script.js`, `css/style.css`
- **Description:** 
  Local AI users need visibility into inference performance on their hardware.
- **Tasks to Implement:**
  - [ ] Track Time-to-First-Token (TTFT) and total generation time.
  - [ ] Calculate tokens generated per second (`tok/s`).
  - [ ] Display a subtle performance badge beneath finished AI messages (e.g. `24.8 tok/s • 1.1s TTFT • 382 tokens`).

### 11. Context Window Usage Gauge
- **Files:** `index.html`, `js/script.js`
- **Description:** 
  Visual indicator showing how much of the active context window (e.g., 4096 tokens) has been consumed by the conversation. Warns user when approaching context limits.

### 12. Local Text-to-Speech (TTS)
- **Files:** `index.html`, `js/script.js`, `bin/llama-vulkan/llama-tts.exe`
- **Description:** 
  Integrate a speaker icon on AI messages using the browser's built-in offline Web Speech API (`window.speechSynthesis`) or local TTS binary for voice output.

---

## 📋 Comprehensive Feature Tracking Table

| # | Feature / Issue | Phase / Priority | Current Status | Primary Files |
|---|---|---|---|---|
| 1 | **Memory System Prompt Injection** | 🔴 Phase 1 (CRITICAL) | ⚠️ Disconnected (Placebo) | `offline-api.js`, `memory.html` |
| 2 | **Manual Memory Creation UI** | 🔴 Phase 1 (HIGH) | ❌ Missing | `memory.html`, `script.js` |
| 3 | **Profile Page Form & Data Persistence** | 🔴 Phase 1 (HIGH) | ❌ Broken / Dead Stub | `profile.html`, `script.js` |
| 4 | **Profile Stats Live Calculation** | 🔴 Phase 1 (MEDIUM) | ❌ Mockup Numbers | `profile.html`, `script.js` |
| 5 | **Settings Code Block & History Toggles** | 🔴 Phase 1 (HIGH) | ⚠️ Dead Checkboxes | `settings.html`, `script.js` |
| 6 | **`server.py` Router Parameter Cleanup** | 🔴 Phase 1 (LOW) | ⚠️ Redundant flag | `server.py` |
| 7 | **Message Copy & Regenerate Toolbar** | 🟠 Phase 2 (HIGH) | ❌ Missing | `script.js`, `style.css` |
| 8 | **Message Edit & Delete (Turn Management)**| 🟠 Phase 2 (HIGH) | ❌ Missing | `script.js`, `offline-api.js` |
| 9 | **Keyboard Shortcuts (Ctrl+N, Esc, Up)** | 🟠 Phase 2 (MEDIUM) | ❌ Missing | `script.js` |
| 10 | **Sidebar Conversation Search** | 🟠 Phase 2 (MEDIUM) | ❌ Missing | `index.html`, `script.js` |
| 11 | **Text & Code Document File Attachments** | 🟡 Phase 3 (HIGH) | ❌ Images only | `index.html`, `script.js` |
| 12 | **Chat Export (JSON & Markdown)** | 🟡 Phase 3 (HIGH) | ❌ Missing | `settings.html`, `script.js` |
| 13 | **Chat Import (JSON Restore)** | 🟡 Phase 3 (HIGH) | ❌ Missing | `settings.html`, `script.js` |
| 14 | **Tokens/sec & Latency Metrics** | 🟢 Phase 4 (MEDIUM) | ❌ Missing | `offline-api.js`, `script.js` |
| 15 | **Context Window Usage Gauge** | 🟢 Phase 4 (LOW) | ❌ Missing | `index.html`, `script.js` |
| 16 | **Offline Text-to-Speech (TTS)** | 🟢 Phase 4 (LOW) | ❌ Missing | `script.js` |

---

## 🚀 Execution Plan for Next Turn

1. **Step 1:** Fix the **Memory Injection & Memory Management** so stored facts actually influence the AI's answers.
2. **Step 2:** Wire the **Profile Page & Settings Toggles** to make all existing pages 100% functional.
3. **Step 3:** Implement the **Message Action Toolbar** (Copy, Regenerate, Edit) on chat bubbles.
4. **Step 4:** Add **Document Attachment Support** (`.txt`, `.py`, `.md`, `.json`) and **Data Export/Import**.
