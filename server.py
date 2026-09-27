#!/usr/bin/env python3
"""
SparkV2 / SparkOffline Local AI Backend Server
Powered by standalone llama.cpp inference engine with Vulkan GPU acceleration.
Includes native Multimodal Vision support via automatic mmproj projector binding.
Zero external Python dependencies required.
"""

import os
import sys
import time
import glob
import struct
import signal
import subprocess
import webbrowser
from urllib.request import urlopen, Request
from urllib.error import URLError

def is_mmproj_file(filename):
    """Checks whether a GGUF file is a multimodal projector."""
    base = os.path.basename(filename).lower()
    return "mmproj" in base

def get_available_models(models_dir):
    """Returns all valid text/LLM .gguf model files in models/ directory (excluding mmproj)."""
    if not os.path.isdir(models_dir):
        return []
    all_gguf = sorted(glob.glob(os.path.join(models_dir, "*.gguf")))
    return [m for m in all_gguf if not is_mmproj_file(m)]

def get_available_mmprojs(models_dir):
    """Returns all multimodal projector .gguf files in models/ directory."""
    if not os.path.isdir(models_dir):
        return []
    all_gguf = sorted(glob.glob(os.path.join(models_dir, "*.gguf")))
    return [m for m in all_gguf if is_mmproj_file(m)]

def read_gguf_name(path):
    """Reads internal model name/basename from GGUF metadata header."""
    try:
        with open(path, 'rb') as f:
            magic = f.read(4)
            if magic != b'GGUF':
                return None
            version = struct.unpack('<I', f.read(4))[0]
            if version >= 2:
                n_tensors, n_kv = struct.unpack('<QQ', f.read(16))
            else:
                n_tensors, n_kv = struct.unpack('<II', f.read(8))
            for _ in range(min(n_kv, 40)):
                n_len = struct.unpack('<Q', f.read(8))[0]
                if n_len > 256:
                    break
                key_name = f.read(n_len).decode('utf-8', errors='ignore')
                val_type = struct.unpack('<I', f.read(4))[0]
                if val_type == 8: # string
                    s_len = struct.unpack('<Q', f.read(8))[0]
                    if s_len > 1024:
                        break
                    s_val = f.read(s_len).decode('utf-8', errors='ignore')
                    if key_name in ('general.name', 'general.basename'):
                        return s_val
                elif val_type in (4, 5):
                    f.seek(4, os.SEEK_CUR)
                elif val_type in (6, 7):
                    f.seek(4, os.SEEK_CUR)
                elif val_type == 9: # array
                    break
                else:
                    break
    except Exception:
        pass
    return None

def pair_models_with_mmproj(models, mmprojs):
    """
    Intelligently pairs text models with their corresponding multimodal projector.
    Matches by GGUF internal metadata, filename patterns, or fallback single-pair logic.
    """
    paired = {}
    if not mmprojs or not models:
        return paired

    # 1. Map mmprojs by their internal GGUF names
    mmproj_meta_map = {}
    for mp in mmprojs:
        name = read_gguf_name(mp)
        if name:
            mmproj_meta_map[name.lower()] = mp

    # 2. Match models
    for m in models:
        m_name = read_gguf_name(m)
        m_base = os.path.basename(m).lower()
        matched = None

        if m_name and m_name.lower() in mmproj_meta_map:
            matched = mmproj_meta_map[m_name.lower()]
        else:
            # Match by size token (e.g. 2b, 7b, 0.8b)
            for mp in mmprojs:
                mp_base = os.path.basename(mp).lower()
                for token in ('2b', '7b', '14b', '32b', '72b', '0.5b', '0.8b', '1.5b'):
                    if token in m_base and token in mp_base:
                        matched = mp
                        break
                if matched:
                    break

        # Fallback: if only 1 mmproj exists and model is Qwen-2B or similar
        if not matched and len(mmprojs) == 1:
            first_mp = mmprojs[0]
            first_name = (read_gguf_name(first_mp) or '').lower()
            if '2b' in m_base and ('2b' in first_name or '2b' in os.path.basename(first_mp).lower()):
                matched = first_mp
            elif len(models) == 1:
                matched = first_mp

        if matched:
            paired[m] = matched

    return paired

def generate_router_preset(base_dir, models, paired_mmprojs, ctx_size=4096):
    """
    Generates an INI preset file for llama-server router mode.
    Explicitly binds each model with its multimodal projector (mmproj) if available.
    """
    ini_path = os.path.join(base_dir, "models.ini")
    lines = [
        "version = 1\n",
        "[*]",
        f"ctx-size = {ctx_size}\n"
    ]

    for model_path in models:
        base_name = os.path.basename(model_path)
        clean_alias = base_name[:-5] if base_name.lower().endswith(".gguf") else base_name
        rel_model_path = os.path.relpath(model_path, base_dir).replace("\\", "/")

        mmproj_path = paired_mmprojs.get(model_path)
        rel_mmproj_path = os.path.relpath(mmproj_path, base_dir).replace("\\", "/") if mmproj_path else None

        # Clean alias section (e.g. Qwen3.5-2B-Q4_K_M)
        lines.append(f"[{clean_alias}]")
        lines.append(f"model = {rel_model_path}")
        if rel_mmproj_path:
            lines.append(f"mmproj = {rel_mmproj_path}")
        lines.append("")

        # Filename alias section (e.g. Qwen3.5-2B-Q4_K_M.gguf)
        if clean_alias != base_name:
            lines.append(f"[{base_name}]")
            lines.append(f"model = {rel_model_path}")
            if rel_mmproj_path:
                lines.append(f"mmproj = {rel_mmproj_path}")
            lines.append("")

    with open(ini_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    return ini_path

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
        exit_code = process.poll()
        if exit_code is not None:
            print(f"\n[ERROR] Inference engine exited unexpectedly with code {exit_code}!")
            return False

        try:
            req = Request(f"{url}/health", headers={"User-Agent": "SparkV2-Launcher"})
            with urlopen(req, timeout=1.0) as resp:
                if resp.status in (200, 503):
                    return True
        except Exception:
            try:
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
    ctx_size = int(os.getenv("SPARK_CTX", "4096"))

    print("=" * 60)
    print("        SparkV2 Offline - Local AI Server")
    print("=" * 60)

    # 1. Locate Models & Multimodal Projectors
    models = get_available_models(models_dir)
    mmprojs = get_available_mmprojs(models_dir)

    if not models:
        print(f"\n[ERROR] No .gguf models found in '{models_dir}'!")
        print("Please place at least one .gguf model (e.g. Qwen3.5-2B-Q4_K_M.gguf) in models/.")
        sys.exit(1)

    paired_mmprojs = pair_models_with_mmproj(models, mmprojs)

    print(f"[INFO] Detected {len(models)} model(s) in models/:")
    for m in models:
        size_mb = os.path.getsize(m) / (1024 * 1024)
        m_base = os.path.basename(m)
        if m in paired_mmprojs:
            proj_name = os.path.basename(paired_mmprojs[m])
            print(f"       - {m_base} ({size_mb:.1f} MB) [Vision Capable via {proj_name}]")
        else:
            print(f"       - {m_base} ({size_mb:.1f} MB) [Text Only]")

    if mmprojs:
        print(f"[INFO] Detected {len(mmprojs)} Multimodal Projector(s) (mmproj):")
        for mp in mmprojs:
            mp_size = os.path.getsize(mp) / (1024 * 1024)
            print(f"       * {os.path.basename(mp)} ({mp_size:.1f} MB)")

    # 2. Locate Inference Engine
    server_exe, engine_desc = find_server_binary(base_dir)
    if not server_exe:
        print(f"\n[ERROR] Inference engine not found in '{os.path.join(base_dir, 'bin')}'!")
        print("Please ensure bin/llama-vulkan or bin/llama exists.")
        sys.exit(1)

    # 3. Generate router preset binding models and mmproj files
    preset_ini = generate_router_preset(base_dir, models, paired_mmprojs, ctx_size=ctx_size)

    print(f"[INFO] Engine: {engine_desc}")
    print(f"[INFO] URL:    http://{host}:{port}")
    print(f"[INFO] Window: {ctx_size} context tokens")
    print(f"[INFO] Preset: {os.path.basename(preset_ini)} (Multimodal Vision Active)")
    print("=" * 60)

    # Launch in router mode with preset
    cmd = [
        server_exe,
        "--models-preset", preset_ini,
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
            print(f"[INFO] Engine & Web UI confirmed ready! Opening {server_url}/\n")
            time.sleep(0.5)
            webbrowser.open(f"{server_url}/")
        else:
            if process.poll() is None:
                print(f"[WARN] Startup check timed out, attempting to open browser anyway...")
                webbrowser.open(f"{server_url}/")
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
