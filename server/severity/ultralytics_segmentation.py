"""Ultralytics segmentation-backed tomato disease severity assessment.

The classification model identifies the disease. This module measures the
matching symptom polygon area relative to the detected leaf polygon area. Model
confidence is deliberately never used as a severity percentage.
"""

from __future__ import annotations

import re
from typing import Any, Iterable

import requests

from .thresholds import band_for_affected_pct, thresholds_echo

UNABLE = "Unable to Assess"

LEAF_ALIASES = {"leaf", "tomatoleaf", "healthyleaf", "healthy"}
DISEASE_ALIASES = {
    "early_blight": {
        "earlyblight",
        "earlyblightsymptom",
        "earlyblightvirus",
    },
    "tlcv": {
        "tlcv",
        "tlcvsymptom",
        "tylcv",
        "tylcvsymptom",
        "tomatoyellowleafcurlvirus",
        "yellowleafcurlvirus",
        "yellowleafcurl",
    },
    "spotted_wilt": {
        "spottedwilt",
        "spottedwiltsymptom",
        "spottedwiltvirus",
        "tomatospottedwiltvirus",
        "tswv",
        "tswvsymptom",
    },
}


def _normalize_name(value: Any) -> str:
    return re.sub(r"[^a-z0-9]", "", str(value or "").lower())


def normalize_disease(value: Any) -> str:
    key = _normalize_name(value)
    if key in LEAF_ALIASES:
        return "healthy"
    for disease, aliases in DISEASE_ALIASES.items():
        if key in aliases:
            return disease
    return ""


def _coerce_point(value: Any) -> tuple[float, float] | None:
    if isinstance(value, dict):
        x = value.get("x", value.get("X"))
        y = value.get("y", value.get("Y"))
        try:
            return float(x), float(y)
        except (TypeError, ValueError):
            return None
    if isinstance(value, (list, tuple)) and len(value) >= 2:
        try:
            return float(value[0]), float(value[1])
        except (TypeError, ValueError):
            return None
    return None


def _points_from_value(value: Any) -> list[tuple[float, float]]:
    """Accept Ultralytics polygon variants used by current and older endpoints."""
    if isinstance(value, dict):
        xs = value.get("x")
        ys = value.get("y")
        if isinstance(xs, list) and isinstance(ys, list):
            points: list[tuple[float, float]] = []
            for x, y in zip(xs, ys):
                try:
                    points.append((float(x), float(y)))
                except (TypeError, ValueError):
                    continue
            return points
        for key in ("points", "polygon", "segments", "segment", "coordinates"):
            if key in value:
                return _points_from_value(value[key])
        return []

    if not isinstance(value, (list, tuple)):
        return []

    # Some serializers return [x_coordinates, y_coordinates].
    if (
        len(value) == 2
        and all(isinstance(axis, (list, tuple)) for axis in value)
        and all(isinstance(item, (int, float)) for axis in value for item in axis)
        and len(value[0]) == len(value[1])
        and len(value[0]) >= 3
    ):
        return [(float(x), float(y)) for x, y in zip(value[0], value[1])]

    # A flattened polygon: [x1, y1, x2, y2, ...].
    if value and all(isinstance(item, (int, float)) for item in value):
        points = []
        for index in range(0, len(value) - 1, 2):
            points.append((float(value[index]), float(value[index + 1])))
        return points

    points = []
    for item in value:
        point = _coerce_point(item)
        if point is not None:
            points.append(point)
    return points


def _polygon_from_result(result: dict[str, Any]) -> list[tuple[float, float]]:
    for key in ("segments", "segment", "mask", "polygon", "points"):
        if key in result:
            points = _points_from_value(result[key])
            if len(points) >= 3:
                return points
    return []


def polygon_area(points: Iterable[tuple[float, float]]) -> float:
    vertices = list(points)
    if len(vertices) < 3:
        return 0.0
    twice_area = 0.0
    for index, (x1, y1) in enumerate(vertices):
        x2, y2 = vertices[(index + 1) % len(vertices)]
        twice_area += x1 * y2 - x2 * y1
    return abs(twice_area) / 2.0


def _result_name(result: dict[str, Any], class_names: Any) -> str:
    name = result.get("name", result.get("class_name", result.get("label")))
    if name not in (None, ""):
        return str(name)

    class_id = result.get("class", result.get("class_id"))
    if isinstance(class_id, str) and not class_id.strip().isdigit():
        return class_id
    if isinstance(class_names, dict):
        return str(class_names.get(str(class_id), class_names.get(class_id, "")))
    if isinstance(class_names, list):
        try:
            return str(class_names[int(class_id)])
        except (IndexError, TypeError, ValueError):
            return ""
    return ""


def _iter_results(payload: dict[str, Any]) -> Iterable[tuple[dict[str, Any], Any]]:
    metadata = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}
    default_names = metadata.get("classNames", metadata.get("class_names", {}))

    images = payload.get("images")
    if isinstance(images, list):
        for image in images:
            if not isinstance(image, dict):
                continue
            names = image.get("classNames", image.get("class_names", default_names))
            results = image.get("results", image.get("predictions", []))
            if isinstance(results, list):
                for result in results:
                    if isinstance(result, dict):
                        yield result, names

    for key in ("results", "predictions"):
        rows = payload.get(key)
        if isinstance(rows, list):
            for result in rows:
                if isinstance(result, dict):
                    yield result, default_names


def summarize_segmentation(payload: dict[str, Any]) -> dict[str, Any]:
    """Return polygon areas grouped by TomatoInsight class."""
    areas = {
        "leaf": 0.0,
        "early_blight": 0.0,
        "tlcv": 0.0,
        "spotted_wilt": 0.0,
    }
    counts = {key: 0 for key in areas}
    max_confidence = {key: 0.0 for key in areas}
    recognized = 0

    for result, class_names in _iter_results(payload):
        name = _normalize_name(_result_name(result, class_names))
        if name in LEAF_ALIASES:
            key = "leaf"
        else:
            key = next(
                (disease for disease, aliases in DISEASE_ALIASES.items() if name in aliases),
                "",
            )
        if not key:
            continue

        points = _polygon_from_result(result)
        area = polygon_area(points)
        if area <= 0:
            continue

        recognized += 1
        areas[key] += area
        counts[key] += 1
        try:
            confidence = float(result.get("confidence", result.get("score", 0)) or 0)
        except (TypeError, ValueError):
            confidence = 0.0
        max_confidence[key] = max(max_confidence[key], confidence)

    return {
        "areas": areas,
        "counts": counts,
        "max_confidence": max_confidence,
        "recognized_polygon_count": recognized,
    }


def severity_from_segmentation(payload: dict[str, Any], disease_raw: Any) -> dict[str, Any]:
    disease = normalize_disease(disease_raw)
    if not disease:
        return {
            "ok": False,
            "measurable": False,
            "severity": UNABLE,
            "severity_pct": None,
            "affected_area_pct": None,
            "reason": "unsupported_disease",
        }

    metadata = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}
    task = _normalize_name(metadata.get("task"))
    if task and task not in {"segment", "segmentation", "instancesegmentation"}:
        return {
            "ok": False,
            "measurable": False,
            "severity": UNABLE,
            "severity_pct": None,
            "affected_area_pct": None,
            "reason": "invalid_severity_model_task",
            "expected_task": "segment",
            "actual_task": metadata.get("task"),
        }

    summary = summarize_segmentation(payload)
    areas = summary["areas"]
    leaf_area = float(areas["leaf"])
    model = metadata.get("model", metadata.get("modelName", metadata.get("model_name")))

    base = {
        "ok": True,
        "source": "ultralytics_segmentation",
        "model": model,
        "metric": "symptom_mask_area_over_leaf_mask_area",
        "leaf_polygon_area": round(leaf_area, 6),
        "polygon_counts": summary["counts"],
        "thresholds": thresholds_echo(),
        "raw_task": metadata.get("task"),
    }

    if leaf_area <= 0:
        return {
            **base,
            "measurable": False,
            "severity": UNABLE,
            "severity_pct": None,
            "affected_area_pct": None,
            "reason": "leaf_mask_missing",
            "rescan_recommended": True,
            "image_quality": {"issues": ["leaf mask was not detected"]},
            "disease_severities": {},
        }

    if disease == "healthy":
        entry = {
            "disease": "healthy",
            "severity": "Healthy",
            "severity_pct": 0.0,
            "affected_area_pct": 0.0,
            "measurable": True,
            "reason": "leaf_detected_no_selected_symptom",
            "evidence": [f"{summary['counts']['leaf']} leaf polygon(s)"],
            "metric": "symptom_mask_area_over_leaf_mask_area",
        }
        return {
            **base,
            "measurable": True,
            "severity": "Healthy",
            "severity_pct": 0.0,
            "affected_area_pct": 0.0,
            "reason": "healthy_leaf_segmented",
            "rescan_recommended": False,
            "disease_severities": {"healthy": entry},
        }

    symptom_area = float(areas[disease])
    if symptom_area <= 0:
        return {
            **base,
            "measurable": False,
            "severity": UNABLE,
            "severity_pct": None,
            "affected_area_pct": None,
            "reason": "selected_symptom_mask_missing",
            "rescan_recommended": True,
            "image_quality": {"issues": [f"{disease} symptom mask was not detected"]},
            "disease_severities": {},
        }

    severity_pct = round(min(100.0, max(0.0, symptom_area / leaf_area * 100.0)), 2)
    severity = band_for_affected_pct(severity_pct)
    entry = {
        "disease": disease,
        "severity": severity,
        "severity_pct": severity_pct,
        "affected_area_pct": severity_pct,
        "measurable": True,
        "reason": "segmentation_area_ratio",
        "evidence": [
            f"{summary['counts']['leaf']} leaf polygon(s)",
            f"{summary['counts'][disease]} {disease} symptom polygon(s)",
        ],
        "metric": "symptom_mask_area_over_leaf_mask_area",
    }
    return {
        **base,
        "measurable": True,
        "severity": severity,
        "severity_pct": severity_pct,
        "affected_area_pct": severity_pct,
        "symptom_polygon_area": round(symptom_area, 6),
        "reason": "segmentation_area_ratio",
        "rescan_recommended": False,
        "disease_severities": {disease: entry},
    }


def assess_with_ultralytics_segmentation(
    image_bytes: bytes,
    content_type: str | None,
    disease_raw: Any,
    predict_url: str,
    api_key: str,
    *,
    conf: float = 0.25,
    iou: float = 0.5,
    imgsz: int = 640,
    timeout: int = 120,
) -> dict[str, Any]:
    """Call the deployed segmentation endpoint and normalize its result."""
    if not predict_url or not api_key:
        return {
            "ok": False,
            "measurable": False,
            "severity": UNABLE,
            "severity_pct": None,
            "affected_area_pct": None,
            "reason": "severity_model_not_configured",
            "error": "missing_config",
        }

    try:
        response = requests.post(
            predict_url,
            headers={"Authorization": f"Bearer {api_key}"},
            data={
                "conf": str(conf),
                "iou": str(iou),
                "imgsz": str(imgsz),
                "normalize": "true",
            },
            files={
                "file": (
                    "upload.jpg",
                    image_bytes,
                    content_type or "application/octet-stream",
                )
            },
            timeout=timeout,
        )
    except requests.RequestException as exc:
        return {
            "ok": False,
            "measurable": False,
            "severity": UNABLE,
            "severity_pct": None,
            "affected_area_pct": None,
            "reason": "severity_model_unreachable",
            "error": "upstream",
            "message": str(exc),
        }

    try:
        payload = response.json()
    except ValueError:
        payload = {}

    if not response.ok or not isinstance(payload, dict):
        message = ""
        if isinstance(payload, dict):
            message = str(payload.get("message") or payload.get("error") or "")
        return {
            "ok": False,
            "measurable": False,
            "severity": UNABLE,
            "severity_pct": None,
            "affected_area_pct": None,
            "reason": "severity_model_error",
            "error": "upstream",
            "upstream_status": response.status_code,
            "message": message or response.text[:300],
        }

    result = severity_from_segmentation(payload, disease_raw)
    result["endpoint_status"] = response.status_code
    return result
