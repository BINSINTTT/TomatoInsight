"""Refine Early Blight/Spotted Wilt classification with a segmentation model."""

from __future__ import annotations

from typing import Any

import requests

from severity.ultralytics_segmentation import summarize_segmentation

PAIR = ("early_blight", "spotted_wilt")
ALL_DISEASES = ("healthy", "tlcv", *PAIR)


def _score(value: Any) -> float:
    try:
        return min(100.0, max(0.0, float(value)))
    except (TypeError, ValueError):
        return 0.0


def _normalized_scores(raw: Any) -> dict[str, float]:
    source = raw if isinstance(raw, dict) else {}
    return {key: _score(source.get(key)) for key in ALL_DISEASES}


def refine_scores_from_segmentation(
    payload: dict[str, Any],
    main_scores: dict[str, Any],
    *,
    specialist_weight: float = 0.65,
    minimum_confidence: float = 0.5,
    minimum_margin: float = 0.1,
) -> dict[str, Any]:
    """Fuse specialist mask confidence with the main classifier's disease pair."""
    scores = _normalized_scores(main_scores)
    leading = max(scores, key=scores.get)
    base = {
        "ok": True,
        "applied": False,
        "scores": scores,
        "original_scores": scores.copy(),
        "source": "ultralytics_specialist_segmentation",
    }
    if leading not in PAIR:
        return {**base, "reason": "specialist_not_needed", "final_disease": leading}

    metadata = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}
    task = str(metadata.get("task") or "").lower().replace("_", "").replace("-", "")
    if task and task not in {"segment", "segmentation", "instancesegmentation"}:
        return {
            **base,
            "reason": "invalid_specialist_model_task",
            "expected_task": "segment",
            "actual_task": metadata.get("task"),
            "final_disease": leading,
        }

    summary = summarize_segmentation(payload)
    confidences = {
        key: min(1.0, max(0.0, float(summary["max_confidence"].get(key, 0.0))))
        for key in PAIR
    }
    total_confidence = sum(confidences.values())
    winner = max(PAIR, key=confidences.get)
    winner_confidence = confidences[winner]
    relative = {
        key: (confidences[key] / total_confidence if total_confidence > 0 else 0.0)
        for key in PAIR
    }
    margin = abs(relative[PAIR[0]] - relative[PAIR[1]])
    evidence = {
        "confidence": confidences,
        "relative_scores": {key: round(relative[key] * 100.0, 2) for key in PAIR},
        "polygon_counts": {key: summary["counts"].get(key, 0) for key in PAIR},
        "polygon_areas": {key: round(float(summary["areas"].get(key, 0.0)), 6) for key in PAIR},
        "leaf_polygon_count": summary["counts"].get("leaf", 0),
        "winner": winner,
        "winner_confidence": round(winner_confidence, 6),
        "margin": round(margin, 6),
    }
    if total_confidence <= 0:
        return {**base, "reason": "no_specialist_symptom_masks", "evidence": evidence, "final_disease": leading}
    if winner_confidence < minimum_confidence:
        return {**base, "reason": "specialist_confidence_too_low", "evidence": evidence, "final_disease": leading}
    if margin < minimum_margin:
        return {**base, "reason": "specialist_result_ambiguous", "evidence": evidence, "final_disease": leading}

    weight = min(1.0, max(0.0, float(specialist_weight)))
    pair_total = scores[PAIR[0]] + scores[PAIR[1]]
    if pair_total <= 0:
        pair_total = 100.0
    main_relative = {key: scores[key] / pair_total for key in PAIR}
    fused_relative = {
        key: (1.0 - weight) * main_relative[key] + weight * relative[key]
        for key in PAIR
    }
    fused = scores.copy()
    for key in PAIR:
        fused[key] = round(pair_total * fused_relative[key], 1)
    final_disease = max(fused, key=fused.get)
    return {
        **base,
        "applied": True,
        "reason": "specialist_scores_fused",
        "scores": fused,
        "final_disease": final_disease,
        "specialist_weight": weight,
        "evidence": evidence,
        "model": metadata.get("model", metadata.get("modelName", metadata.get("model_name"))),
    }


def refine_with_ultralytics_segmentation(
    image_bytes: bytes,
    content_type: str | None,
    main_scores: dict[str, Any],
    predict_url: str,
    api_key: str,
    *,
    conf: float = 0.25,
    iou: float = 0.5,
    imgsz: int = 640,
    specialist_weight: float = 0.65,
    minimum_confidence: float = 0.5,
    minimum_margin: float = 0.1,
    timeout: int = 120,
) -> dict[str, Any]:
    scores = _normalized_scores(main_scores)
    leading = max(scores, key=scores.get)
    if leading not in PAIR:
        return {"ok": True, "applied": False, "reason": "specialist_not_needed", "scores": scores, "final_disease": leading}
    if not predict_url or not api_key:
        return {"ok": True, "applied": False, "reason": "specialist_model_not_configured", "scores": scores, "final_disease": leading}

    try:
        response = requests.post(
            predict_url,
            headers={"Authorization": f"Bearer {api_key}"},
            data={"conf": str(conf), "iou": str(iou), "imgsz": str(imgsz), "normalize": "true"},
            files={"file": ("upload.jpg", image_bytes, content_type or "application/octet-stream")},
            timeout=timeout,
        )
    except requests.RequestException as exc:
        return {"ok": True, "applied": False, "reason": "specialist_model_unreachable", "scores": scores, "final_disease": leading, "message": str(exc)}

    try:
        payload = response.json()
    except ValueError:
        payload = {}
    if not response.ok or not isinstance(payload, dict):
        return {"ok": True, "applied": False, "reason": "specialist_model_error", "scores": scores, "final_disease": leading, "upstream_status": response.status_code}

    result = refine_scores_from_segmentation(
        payload,
        scores,
        specialist_weight=specialist_weight,
        minimum_confidence=minimum_confidence,
        minimum_margin=minimum_margin,
    )
    result["endpoint_status"] = response.status_code
    return result
