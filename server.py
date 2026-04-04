import json
import logging
import os
import time

from flask import Flask, Response, jsonify, request
from flask_cors import CORS
from llama_cpp import Llama

app = Flask(__name__)

# Local-only CORS policy for browser-based development.
CORS(
    app,
    resources={
        r"/v1/*": {
            "origins": [
                r"^https?://localhost(:\d+)?$",
                r"^https?://127\.0\.0\.1(:\d+)?$",
                "null",
            ]
        }
    },
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger("sparkv2-backend")

# Configuration for Llama-3.2-3B GGUF
# This points directly to the file downloaded by download_model.py
MODEL_PATH = os.path.join(os.getcwd(), "models", "Llama-3.2-3B-Instruct-Q4_K_M.gguf")

DEFAULT_TEMPERATURE = 0.7
DEFAULT_MAX_NEW_TOKENS = 512
MAX_ALLOWED_NEW_TOKENS = 4096
ALLOWED_ROLES = {"system", "user", "assistant"}

def parse_generation_config(payload):
    temperature = payload.get("temperature", DEFAULT_TEMPERATURE)
    max_new_tokens = payload.get("max_tokens", DEFAULT_MAX_NEW_TOKENS)

    try:
        temperature = float(temperature)
    except (TypeError, ValueError):
        return None, None, "temperature must be a number"

    try:
        max_new_tokens = int(max_new_tokens)
    except (TypeError, ValueError):
        return None, None, "max_tokens must be an integer"

    if not 0 <= temperature <= 2:
        return None, None, "temperature must be between 0 and 2"

    if not 1 <= max_new_tokens <= MAX_ALLOWED_NEW_TOKENS:
        return None, None, f"max_tokens must be between 1 and {MAX_ALLOWED_NEW_TOKENS}"

    return temperature, max_new_tokens, None


def validate_messages(messages):
    if not isinstance(messages, list) or not messages:
        return None, "messages must be a non-empty array"

    cleaned_messages = []
    for idx, message in enumerate(messages):
        if not isinstance(message, dict):
            return None, f"messages[{idx}] must be an object"

        role = message.get("role")
        content = message.get("content")

        if role not in ALLOWED_ROLES:
            return None, f"messages[{idx}].role must be one of: {sorted(ALLOWED_ROLES)}"

        if not isinstance(content, str):
            return None, f"messages[{idx}].content must be a string"

        cleaned_messages.append({"role": role, "content": content})

    return cleaned_messages, None


# Load model with llama.cpp
# Optimization Note: n_gpu_layers=15 (out of ~28 total for 3B) attempts to fit ~1.2GB onto the 2GB MX350,
# leaving VRAM headroom for Windows UI and context window, preventing CUDA out-of-memory errors.
try:
    logger.info("Loading GGUF model: %s", MODEL_PATH)
    if not os.path.exists(MODEL_PATH):
        logger.error("Model file not found! Did you run `python download_model.py`?")
        raise FileNotFoundError(f"Model file not found at {MODEL_PATH}")

    # Initialize Llama.cpp backend
    model = Llama(
        model_path=MODEL_PATH,
        # MX350 2GB limit. 3B model has 28 layers. 
        # Offloading ~15 layers uses roughly 1GB VRAM. 
        # Tweak this up or down depending on task manager VRAM usage.
        n_gpu_layers=15, 
        # Context window. Higher context = higher VRAM usage. Keep it tight for 8GB RAM + 2GB VRAM.
        n_ctx=2048,
        # Thread count (CPU optimization)
        n_threads=4,
        verbose=True
    )
    logger.info("Model loaded successfully")
except Exception as exc:
    logger.exception("Failed to load model: %s", exc)
    logger.error("=" * 60)
    logger.error("CRITICAL ERROR: Failed to load Llama.cpp model.")
    logger.error("Ensure you ran download_model.py and the .gguf file exists in ./models.")
    logger.error("=" * 60)
    raise SystemExit(1) from exc


@app.route("/v1/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "model_loaded": model is not None})


@app.route("/v1/cleanup", methods=["POST"])
def cleanup():
    # llama.cpp manages its own memory primarily, but we can return OK
    return jsonify({"status": "cleanup complete (llama.cpp auto-manages memory)"})


@app.route("/v1/chat/completions", methods=["POST"])
def chat_completions():
    try:
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return jsonify({"error": "Invalid JSON body"}), 400

        messages, messages_error = validate_messages(data.get("messages"))
        if messages_error:
            return jsonify({"error": messages_error}), 400

        stream = bool(data.get("stream", False))
        temperature, max_new_tokens, generation_error = parse_generation_config(data)
        if generation_error:
            return jsonify({"error": generation_error}), 400

        # Create completion parameters for Llama.cpp
        # It handles the Chat Template natively if we use create_chat_completion
        if stream:
            def generate():
                streamer = model.create_chat_completion(
                    messages=messages,
                    max_tokens=max_new_tokens,
                    temperature=temperature,
                    stream=True
                )
                
                for output in streamer:
                    # Output is already in the OpenAI format `offline-api.js` expects
                    # It looks like: {"id": "...", "object": "chat.completion.chunk", ...}
                    try:
                        delta = output["choices"][0]["delta"]
                        if "content" in delta:
                            chunk = {
                                "id": "chatcmpl-local-gguf",
                                "object": "chat.completion.chunk",
                                "created": int(time.time()),
                                "model": "local-llama-cpp",
                                "choices": [{"delta": {"content": delta["content"]}, "index": 0, "finish_reason": None}],
                            }
                            yield f"data: {json.dumps(chunk)}\n\n"
                    except (KeyError, IndexError) as e:
                        continue

                yield "data: [DONE]\n\n"

            headers = {
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
                "Content-Type": "text/event-stream"
            }
            return Response(generate(), headers=headers)

        else:
            # Non-streaming response
            response = model.create_chat_completion(
                messages=messages,
                max_tokens=max_new_tokens,
                temperature=temperature,
                stream=False
            )
            return jsonify(response)

    except Exception as exc:
        logger.exception("Generation failed: %s", exc)
        return jsonify({"error": str(exc)}), 500


if __name__ == "__main__":
    host = os.getenv("SPARK_HOST", "127.0.0.1")
    port = int(os.getenv("SPARK_PORT", "5000"))
    logger.info("Starting SparkV2 Optimized Offline Backend on http://%s:%s", host, port)
    logger.info("Open the UI in your browser to start chatting!")
    app.run(host=host, port=port, debug=False, threaded=True)
