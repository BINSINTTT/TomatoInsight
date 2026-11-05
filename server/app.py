"""
TomatoInsight API — leaf validation, disease classification, and care recommendations.

Stage 1: Ultralytics leaf model (TomatoLeaf / NonTomatoLeaf). Same deployment as the website.
Stage 2: Ultralytics disease model (Early blight, Spotted wilt, Yellow leaf curl virus, Healthy).
Stage 3: Groq — same leaf-care recommendation model as the website (openai/gpt-oss-20b).

Disease scoring runs only when the top leaf class is TomatoLeaf.
"""

from __future__ import annotations

import base64
import json
import os
import re
import time
from typing import Any, Dict, List, Optional, Set

import certifi
import httpx
import requests
from requests.adapters import HTTPAdapter
from requests.exceptions import ConnectionError as RequestsConnectionError
from requests.exceptions import RequestException, SSLError
from urllib3.util.retry import Retry
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from groq_recommendations import fetch_care_recommendation, groq_is_configured

load_dotenv()

app = Flask(__name__)

ROBOFLOW_API_KEY = os.environ.get("ROBOFLOW_API_KEY", "")
ROBOFLOW_WORKFLOW_PATH = os.environ.get(
    "ROBOFLOW_WORKFLOW_PATH",
    "vincent-vfqqy/workflows/tomatoinsightimagevalidation",
)
ROBOFLOW_WORKFLOW_URL = f"https://serverless.roboflow.com/{ROBOFLOW_WORKFLOW_PATH}"

TOMATO_CLASS_NAMES = {
    name.strip().lower()
    for name in os.environ.get( 
        "TOMATO_CLASS_NAMES", "TomatoInsightImageValidation"
    ).split(",")
    if name.strip()
}
VALIDATOR_MIN_CONFIDENCE = float(os.environ.get("VALIDATOR_MIN_CONFIDENCE", "0.50"))
# Match Roboflow website slider (0-100). Sent when using direct detect API.
ROBOFLOW_CONFIDENCE_PERCENT = int(os.environ.get("ROBOFLOW_CONFIDENCE_PERCENT", "80"))
ROBOFLOW_OVERLAP_PERCENT = int(os.environ.get("ROBOFLOW_OVERLAP_PERCENT", "50"))

# Optional: use direct model API (same as Roboflow "Test" tab) instead of workflow.
ROBOFLOW_DETECT_PROJECT = os.environ.get("ROBOFLOW_DETECT_PROJECT", "")
ROBOFLOW_DETECT_VERSION = os.environ.get("ROBOFLOW_DETECT_VERSION", "")

# Stage 2 — Ultralytics Deploy disease classification
def normalize_ultralytics_url(url: str) -> str:
    cleaned = (url or "").strip().rstrip("/")
    if not cleaned:
        return ""
    if not cleaned.endswith("/predict"):
        cleaned = f"{cleaned}/predict"
    return cleaned


ULTRALYTICS_PREDICT_URL = normalize_ultralytics_url(
    os.environ.get("ULTRALYTICS_PREDICT_URL", "")
)
ULTRALYTICS_API_KEY = os.environ.get("ULTRALYTICS_API_KEY", "").strip()
ULTRALYTICS_VALIDATION_URL = normalize_ultralytics_url(
    os.environ.get("ULTRALYTICS_VALIDATION_URL", "")
)
ULTRALYTICS_VALIDATION_API_KEY = os.environ.get("ULTRALYTICS_VALIDATION_API_KEY", "").strip()
ULTRALYTICS_REQUEST_RETRIES = int(os.environ.get("ULTRALYTICS_REQUEST_RETRIES", "3"))
# Low threshold so Ultralytics returns ALL class probabilities, not just the top one.
DISEASE_MIN_CONFIDENCE = float(os.environ.get("DISEASE_MIN_CONFIDENCE", "0.01"))
DISEASE_IMGSZ = int(os.environ.get("DISEASE_IMGSZ", "640"))
DISEASE_IOU = float(os.environ.get("DISEASE_IOU", "0.7"))

DISEASE_CLASSES = [
    name.strip()
    for name in os.environ.get(
        "DISEASE_CLASSES",
        "Early blight,Spotted wilt,Yellow leaf curl virus,Healthy",
    ).split(",")
    if name.strip()
]

# Stage 3 — Groq care recommendations. Same model and prompt as the website.
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "").strip()

AI_DISCLAIMER = (
    "AI-assisted guidance. Confirm the symptoms on the plant before treatment."
)

SCORE_BAR_KEYS = ("healthy", "tlcv", "early_blight", "spotted_wilt")

def confidence_to_percent(confidence: float) -> int:
    if confidence <= 1.0:
        return int(round(confidence * 100))
    return int(round(confidence))


def sanitize_error_for_client(message: str) -> str:
    """Never send API keys or full request URLs to the mobile app."""
    cleaned = message or ""
    if GROQ_API_KEY:
        cleaned = cleaned.replace(GROQ_API_KEY, "[REDACTED]")
    cleaned = re.sub(r"key=AIza[A-Za-z0-9_\-]+", "key=[REDACTED]", cleaned)
    cleaned = re.sub(r"https?://[^\s]+", "[request-url-redacted]", cleaned)
    return cleaned.strip()


def prediction_bar_key(name: str) -> Optional[str]:
    """Map a disease class name onto the website score keys."""
    key = re.sub(r"[^a-z0-9]", "", str(name).lower())
    if not key:
        return None
    if "healthy" in key:
        return "healthy"
    if "curl" in key or key in {"tlcv", "tylcv"} or "yellowleaf" in key:
        return "tlcv"
    if "earlyblight" in key or "blight" in key:
        return "early_blight"
    if "spottedwilt" in key or key == "tswv" or "wilt" in key:
        return "spotted_wilt"
    return None


def scores_from_predictions(predictions: List[Dict[str, Any]]) -> Dict[str, float]:
    scores = {key: 0.0 for key in SCORE_BAR_KEYS}
    for item in predictions:
        name = str(item.get("class") or item.get("class_name") or "").strip()
        bar_key = prediction_bar_key(name)
        if not bar_key:
            continue
        scores[bar_key] = float(confidence_to_percent(float(item.get("confidence", 0))))
    return scores


def generate_groq_recommendations(
    predictions: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Ask Groq for the same care guide the website shows."""
    base: Dict[str, Any] = {
        "ai_disclaimer": AI_DISCLAIMER,
        "ai_recommendations": None,
        "ai_recommendation_error": None,
        "recommendation_source": None,
        "groq_model": None,
    }
    result = fetch_care_recommendation(scores_from_predictions(predictions))
    if not result.get("ok"):
        base["ai_recommendation_error"] = sanitize_error_for_client(
            str(result.get("message") or "No classification scores for a recommendation.")
        )
        return base

    guides = result.get("guides") or []
    if not guides and result.get("guide"):
        guides = [result["guide"]]
    detected = result.get("detected") or []
    sections = []
    for index, guide in enumerate(guides):
        if not isinstance(guide, dict):
            continue
        match = detected[index] if index < len(detected) else {}
        try:
            percent = int(round(float(match.get("pct") if match else 0) or 0))
        except (TypeError, ValueError):
            percent = 0
        if percent <= 0:
            top = result.get("top") or {}
            try:
                percent = int(round(float(top.get("pct") or 0)))
            except (TypeError, ValueError):
                percent = 0
        disease_name = str(guide.get("diseaseName") or "").strip() or None
        summary = str(guide.get("summary") or "").strip()
        urgency = str(guide.get("urgencyNote") or "").strip()
        sections.append(
            {
                "disease": disease_name,
                "confidence_percent": percent,
                "urgency": urgency,
                "summary": summary,
                "steps": guide.get("actionSteps") or [],
                "prevention": guide.get("preventionTips") or [],
                "is_critical_removal": bool(guide.get("isCriticalRemoval")),
            }
        )
    if not sections:
        base["ai_recommendation_error"] = sanitize_error_for_client(
            "No care recommendations were produced for the detected scores."
        )
        return base

    primary = sections[0]
    note = primary.get("summary") or ""
    if len(sections) > 1:
        names = [
            f"{item.get('disease') or 'Condition'} ({item.get('confidence_percent') or 0}%)"
            for item in sections
        ]
        note = "Care steps for every detection: " + " · ".join(names)
    base["ai_recommendations"] = {
        "primary_disease": primary.get("disease"),
        "combined_note": note,
        "sections": sections,
    }
    groq_used = bool(result.get("groq_used"))
    base["recommendation_source"] = "groq" if groq_used else "rules"
    base["groq_model"] = result.get("model")
    if groq_used:
        print(
            f"GROQ recommendations OK via {result.get('model')} "
            f"({len(sections)} detection guide(s))"
        )
    else:
        detail = result.get("detail") or result.get("message")
        if detail and not groq_is_configured():
            base["ai_recommendation_error"] = (
                "Groq is not configured. Set GROQ_API_KEY in server/.env, "
                "using the same key as the website."
            )
        elif detail:
            base["ai_recommendation_error"] = sanitize_error_for_client(str(detail))
        print(f"GROQ fallback to built-in guide(s): {detail}")
    return base


def is_detection_prediction(item: Any) -> bool:
    """Real object-detection hits have class + confidence, usually with a box."""
    if not isinstance(item, dict):
        return False
    if "image" in item and "predictions" in item and isinstance(item.get("predictions"), list):
        return False

    has_class = bool(
        item.get("class")
        or item.get("class_name")
        or item.get("label")
    )
    has_confidence = "confidence" in item or "score" in item
    return has_class and has_confidence


def extract_predictions(payload: Any, _seen: Optional[Set[int]] = None) -> List[Dict]:
    """
    Walk Roboflow workflow JSON and collect detection objects.

    Website test JSON looks like:
      { "predictions": [ { "class": "...", "confidence": 0.72, "x": ..., "y": ... } ] }

    Workflow JSON is often nested:
      { "outputs": [ { "predictions": { "predictions": [ {...} ] } } ] }
    """
    found: List[Dict] = []
    if _seen is None:
        _seen = set()

    obj_id = id(payload)
    if obj_id in _seen:
        return found
    _seen.add(obj_id)

    if isinstance(payload, dict):
        if is_detection_prediction(payload):
            found.append(payload)

        nested = payload.get("predictions")
        if isinstance(nested, list):
            found.extend(item for item in nested if is_detection_prediction(item))
        elif isinstance(nested, dict):
            found.extend(extract_predictions(nested, _seen))

        for key, value in payload.items():
            if key == "predictions":
                continue
            if isinstance(value, (dict, list)):
                found.extend(extract_predictions(value, _seen))

    elif isinstance(payload, list):
        for item in payload:
            found.extend(extract_predictions(item, _seen))

    unique: List[Dict] = []
    seen_keys = set()
    for item in found:
        key = (
            item.get("detection_id"),
            item.get("class") or item.get("class_name"),
            item.get("x"),
            item.get("y"),
            item.get("confidence"),
        )
        if key in seen_keys:
            continue
        seen_keys.add(key)
        unique.append(item)
    return unique


def normalize_confidence(value: Any) -> float:
    try:
        confidence = float(value)
    except (TypeError, ValueError):
        return 0.0
    return confidence / 100.0 if confidence > 1.0 else confidence


def prediction_class(item: dict) -> str:
    return str(
        item.get("class")
        or item.get("class_name")
        or item.get("label")
        or ""
    ).strip()


def roboflow_workflow(image_bytes: bytes) -> dict:
    if not ROBOFLOW_API_KEY:
        raise RuntimeError("Missing ROBOFLOW_API_KEY environment variable.")

    image_base64 = base64.b64encode(image_bytes).decode("utf-8")
    body = {
        "inputs": {
            "image": {
                "type": "base64",
                "value": image_base64,
            }
        }
    }

    response = requests.post(
        ROBOFLOW_WORKFLOW_URL,
        json=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {ROBOFLOW_API_KEY}",
        },
        timeout=120,
    )
    response.raise_for_status()
    return response.json()


def roboflow_detect(image_bytes: bytes) -> dict:
    """
    Same tomato-leaf model as the website.
    The confidence slider is sent to Roboflow, so a weak box never comes back.
    An empty predictions list is Roboflow saying this is not a tomato leaf.
    """
    if not ROBOFLOW_API_KEY or not ROBOFLOW_DETECT_PROJECT:
        raise RuntimeError(
            "Missing ROBOFLOW_API_KEY or ROBOFLOW_DETECT_PROJECT for direct detect API."
        )

    url = (
        f"https://detect.roboflow.com/{ROBOFLOW_DETECT_PROJECT}/{ROBOFLOW_DETECT_VERSION}"
    )
    response = requests.post(
        url,
        params={
            "api_key": ROBOFLOW_API_KEY,
            "confidence": ROBOFLOW_CONFIDENCE_PERCENT,
            "overlap": ROBOFLOW_OVERLAP_PERCENT,
        },
        files={"file": ("leaf.jpg", image_bytes, "image/jpeg")},
        timeout=120,
    )
    response.raise_for_status()
    return response.json()


def run_roboflow(image_bytes: bytes) -> dict:
    if ROBOFLOW_DETECT_PROJECT:
        return roboflow_detect(image_bytes)
    return roboflow_workflow(image_bytes)


def disease_metadata() -> dict:
    return {
        "disease_model_url": ULTRALYTICS_PREDICT_URL or "not_configured",
        "disease_min_confidence": DISEASE_MIN_CONFIDENCE,
        "disease_classes": DISEASE_CLASSES,
        "disease_model_configured": bool(ULTRALYTICS_PREDICT_URL and ULTRALYTICS_API_KEY),
        "groq_configured": groq_is_configured(),
        "groq_model": os.environ.get("GROQ_MODEL", "openai/gpt-oss-20b").strip()
        if groq_is_configured()
        else None,
    }


def normalize_disease_key(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", str(name).lower())


def append_disease_result(
    results: List[Dict[str, Any]],
    seen_keys: Set[str],
    name: str,
    confidence: float,
) -> None:
    cleaned_name = name.strip()
    if not cleaned_name:
        return
    key = normalize_disease_key(cleaned_name)
    if key in seen_keys:
        return
    seen_keys.add(key)
    results.append(
        {
            "class": cleaned_name,
            "class_name": cleaned_name,
            "confidence": confidence,
        }
    )


def extract_disease_predictions(payload: Any) -> List[Dict[str, Any]]:
    """Parse Ultralytics Deploy /predict JSON into normalized prediction dicts."""
    results: List[Dict[str, Any]] = []
    seen_keys: Set[str] = set()

    if not isinstance(payload, dict):
        return results

    images = payload.get("images")
    if isinstance(images, list):
        for image in images:
            if not isinstance(image, dict):
                continue
            items = image.get("results")
            if isinstance(items, list):
                for item in items:
                    if not isinstance(item, dict):
                        continue
                    name = str(item.get("name") or item.get("class_name") or item.get("label") or "").strip()
                    confidence = normalize_confidence(
                        item.get("confidence", item.get("score", 0))
                    )
                    append_disease_result(results, seen_keys, name, confidence)

    if isinstance(payload.get("results"), list):
        for item in payload["results"]:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or item.get("class_name") or item.get("label") or "").strip()
            confidence = normalize_confidence(
                item.get("confidence", item.get("score", 0))
            )
            append_disease_result(results, seen_keys, name, confidence)

    results.sort(key=lambda item: item.get("confidence", 0), reverse=True)
    return results


def merge_all_disease_scores(parsed: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Map parsed model output onto all configured disease classes."""
    score_map: Dict[str, Dict[str, Any]] = {}
    for item in parsed:
        name = str(item.get("class") or item.get("class_name") or "").strip()
        if not name:
            continue
        score_map[normalize_disease_key(name)] = item

    merged: List[Dict[str, Any]] = []
    for class_name in DISEASE_CLASSES:
        key = normalize_disease_key(class_name)
        matched = score_map.get(key)
        if matched is None:
            for score_key, item in score_map.items():
                if key in score_key or score_key in key:
                    matched = item
                    break

        confidence = float(matched.get("confidence", 0.0)) if matched else 0.0
        merged.append(
            {
                "class": class_name,
                "class_name": class_name,
                "confidence": confidence,
            }
        )

    merged.sort(key=lambda item: item.get("confidence", 0), reverse=True)
    return merged


def ultralytics_form_data() -> Dict[str, str]:
    return {
        "conf": str(DISEASE_MIN_CONFIDENCE),
        "iou": str(DISEASE_IOU),
        "imgsz": str(DISEASE_IMGSZ),
    }


def ultralytics_auth_headers(api_key: str = "") -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {api_key or ULTRALYTICS_API_KEY}",
        "Connection": "close",
        "User-Agent": "TomatoInsight/1.0",
    }


def call_ultralytics_predict(
    image_bytes: bytes,
    url: str = "",
    api_key: str = "",
    form_data: Optional[Dict[str, str]] = None,
) -> dict:
    """Call one Ultralytics Deploy endpoint. Tries httpx first, then requests."""
    target_url = (url or ULTRALYTICS_PREDICT_URL).strip()
    headers = ultralytics_auth_headers(api_key)
    data = ultralytics_form_data() if form_data is None else form_data
    files = {"file": ("leaf.jpg", image_bytes, "image/jpeg")}
    last_error: Optional[Exception] = None

    try:
        with httpx.Client(
            http2=False,
            verify=certifi.where(),
            timeout=httpx.Timeout(30.0, read=120.0),
        ) as client:
            response = client.post(
                target_url,
                headers=headers,
                data=data,
                files=files,
            )
            response.raise_for_status()
            payload = response.json()
            print("ULTRALYTICS via httpx OK")
            return payload
    except Exception as error:
        last_error = error
        print(f"ULTRALYTICS httpx failed: {error}")

    session = requests.Session()
    retry = Retry(
        total=2,
        connect=2,
        read=2,
        backoff_factor=1,
        allowed_methods=["POST"],
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)
    session.mount("http://", adapter)

    try:
        response = session.post(
            target_url,
            headers=headers,
            data=data,
            files=files,
            timeout=(30, 120),
            verify=certifi.where(),
        )
        response.raise_for_status()
        payload = response.json()
        print("ULTRALYTICS via requests OK")
        return payload
    except Exception as error:
        last_error = error
        print(f"ULTRALYTICS requests failed: {error}")
        raise last_error
    finally:
        session.close()


def classify_disease(image_bytes: bytes) -> dict:
    if not ULTRALYTICS_PREDICT_URL or not ULTRALYTICS_API_KEY:
        return {
            "predictions": [],
            "top_disease": None,
            "top_confidence": 0.0,
            "disease_error": None,
            "message": "Disease classification is not configured on the server.",
            **disease_metadata(),
        }

    last_error: Optional[Exception] = None
    for attempt in range(1, ULTRALYTICS_REQUEST_RETRIES + 1):
        try:
            payload = call_ultralytics_predict(image_bytes)
            parsed = extract_disease_predictions(payload)
            predictions = merge_all_disease_scores(parsed)
            print("ULTRALYTICS PARSED:", len(parsed), "MERGED:", len(predictions))
            for item in predictions:
                print(
                    "  ->",
                    item.get("class"),
                    f"{float(item.get('confidence', 0)) * 100:.1f}%",
                )

            if not parsed:
                return {
                    "predictions": [],
                    "top_disease": None,
                    "top_confidence": 0.0,
                    "disease_error": None,
                    "message": "Disease model returned no predictions.",
                    **disease_metadata(),
                }

            top = predictions[0]
            top_name = top.get("class") or top.get("class_name")
            top_confidence = float(top.get("confidence", 0))

            return {
                "predictions": predictions,
                "top_disease": top_name,
                "top_confidence": top_confidence,
                "disease_error": None,
                "disease_raw": payload,
                "message": (
                    f"Disease detected: {top_name} ({top_confidence * 100:.0f}% confidence)."
                ),
                **disease_metadata(),
            }
        except (SSLError, RequestsConnectionError, RequestException) as error:
            last_error = error
            print(
                f"ULTRALYTICS attempt {attempt}/{ULTRALYTICS_REQUEST_RETRIES} failed: {error}"
            )
            if attempt < ULTRALYTICS_REQUEST_RETRIES:
                time.sleep(attempt * 2)

    error_text = str(last_error) if last_error else "Unknown Ultralytics error."
    if isinstance(last_error, SSLError):
        user_message = (
            "Tomato leaf validated, but disease classification failed due to an SSL/network "
            "error reaching Ultralytics Deploy. Check your internet connection, confirm the "
            "deployment URL in ULTRALYTICS_PREDICT_URL is current, then restart the server."
        )
    else:
        user_message = (
            "Tomato leaf validated, but disease classification failed. "
            "Verify ULTRALYTICS_PREDICT_URL and ULTRALYTICS_API_KEY in server/.env."
        )

    return {
        "predictions": [],
        "top_disease": None,
        "top_confidence": 0.0,
        "disease_error": error_text,
        "message": user_message,
        **disease_metadata(),
    }


def class_key(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", str(name).lower())


def is_rejected_leaf_class(name: str) -> bool:
    """Ultralytics leaf classes are TomatoLeaf and NonTomatoLeaf. Not and Non both reject."""
    key = class_key(name)
    if not key:
        return True
    return (
        "nontomato" in key
        or "nottomato" in key
        or "nonleaf" in key
        or "notleaf" in key
    )


def is_tomato_leaf_class(name: str) -> bool:
    if is_rejected_leaf_class(name):
        return False
    key = class_key(name)
    return key == "tomatoleaf" or ("tomato" in key and "leaf" in key)


def inference_metadata() -> dict:
    return {
        "inference_mode": "ultralytics",
        "model_path": ULTRALYTICS_VALIDATION_URL or "not_configured",
        "min_confidence": VALIDATOR_MIN_CONFIDENCE,
        "validation_model": "ultralytics",
    }


def not_tomato_response(
    message: str,
    confidence: float = 0.0,
    detected_class: Optional[str] = None,
    detection_count: int = 0,
) -> dict:
    return {
        "result": "NotTomato",
        "confidence": confidence,
        "detected_class": detected_class,
        "message": message,
        "predictions": [],
        "stage": "validation_only",
        "detection_count": detection_count,
        **inference_metadata(),
    }


def validate_tomato_leaf(image_bytes: bytes) -> dict:
    if not ULTRALYTICS_VALIDATION_URL or not ULTRALYTICS_VALIDATION_API_KEY:
        raise RuntimeError(
            "Missing ULTRALYTICS_VALIDATION_URL or ULTRALYTICS_VALIDATION_API_KEY."
        )

    payload = call_ultralytics_predict(
        image_bytes,
        url=ULTRALYTICS_VALIDATION_URL,
        api_key=ULTRALYTICS_VALIDATION_API_KEY,
        form_data={},
    )
    predictions = extract_disease_predictions(payload)
    print("LEAF VALIDATION PARSED:", len(predictions))
    for item in predictions[:5]:
        print(
            "  ->",
            item.get("class"),
            f"{float(item.get('confidence', 0)) * 100:.1f}%",
        )

    if not predictions:
        return not_tomato_response(
            "No tomato leaf was detected in this photo. "
            "Please take a clear, close photo of a tomato leaf."
        )

    best = predictions[0]
    detected_class = str(best.get("class") or best.get("class_name") or "").strip()
    confidence = float(best.get("confidence", 0))
    shown = f"{confidence * 100:.1f}%"
    is_tomato = is_tomato_leaf_class(detected_class) and confidence >= VALIDATOR_MIN_CONFIDENCE

    if not is_tomato:
        if is_rejected_leaf_class(detected_class):
            message = (
                f"This photo was labeled {detected_class} at {shown}. "
                "Please take a clear, close photo of a tomato leaf."
            )
        else:
            floor = f"{VALIDATOR_MIN_CONFIDENCE * 100:.0f}%"
            label = detected_class or "The top result"
            message = (
                f"{label} was {shown}, below the {floor} needed for a tomato leaf. "
                "Please retake the photo."
            )
        return not_tomato_response(
            message,
            confidence=confidence,
            detected_class=detected_class or None,
            detection_count=len(predictions),
        )

    disease_result = classify_disease(image_bytes)
    top_disease = disease_result.get("top_disease")
    top_confidence = float(disease_result.get("top_confidence", 0))
    disease_predictions = disease_result.get("predictions", [])
    disease_error = disease_result.get("disease_error")

    if top_disease:
        message = (
            f"Tomato leaf validated. Disease: {top_disease} "
            f"({top_confidence * 100:.0f}% confidence)."
        )
        stage = "validation_and_classification"
    elif disease_error:
        message = disease_result.get("message") or (
            "Tomato leaf validated, but disease classification failed."
        )
        stage = "validation_with_disease_error"
    elif disease_result.get("disease_model_configured"):
        message = (
            "Tomato leaf validated, but disease classification did not return a result. "
            "Please try again with a clearer photo."
        )
        stage = "validation_and_classification"
    else:
        message = (
            "Tomato leaf validated successfully. "
            "Configure ULTRALYTICS_PREDICT_URL and ULTRALYTICS_API_KEY for disease classification."
        )
        stage = "validation_only"

    groq_fields: Dict[str, Any] = {}
    if disease_predictions and top_disease and not disease_error:
        groq_fields = generate_groq_recommendations(disease_predictions)

    return {
        "result": "TomatoLeaf",
        "confidence": confidence,
        "detected_class": detected_class,
        "message": message,
        "predictions": disease_predictions,
        "top_disease": top_disease,
        "top_disease_confidence": top_confidence if top_disease else None,
        "disease_error": disease_error,
        "disease_raw": disease_result.get("disease_raw"),
        "stage": stage,
        "detection_count": len(predictions),
        **inference_metadata(),
        **disease_metadata(),
        **groq_fields,
    }


@app.route("/", methods=["GET"])
def root():
    return jsonify({"status": "ok", "message": "TomatoInsight validation API"})


@app.route("/health", methods=["GET"])
def health():
    return jsonify(
        {
            "status": "ok",
            "stage": "validation_and_classification",
            "validation_model": "ultralytics",
            "validation_url": ULTRALYTICS_VALIDATION_URL or "not_configured",
            "validation_configured": bool(
                ULTRALYTICS_VALIDATION_URL and ULTRALYTICS_VALIDATION_API_KEY
            ),
            "min_confidence": VALIDATOR_MIN_CONFIDENCE,
            "api_key_configured": bool(ULTRALYTICS_VALIDATION_API_KEY),
            **disease_metadata(),
        }
    )


@app.route("/recommend", methods=["POST"])
def recommend():
    """Care guides for every score above 0% (healthy and each disease)."""
    payload = request.get_json(silent=True) or {}
    scores = payload.get("scores") if isinstance(payload, dict) else None
    result = fetch_care_recommendation(scores if isinstance(scores, dict) else None)
    if not result.get("ok"):
        return jsonify(
            {
                "ok": False,
                "message": result.get("message") or "Could not build a care recommendation.",
                "error": result.get("error"),
            }
        ), 400
    return jsonify(
        {
            "ok": True,
            "guide": result.get("guide"),
            "guides": result.get("guides") or [],
            "top": result.get("top"),
            "detected": result.get("detected") or [],
            "scores": result.get("scores"),
            "groq_used": bool(result.get("groq_used")),
            "model": result.get("model"),
            "error": result.get("error"),
            "detail": result.get("detail"),
            "message": result.get("message"),
            "http_status": result.get("http_status"),
        }
    )


@app.route("/validate", methods=["POST"])
def validate():
    if "file" not in request.files:
        return jsonify(
            {
                "result": "Error",
                "confidence": 0.0,
                "detected_class": None,
                "message": "No image file provided. Send multipart field named 'file'.",
                "predictions": [],
                "stage": "validation_only",
            }
        ), 400

    uploaded = request.files["file"]
    if uploaded.filename == "":
        return jsonify(
            {
                "result": "Error",
                "confidence": 0.0,
                "detected_class": None,
                "message": "Empty filename.",
                "predictions": [],
                "stage": "validation_only",
            }
        ), 400

    image_bytes = uploaded.read()
    if not image_bytes:
        return jsonify(
            {
                "result": "Error",
                "confidence": 0.0,
                "detected_class": None,
                "message": "Uploaded file is empty.",
                "predictions": [],
                "stage": "validation_only",
            }
        ), 400

    try:
        return jsonify(validate_tomato_leaf(image_bytes))
    except requests.HTTPError as error:
        detail = error.response.text if error.response is not None else str(error)
        status = error.response.status_code if error.response is not None else "unknown"
        return jsonify(
            {
                "result": "Error",
                "confidence": 0.0,
                "detected_class": None,
                "message": f"Ultralytics request failed (HTTP {status}): {detail}",
                "predictions": [],
                "stage": "validation_only",
            }
        )
    except Exception as error:
        return jsonify(
            {
                "result": "Error",
                "confidence": 0.0,
                "detected_class": None,
                "message": f"Validation error: {error}",
                "predictions": [],
                "stage": "validation_only",
            }
        )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=True)
