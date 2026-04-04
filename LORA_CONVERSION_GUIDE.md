# LoRA GGUF Conversion Guide

To use your custom LoRA adapter `Spark_Llama3.2_v1` with the new optimized `server.py`, we need to convert it into a GGUF adapter.

Because `llama.cpp` tools change rapidly, the most reliable way to convert it locally is using the official `llama.cpp` conversion scripts.

## Step 1: Clone `llama.cpp`
Open your standard PowerShell (or command prompt), navigate to a folder where you keep code (e.g., your desktop or the Sparkoffline folder), and clone the repository:

```powershell
git clone https://github.com/ggerganov/llama.cpp.git
cd llama.cpp
```

## Step 2: Install Conversion Dependencies
Install the required python packages for the conversion scripts:

```powershell
pip install -r requirements.txt
```

## Step 3: Run the Conversion Script
Now, run the `convert_lora_to_gguf.py` script, pointing it to your adapter folder. Assuming you are running this from inside the `llama.cpp` directory, and your Sparkoffline folder is on your desktop:

```powershell
python convert_lora_to_gguf.py c:\Users\Acer\Desktop\Sparkoffline\models\Spark_Llama3.2_v1 --outfile c:\Users\Acer\Desktop\Sparkoffline\models\Spark_Llama3.2_v1.gguf
```

## Step 4: Update `server.py`
Once the conversion is done and you have `Spark_Llama3.2_v1.gguf`, you simply need to load it in `server.py` when initializing `llama_cpp`.

In `server.py`, find the `model = Llama(...)` initialization and add a `lora_path` argument:

```python
    # Initialize Llama.cpp backend
    model = Llama(
        model_path=MODEL_PATH,
        lora_path=os.path.join(os.getcwd(), "models", "Spark_Llama3.2_v1.gguf"),
        n_gpu_layers=15, 
        n_ctx=2048,
        n_threads=4,
        verbose=True
    )
```

**Note**: Loading a GGUF LoRA adapter relies on the exact architecture matching the base GGUF. If the conversion fails or causes weird output, the easiest path forward is often to use the base `Llama-3.2-3B-Instruct` model alone, which is already highly capable.
