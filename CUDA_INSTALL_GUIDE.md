# Installing `llama-cpp-python` with CUDA (Nvidia MX350) Support on Windows

Your MX350 has 2GB of VRAM. To utilize this VRAM and dramatically speed up the AI (and save your system RAM), we must compile `llama.cpp` with Nvidia CUBLAS support.

## Prerequisites
1. **Nvidia CUDA Toolkit**: You must have the CUDA toolkit installed. 
   - Download it from Nvidia's website if you don't have it: https://developer.nvidia.com/cuda-downloads
2. **Visual Studio C++ Build Tools**: Required for compiling the C++ code.
   - Download from Microsoft: https://visualstudio.microsoft.com/visual-cpp-build-tools/
   - During installation, make sure "Desktop development with C++" is checked.

## Installation Steps
Open your PowerShell terminal (make sure your `.venv` is activated) and run these exact commands:

```powershell
# 1. Uninstall any existing CPU-only version
pip uninstall llama-cpp-python -y

# 2. Set environment variables to tell the compiler to use Nvidia CUDA
$env:CMAKE_ARGS="-DGGML_CUDA=on"
$env:FORCE_CMAKE="1"

# 3. Install the package (This will take a few minutes as it compiles C++ code)
pip install llama-cpp-python --upgrade --force-reinstall --no-cache-dir
```

## Verification
After installation, you can verify it's using the GPU by running the new `server.py` (once we write it). You should see `ggml_cuda` messages in the console regarding your MX350.
