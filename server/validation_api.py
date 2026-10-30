"""
Local proxy for Ultralytics image validation and disease classification.
Run: python validation_api.py
Then open the site via http://127.0.0.1:8765/.
"""

from __future__ import annotations

import os
from pathlib import Path

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

from groq.recommendations import fetch_care_recommendation, groq_is_configured

ROOT = Path(__file__).resolve().parent.parent
HTML_DIR = ROOT / "html"
DEBUG_DIR = Path(__file__).resolve().parent / "debug"
LOCAL_STORAGE_SNAPSHOT = DEBUG_DIR / "local-storage-snapshot.txt"
load_dotenv(ROOT / "server" / ".env", override=True)

def _predict_url(raw: str) -> str:
    url = (raw or "").strip().rstrip("/")
    if url and not url.endswith("/predict"):
        url = f"{url}/predict"
    return url


PORT = int(os.environ.get("VALIDATION_API_PORT", "8765"))
ULTRALYTICS_PREDICT_URL = _predict_url(os.environ.get("ULTRALYTICS_PREDICT_URL", ""))
ULTRALYTICS_API_KEY = os.environ.get("ULTRALYTICS_API_KEY", "").strip()
ULTRALYTICS_VALIDATION_URL = _predict_url(
    os.environ.get(
        "ULTRALYTICS_VALIDATION_URL",
        "https://predict-6ae37ce0bbd46ce898ad6e66-dproatj77a-df.a.run.app",
    )
)
ULTRALYTICS_VALIDATION_API_KEY = (
    os.environ.get("ULTRALYTICS_VALIDATION_API_KEY", "").strip() or ULTRALYTICS_API_KEY
)

app = Flask(__name__)
CORS(app)


@app.route("/health", methods=["GET"])
def health():
    return jsonify(
        {
            "status": "ok",
            "validation_model": "ultralytics",
            "validation_url": ULTRALYTICS_VALIDATION_URL,
            "validation_configured": bool(ULTRALYTICS_VALIDATION_URL and ULTRALYTICS_VALIDATION_API_KEY),
            "ultralytics_configured": bool(ULTRALYTICS_PREDICT_URL and ULTRALYTICS_API_KEY),
            "groq_configured": groq_is_configured(),
        }
    )


def _bearer_from_request() -> str:
    header = request.headers.get("Authorization", "").strip()
    if header.lower().startswith("bearer "):
        return header[7:].strip()
    return ""


def _forward_ultralytics(url: str, api_key: str, missing_message: str):
    if not url or not api_key:
        return jsonify({"error": "missing_config", "message": missing_message}), 500

    uploaded = request.files.get("file")
    if uploaded is None or uploaded.filename == "":
        return jsonify({"error": "missing_file", "message": "Send multipart field named file."}), 400

    image_bytes = uploaded.read()
    if not image_bytes:
        return jsonify({"error": "empty_file", "message": "Uploaded file is empty."}), 400

    data = {
        key: request.form[key].strip()
        for key in ("conf", "iou", "imgsz")
        if request.form.get(key, "").strip()
    }
    files = {
        "file": (
            uploaded.filename or "upload.jpg",
            image_bytes,
            uploaded.content_type or "application/octet-stream",
        )
    }

    try:
        response = requests.post(
            url,
            data=data,
            files=files,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=120,
        )
    except requests.RequestException as exc:
        return jsonify({"error": "upstream", "message": str(exc)}), 502

    try:
        payload = response.json()
    except ValueError:
        payload = {"error": "invalid_json", "message": response.text[:500]}

    return jsonify(payload), response.status_code


@app.route("/validate", methods=["POST"])
def validate():
    return _forward_ultralytics(
        ULTRALYTICS_VALIDATION_URL,
        ULTRALYTICS_VALIDATION_API_KEY,
        "Set ULTRALYTICS_VALIDATION_URL and ULTRALYTICS_VALIDATION_API_KEY in server/.env.",
    )


@app.route("/classify", methods=["POST"])
def classify():
    return _forward_ultralytics(
        ULTRALYTICS_PREDICT_URL,
        ULTRALYTICS_API_KEY,
        "Set ULTRALYTICS_PREDICT_URL and ULTRALYTICS_API_KEY in server/.env.",
    )


@app.route("/recommend", methods=["POST"])
def recommend():
    body = request.get_json(silent=True) or {}
    scores = body.get("scores")
    if not isinstance(scores, dict):
        return jsonify(
            {
                "error": "invalid_body",
                "message": 'Send JSON: { "scores": { "healthy": 0, "tlcv": 0, "early_blight": 0, "spotted_wilt": 0 } }',
            }
        ), 400

    result = fetch_care_recommendation(scores)
    if not result.get("ok"):
        return jsonify(result), 400

    return jsonify(
        {
            "ok": True,
            "top": result.get("top"),
            "scores": result.get("scores"),
            "guide": result.get("guide"),
            "groq_used": result.get("groq_used", False),
            "model": result.get("model"),
            "error": result.get("error"),
            "detail": result.get("detail"),
            "message": result.get("message"),
        }
    )


@app.route("/debug/local-storage-snapshot", methods=["POST"])
def debug_local_storage_snapshot():
    """Dev-only: write browser localStorage export for viewing in Notepad."""
    if request.remote_addr not in ("127.0.0.1", "::1"):
        return jsonify({"error": "forbidden"}), 403
    DEBUG_DIR.mkdir(parents=True, exist_ok=True)
    body = request.get_data(as_text=True) or ""
    LOCAL_STORAGE_SNAPSHOT.write_text(body, encoding="utf-8")
    return jsonify({"ok": True, "path": str(LOCAL_STORAGE_SNAPSHOT)})


@app.route("/", methods=["GET"])
def site_root():
    # Separate from the catch-all so /landing.html is not treated as an alias of /
    # (Flask would 308-redirect it, and the landing page looks like it just reloaded).
    return send_from_directory(HTML_DIR, "landing.html")


@app.route("/<path:path>", methods=["GET"])
def static_files(path: str):
    if path.startswith("validate") or path.startswith("classify") or path.startswith("recommend") or path.startswith("health"):
        return jsonify({"error": "not_found"}), 404

    root_target = ROOT / path
    if root_target.is_file() and path.startswith(("js/", "css/", "img/")):
        return send_from_directory(ROOT, path)

    html_target = HTML_DIR / path
    if html_target.is_file():
        return send_from_directory(HTML_DIR, path)

    if root_target.is_file():
        return send_from_directory(ROOT, path)

    # Do not send the dashboard HTML for a missing script or stylesheet.
    if "." not in Path(path).name and (HTML_DIR / "index.html").is_file():
        return send_from_directory(HTML_DIR, "index.html")
    return jsonify({"error": "not_found"}), 404


if __name__ == "__main__":
    print(f"Tomato Insight validation API + static site on http://127.0.0.1:{PORT}/")
    app.run(host="127.0.0.1", port=PORT, debug=False)
