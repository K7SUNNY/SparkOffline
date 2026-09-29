# ⚡ SparkV2 Offline - Local AI Studio

SparkV2 is a high-performance, 100% offline and private local AI studio running natively on your computer with **Vulkan GPU Acceleration** and universal CPU fallback. Powered by the **Qwen 3.5** family of language and vision models.

---

## 🚀 Quick Start (1-Click)

### Option 1: Double-Click `start.bat` (Recommended)
1. Double-click `start.bat` in the project root folder.
2. It automatically starts the inference engine with Vulkan GPU acceleration (auto-detects NVIDIA / AMD / Intel GPUs) or falls back to CPU.
3. Automatically opens `http://127.0.0.1:5000/` in your default browser.

### Option 2: Python Command Line
```powershell
python server.py
```
*Zero third-party Python packages required — runs purely on Python's standard library.*

### Option 3: PowerShell Script
```powershell
.\run.ps1
```

---

## 🧠 Supported Models & Setup Guide

All models must be placed inside the `models/` directory in `.gguf` format.

```
SparkOffline/
└── models/
    ├── Qwen3.5-0.8B-Q4_K_M.gguf      # Fast lightweight text model
    ├── Qwen3.5-2B-Q4_K_M.gguf        # Balanced daily driver
    ├── Qwen3.5-4B-Q4_K_M.gguf        # High-intelligence reasoning & coding
    ├── mmproj-2B.gguf                # Vision projector for 2B
    └── mmproj-4B.gguf                # Vision projector for 4B
```

### Recommended Models (Qwen 3.5 GGUF)

| Model | File Size | Memory Footprint | Recommended Use | Vision Support |
| :--- | :--- | :--- | :--- | :--- |
| **Qwen 3.5 0.8B** (`Q4_K_M`) | ~508 MB | ~1 GB RAM | Instant answers, lightweight laptops | Text Only |
| **Qwen 3.5 2B** (`Q4_K_M`) | ~1.2 GB | ~2 GB RAM / VRAM | General conversation, drafting, everyday chat | ✅ Vision with `mmproj-2B.gguf` |
| **Qwen 3.5 4B** (`Q4_K_M`) | ~2.6 GB | ~4 GB RAM / VRAM | Deep reasoning, complex logic, code generation | ✅ Vision with `mmproj-4B.gguf` |
| **Qwen 3.5 7B** (`Q4_K_M`) | ~4.5 GB | ~6 GB RAM / VRAM | Maximum accuracy & coding proficiency | ✅ Vision with `mmproj-7B.gguf` |

---

## 👁️ Multimodal Vision (`mmproj`) Guide

To analyze images (OCR, photo inspection, UI analysis, charts), Qwen requires a **multimodal projector** (`mmproj`) file alongside the text model.

### ⚠️ Critical Rule: Projectors are Size-Specific!
* **A 2B projector CANNOT be used with a 4B or 7B model.**
* The projector converts image pixels into the exact embedding dimension (`n_embd`) of the language model:
  * Qwen 3.5 2B: `n_embd = 2048`
  * Qwen 3.5 4B: `n_embd = 2560`
* If you attach an image to a model without its matching projector, the server will report:
  `image input is not supported - hint: you may need to provide the mmproj`
* If an incompatible projector is loaded, the server will report:
  `mismatch between text model (n_embd = 2560) and mmproj (n_embd = 2048)`

---

### 📥 Where to Download Matching Projectors

Each model repository on Hugging Face provides its own matching `mmproj-BF16.gguf`:

1. **For Qwen 3.5 2B**:
   - Download from: [unsloth/Qwen3.5-2B-GGUF](https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/blob/main/mmproj-BF16.gguf)
   - Save into `models/` as: **`mmproj-2B.gguf`** (or `mmproj-BF16.gguf`)

2. **For Qwen 3.5 4B**:
   - Download from: [unsloth/Qwen3.5-4B-GGUF](https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/blob/main/mmproj-BF16.gguf)
   - Save into `models/` as: **`mmproj-4B.gguf`**

3. **For Qwen 3.5 7B**:
   - Download from: [unsloth/Qwen3.5-7B-GGUF](https://huggingface.co/unsloth/Qwen3.5-7B-GGUF/blob/main/mmproj-BF16.gguf)
   - Save into `models/` as: **`mmproj-7B.gguf`**

---

### 🏷️ File Renaming Rules for `models/`

Because Hugging Face repositories name all projector files `mmproj-BF16.gguf`, you **must rename them** when placing multiple projectors in `models/` to prevent overwriting:

* **Include the model size in the projector filename**:
  * `mmproj-2B.gguf` or `mmproj-2B-BF16.gguf` $\rightarrow$ Pairs automatically with any 2B model.
  * `mmproj-4B.gguf` or `mmproj-4B-BF16.gguf` $\rightarrow$ Pairs automatically with any 4B model.
  * `mmproj-7B.gguf` or `mmproj-7B-BF16.gguf` $\rightarrow$ Pairs automatically with any 7B model.

When you run `python server.py`, it automatically checks the internal GGUF architecture metadata and filename tokens, pairing each model with its matching vision projector:

```text
[INFO] Detected 3 model(s) in models/:
       - Qwen3.5-0.8B-Q4_K_M.gguf (507.8 MB) [Text Only]
       - Qwen3.5-2B-Q4_K_M.gguf (1221.5 MB) [Vision Capable via mmproj-2B.gguf]
       - Qwen3.5-4B-Q4_K_M.gguf (2614.0 MB) [Vision Capable via mmproj-4B.gguf]
```

---

## ⚡ Instant Response vs. Deep Thinking Mode

In the chat toolbar, toggle between two response styles with one click:

1. **Thinking: Off (Instant Reply Mode - Recommended for speed)**:
   - Uses assistant prefill to terminate the `<think>` block at **token 0**.
   - Time to first token is **~0.25 seconds** with zero thinking delays.
   - Ideal for quick queries, facts, translations, and everyday conversations.
2. **Thinking: On (Deep Reasoning Mode)**:
   - Allows Qwen to think through challenging logic, mathematics, and code architecture.
   - Reasoning streams live in an interactive, collapsible **🧠 Thinking Process** accordion box.

---

## 💬 Multi-Turn Context & Memory

* **4096-Token Context Window**: Plenty of room for multi-turn conversational history and image analysis without forgetting earlier messages.
* **Smart Image Pruning**: During long multi-turn chats, older image turns retain their text context while only the most recent image sends heavy base64 data, preserving speed and token budget.
* **Session Persistence**: Chat sessions are stored locally in browser storage with automatic quota recovery.
* **Custom Instructions (`system_prompt.txt`)**: Edit rules, tone, and guidelines in plain text. Changes apply immediately on the next message without restarting the server.

---

## 📂 Directory Structure

```
SparkOffline/
├── models/                      # Place all .gguf models and mmproj files here
│   ├── Qwen3.5-2B-Q4_K_M.gguf
│   ├── Qwen3.5-4B-Q4_K_M.gguf
│   ├── mmproj-2B.gguf
│   └── mmproj-4B.gguf
├── bin/
│   ├── llama-vulkan/            # GPU-accelerated Vulkan inference engine
│   └── llama/                   # CPU fallback inference engine
├── js/
│   ├── script.js                # UI controls, theme, streaming renderer
│   ├── offline-api.js           # API communication, context builder, session manager
│   ├── marked.min.js            # Offline Markdown parser
│   └── highlight.min.js         # Offline syntax highlighter
├── css/
│   └── style.css                # Dark/light styling, thought box, image lightbox
├── index.html                   # Main chat application interface
├── settings.html                # Model configuration & engine settings
├── memory.html                  # Memory manager
├── profile.html                 # Profile view
├── system_prompt.txt            # Live system instructions & persona
├── models.ini                   # Auto-generated llama.cpp router preset
├── server.py                    # Zero-dependency local server launcher
├── start.bat                    # 1-click Windows launcher
└── run.ps1                      # PowerShell launcher
```

---

## 🔧 Troubleshooting & FAQ

### 1. "image input is not supported - hint: you may need to provide the mmproj"
* **Cause**: You selected a model that does not have its matching `mmproj` file in `models/`.
* **Fix**: Download the matching `mmproj` for that model size (e.g. `mmproj-4B.gguf` for 4B) and restart `server.py`.

### 2. "mismatch between text model (n_embd = 2560) and mmproj (n_embd = 2048)"
* **Cause**: You are attempting to load a 2B vision projector with a 4B model.
* **Fix**: Ensure your 4B model is paired with `mmproj-4B.gguf`, not the 2B projector.

### 3. Server says port 5000 is already in use
* **Fix**: Another instance of `server.py` or `llama-server.exe` is already running. Press `Ctrl + C` in the running terminal, or end `llama-server.exe` in Windows Task Manager, then start it again.

### 4. UI changes or settings not updating
* **Fix**: Perform a hard refresh in your browser with **`Ctrl + F5`** (or `Shift + Reload`) to clear cached JavaScript and CSS files.

---

## 🔒 Privacy & Offline Guarantee

* **100% Local**: All weights, tokenizers, and calculations run on your hardware.
* **No Telemetry**: No network requests are sent outside `127.0.0.1`.
* **Works Without Internet**: Disconnect your Wi-Fi or Ethernet at any time — SparkV2 will operate completely unchanged.
