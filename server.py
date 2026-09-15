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

def get_available_models(models_dir):
    """Returns all valid .gguf model files in models/ directory."""
    if not os.path.isdir(models_dir):
        return []
    return sorted(glob.glob(os.path.join(models_dir, "*.gguf")))

def find_server_binary(base_dir):
    """Detects Vulkan GPU accelerated server, falls back to CPU."""
    vulkan_exe = os.path.join(base_dir, "bin", "llama-vulkan", "llama-server.exe")
    cpu_exe = os.path.join(base_dir, "bin", "llama", "llama-server.exe")

    if os.path.isfile(vulkan_exe):
        return vulkan_exe, "Vulkan GPU Acceleration"
    elif os.path.isfile(cpu_exe):
        return cpu_exe, "Universal CPU Engine"
    
    return None, None

def wait_for_server(process, url, timeout=20):
    """Polls server until process is ready or exits prematurely."""
    start_time = time.time()
    while time.time() - start_time < timeout:
        # Check if process terminated prematurely
        exit_code = process.poll()
        if exit_code is not None:
            print(f"\n[ERROR] Inference engine exited unexpectedly with code {exit_code}!")
            return False

        try:
            req = Request(f"{url}/health", headers={"User-Agent": "SparkV2-Launcher"})
            with urlopen(req, timeout=1.0) as resp:
                if resp.status in (200, 503):
                    # 200 = ready, 503 = router loaded / model loading
                    return True
        except Exception:
            try:
                # Fallback to static asset check
                req_css = Request(f"{url}/css/style.css", headers={"User-Agent": "SparkV2-Launcher"})
                with urlopen(req_css, timeout=1.0) as resp:
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

    # 1. Locate Models in models/
    models = get_available_models(models_dir)
    if not models:
        print(f"\n[ERROR] No .gguf models found in '{models_dir}'!")
        print("Please place at least one .gguf model (e.g. Qwen3.5-2B-Q4_K_M.gguf) in models/.")
        sys.exit(1)
    
    print(f"[INFO] Detected {len(models)} model(s) in models/:")
    for m in models:
        print(f"       - {os.path.basename(m)} ({os.path.getsize(m) / (1024*1024):.1f} MB)")

    # 2. Locate Inference Engine
    server_exe, engine_desc = find_server_binary(base_dir)
    if not server_exe:
        print(f"\n[ERROR] Inference engine not found in '{os.path.join(base_dir, 'bin')}'!")
        print("Please ensure bin/llama-vulkan or bin/llama exists.")
        sys.exit(1)

    print(f"[INFO] Engine: {engine_desc}")
    print(f"[INFO] URL:    http://{host}:{port}")
    print(f"[INFO] Window: {ctx_size} context tokens")
    print("=" * 60)

    # Launch in router mode with --models-dir to support all models dynamically
    cmd = [
        server_exe,
        "--models-dir", models_dir,
        "--models-max", "1",
        "--path", base_dir,
        "--port", str(port),
        "--host", host,
        "-c", str(ctx_size)
    ]

    if "--test" in sys.argv:
        print("[TEST] Verified model directory and engine binary. Ready to run.")
        sys.exit(0)

    try:
        process = subprocess.Popen(cmd, cwd=base_dir)
        server_url = f"http://{host}:{port}"
        
        print("\n[INFO] Starting inference server and verifying readiness...")
        if wait_for_server(process, server_url, timeout=20):
            print(f"[INFO] Engine & Web UI confirmed ready! Opening {server_url}/index.html\n")
            time.sleep(0.5)
            webbrowser.open(f"{server_url}/index.html")
        else:
            if process.poll() is None:
                print(f"[WARN] Startup check timed out, attempting to open browser anyway...")
                webbrowser.open(f"{server_url}/index.html")
            else:
                print(f"[ERROR] Could not start server. Please check port availability or permissions.")
                sys.exit(1)

        print("=" * 60)
        print("Server is active! Keep this window open while using the chat app.")
        print("Press Ctrl+C in this terminal to stop the server.")
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
