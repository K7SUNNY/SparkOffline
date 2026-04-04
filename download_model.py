import os
from huggingface_hub import hf_hub_download

# Define model repo and filename
repo_id = "bartowski/Llama-3.2-3B-Instruct-GGUF"
filename = "Llama-3.2-3B-Instruct-Q4_K_M.gguf"

# Define local save path
local_dir = os.path.join(os.getcwd(), "models")
os.makedirs(local_dir, exist_ok=True)

print(f"Downloading {filename} from {repo_id}...")
print(f"This is a ~2GB file, please be patient...")

try:
    file_path = hf_hub_download(
        repo_id=repo_id,
        filename=filename,
        local_dir=local_dir,
        local_dir_use_symlinks=False # Ensure the actual file is downloaded, not just a symlink
    )
    print(f"\nSuccess! Model downloaded to: {file_path}")
except Exception as e:
    print(f"\nError downloading model: {e}")
