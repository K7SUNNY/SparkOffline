# SparkV2 Offline (Qwen 3.5 Local AI)

SparkV2 is a high-performance, 100% offline local AI chat application powered by `Qwen3.5-2B-Q4_K_M.gguf`.

---

## ⚡ Quick Start (1-Click)

### Option 1: Double-Click `start.bat`
1. Double-click `start.bat` in the project root.
2. It automatically starts the high-performance inference engine with **Vulkan GPU Acceleration** (NVIDIA/Intel) or universal CPU fallback.
3. Automatically opens `http://localhost:5000/index.html` in your default browser.

### Option 2: Run with Python
```bash
python server.py
```
Zero external Python packages required (pure standard library).

### Option 3: PowerShell
```powershell
.\run.ps1
```

---

## ✨ Features

- **100% Offline & Private**: Zero data leaves your computer. No accounts, API keys, or internet needed.
- **Hardware Acceleration**: Bundled with native Vulkan GPU acceleration (auto-detects NVIDIA GeForce MX350 / Intel Iris Plus) and universal CPU engine fallback.
- **Qwen 3.5 Reasoning Display**: Chain-of-thought (`<think>` blocks) is visualized in a sleek collapsible thought process box with live indicator.
- **Model Presets**:
  - **Qwen 3.5 Pro**: Full 2048 token context with balanced temperature (0.7) for reasoning and general queries.
  - **Qwen 3.5 Fast**: Snappy 1024 token generation with lower latency (temp 0.5).
  - **Qwen 3.5 Coding**: Low temperature (0.2) for precise code synthesis and debugging.
- **Live Markdown & Code Highlighting**: Syntax coloring for code blocks with one-click copy button.
- **Memory & Session Storage**: Local persistence for conversation history, memory entries, and settings.
- **Dark & Light Modes**: Theme preferences persist across sessions.

---

## 📁 Project Structure

```
SparkOffline/
├── models/
│   └── Qwen3.5-2B-Q4_K_M.gguf   # Local Qwen GGUF model
├── bin/
│   ├── llama-vulkan/            # GPU-accelerated Vulkan engine
│   └── llama/                   # Universal CPU engine fallback
├── js/
│   ├── script.js                # UI logic, reasoning visualization, markdown render
│   ├── offline-api.js           # API streaming client (SSE), memory & history store
│   ├── marked.min.js            # Offline Markdown parser
│   └── highlight.min.js         # Offline syntax highlighter
├── css/
│   └── style.css                # App design system & thought box styling
├── index.html                   # Main chat interface
├── memory.html                  # Local memory page
├── settings.html                # Model and theme preferences
├── profile.html                 # Profile page
├── server.py                    # Standalone Python server
├── start.bat                    # 1-Click launcher
└── run.ps1                      # PowerShell launcher
```
