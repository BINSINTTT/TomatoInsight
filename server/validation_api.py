"""
Local proxy for Ultralytics validation, classification, and severity segmentation.
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
from severity.ultralytics_segmentation import assess_with_ultralytics_segmentation

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
ULTRALYTICS_SEVERITY_URL = _predict_url(
    os.environ.get(
        "ULTRALYTICS_SEVERITY_URL",
        "https://predict-6af4d8cb3a83009cbe9bd1ba-dproatj77a-de.a.run.app",
    )
)
ULTRALYTICS_SEVERITY_API_KEY = (
    os.environ.get("ULTRALYTICS_SEVERITY_API_KEY", "").strip() or ULTRALYTICS_API_KEY
)
ULTRALYTICS_SEVERITY_CONF = float(os.environ.get("ULTRALYTICS_SEVERITY_CONF", "0.25"))
ULTRALYTICS_SEVERITY_IOU = float(os.environ.get("ULTRALYTICS_SEVERITY_IOU", "0.5"))
ULTRALYTICS_SEVERITY_IMGSZ = int(os.environ.get("ULTRALYTICS_SEVERITY_IMGSZ", "640"))

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
            "severity_model": "ultralytics_segmentation",
            "severity_url": ULTRALYTICS_SEVERITY_URL,
            "severity_configured": bool(ULTRALYTICS_SEVERITY_URL and ULTRALYTICS_SEVERITY_API_KEY),
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


@app.route("/assess-severity", methods=["POST"])
def assess_severity_route():
    """
    Measure symptom extent with the trained Ultralytics segmentation model.

    Classification identifies the disease only. Severity is computed from the
    matching symptom-mask area divided by leaf-mask area. Multipart fields:
    file + disease|bar_key. Classification confidence is never converted into
    severity.
    """
    uploaded = request.files.get("file")
    if uploaded is None or uploaded.filename == "":
        return jsonify({"error": "missing_file", "message": "Send multipart field named file."}), 400

    image_bytes = uploaded.read()
    if not image_bytes:
        return jsonify({"error": "empty_file", "message": "Uploaded file is empty."}), 400

    disease = (
        request.form.get("disease")
        or request.form.get("bar_key")
        or request.form.get("barKey")
        or ""
    ).strip()

    result = assess_with_ultralytics_segmentation(
        image_bytes,
        uploaded.content_type,
        disease,
        ULTRALYTICS_SEVERITY_URL,
        ULTRALYTICS_SEVERITY_API_KEY,
        conf=ULTRALYTICS_SEVERITY_CONF,
        iou=ULTRALYTICS_SEVERITY_IOU,
        imgsz=ULTRALYTICS_SEVERITY_IMGSZ,
    )
    status = 200 if result.get("ok") else 502 if result.get("error") == "upstream" else 500
    return jsonify(result), status


@app.route("/recommend", methods=["POST"])
def recommend():
    body = request.get_json(silent=True) or {}
    scores = body.get("scores")
    if not isinstance(scores, dict):
        return jsonify(
            {
                "error": "invalid_body",
                "message": 'Send JSON: { "scores": { "healthy": 0, "tlcv": 0, "early_blight": 0, "spotted_wilt": 0 }, "severity_pct": 0 }',
            }
        ), 400

    severity_raw = body.get("severity_pct", body.get("severityPct"))
    try:
        severity_pct = float(severity_raw) if severity_raw is not None and severity_raw != "" else None
    except (TypeError, ValueError):
        severity_pct = None

    severity_label = body.get("severity_label") or body.get("severityLabel") or body.get("severity")
    if isinstance(severity_label, str):
        severity_label = severity_label.strip() or None
    else:
        severity_label = None

    result = fetch_care_recommendation(scores, severity_pct, severity_label)
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
    if path.startswith(
        ("validate", "classify", "recommend", "health", "assess-severity")
    ):
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
