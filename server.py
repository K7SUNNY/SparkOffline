#!/usr/bin/env python3
"""
SparkV2 / SparkOffline Local AI Backend Server
Powered by standalone llama.cpp inference engine with Vulkan GPU acceleration.
Zero external Python dependencies required.
"""

import os
import sys
import time
import glob
import signal
import subprocess
import webbrowser
from urllib.request import urlopen, Request
from urllib.error import URLError

def find_model_file(models_dir):
    """Finds Qwen or any valid .gguf model in models/ directory."""
    preferred = os.path.join(models_dir, "Qwen3.5-2B-Q4_K_M.gguf")
    if os.path.isfile(preferred):
        return preferred
    
    gguf_files = glob.glob(os.path.join(models_dir, "*.gguf"))
    if gguf_files:
        return gguf_files[0]
    
    return None

def find_server_binary(base_dir):
    """Detects Vulkan GPU accelerated server, falls back to CPU."""
    vulkan_exe = os.path.join(base_dir, "bin", "llama-vulkan", "llama-server.exe")
    cpu_exe = os.path.join(base_dir, "bin", "llama", "llama-server.exe")

    if os.path.isfile(vulkan_exe):
        return vulkan_exe, "Vulkan GPU Acceleration"
    elif os.path.isfile(cpu_exe):
        return cpu_exe, "Universal CPU Engine"
    
    return None, None

def wait_for_server(url, timeout=25):
    """Polls server until the model is loaded and static files (CSS) return HTTP 200."""
    start_time = time.time()
    while time.time() - start_time < timeout:
        try:
            req = Request(f"{url}/css/style.css", headers={"User-Agent": "SparkV2-Launcher"})
            with urlopen(req, timeout=1.5) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            pass
        time.sleep(0.5)
    return False

def main():
    base_dir = os.path.abspath(os.path.dirname(__file__))
    models_dir = os.path.join(base_dir, "models")
    
    host = os.getenv("SPARK_HOST", "127.0.0.1")
    port = int(os.getenv("SPARK_PORT", "5000"))
    ctx_size = int(os.getenv("SPARK_CTX", "2048"))

    print("=" * 60)
    print("        SparkV2 Offline - Local AI Server")
    print("=" * 60)

    # 1. Locate Model
    model_path = find_model_file(models_dir)
    if not model_path:
        print(f"\n[ERROR] No .gguf model found in '{models_dir}'!")
        print("Please ensure 'Qwen3.5-2B-Q4_K_M.gguf' is located in the models/ folder.")
        sys.exit(1)
    
    model_name = os.path.basename(model_path)
    print(f"[INFO] Model: {model_name}")

    # 2. Locate Inference Engine
    server_exe, engine_desc = find_server_binary(base_dir)
    if not server_exe:
        print(f"\n[ERROR] Inference engine not found in '{os.path.join(base_dir, 'bin')}'!")
        print("Please ensure bin/llama-vulkan or bin/llama exists.")
        sys.exit(1)

    print(f"[INFO] Engine: {engine_desc}")
    print(f"[INFO] Serving Web App & API at: http://{host}:{port}")
    print(f"[INFO] Context Window: {ctx_size} tokens")
    print("=" * 60)

    # Command line args for llama-server
    cmd = [
        server_exe,
        "-m", model_path,
        "--path", base_dir,
        "--port", str(port),
        "--host", host,
        "-c", str(ctx_size)
    ]

    if "--test" in sys.argv:
        print("[TEST] Verified model path and binary. Ready to run.")
        sys.exit(0)

    try:
        process = subprocess.Popen(cmd, cwd=base_dir)
        server_url = f"http://{host}:{port}"
        print(f"\n[INFO] Loading Qwen 3.5 model into memory (usually takes 3-6s)...")
        
        # Wait until the model is ready and CSS returns HTTP 200
        if wait_for_server(server_url, timeout=20):
            print(f"[INFO] Model loaded successfully! Opening {server_url}/index.html\n")
            webbrowser.open(f"{server_url}/index.html")
        else:
            print(f"[WARN] Startup check took longer than expected. Opening browser...")
            webbrowser.open(f"{server_url}/index.html")

        print("=" * 60)
        print("Server is active! Keep this window open while using the chat app.")
        print("Press Ctrl+C to stop the server.")
        print("=" * 60 + "\n")
        process.wait()

    except KeyboardInterrupt:
        print("\n[INFO] Stopping SparkV2 server...")
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                process.kill()
        print("[INFO] Server stopped safely.")
    except Exception as exc:
        print(f"[ERROR] Failed to run server: {exc}")
        sys.exit(1)

if __name__ == "__main__":
    main()
