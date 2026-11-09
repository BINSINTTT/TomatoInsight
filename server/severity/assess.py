"""
OpenCV leaf / symptom severity assessment.

Separates disease *identity* (YOLO classification) from estimated symptom *extent*.
Does not use AI confidence. Returns "Unable to Assess" when measurement is unreliable.
Affected-area percentages are estimated OpenCV measurements, not validated clinical scores.
"""

from __future__ import annotations

from typing import Any

import cv2
import numpy as np

from . import thresholds as thr

UNABLE = "Unable to Assess"
VIRUS_KEYS = frozenset({"tlcv", "spotted_wilt"})
VALID_DISEASES = frozenset({"healthy", "early_blight", "tlcv", "spotted_wilt"})


def _normalize_disease(raw: str | None) -> str:
    key = str(raw or "").strip().lower().replace("-", "_").replace(" ", "_")
    aliases = {
        "yellowleafcurlvirus": "tlcv",
        "yellow_leaf_curl": "tlcv",
        "yellow_leaf_curl_virus": "tlcv",
        "tylcv": "tlcv",
        "earlyblight": "early_blight",
        "early_blight_virus": "early_blight",
        "spottedwilt": "spotted_wilt",
        "spotted_wilt_virus": "spotted_wilt",
        "tswv": "spotted_wilt",
    }
    key = aliases.get(key, key)
    return key if key in VALID_DISEASES else ""


def _result(
    *,
    disease: str,
    severity: str,
    affected_area_pct: float | None,
    measurable: bool,
    reason: str,
) -> dict[str, Any]:
    return {
        "ok": True,
        "disease": disease,
        "severity": severity,
        "affected_area_pct": affected_area_pct,
        "measurable": measurable,
        "reason": reason,
        "thresholds": thr.thresholds_echo(),
    }


def decode_image(image_bytes: bytes) -> np.ndarray | None:
    if not image_bytes:
        return None
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    return image


def segment_leaf(bgr: np.ndarray) -> tuple[np.ndarray | None, str]:
    """
    Segment likely leaf pixels via green-dominant HSV + largest contour cleanup.
    Returns (binary mask uint8 0/255, reason_if_unreliable).
    """
    if bgr is None or bgr.size == 0:
        return None, "empty_image"

    h, w = bgr.shape[:2]
    frame_area = float(h * w)
    if frame_area <= 0:
        return None, "empty_image"

    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    # Broad green leaf range
    lower = np.array([25, 25, 25], dtype=np.uint8)
    upper = np.array([95, 255, 255], dtype=np.uint8)
    mask = cv2.inRange(hsv, lower, upper)

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None, "no_leaf_contour"

    largest = max(contours, key=cv2.contourArea)
    area = float(cv2.contourArea(largest))
    if area < thr.MIN_LEAF_CONTOUR_AREA:
        return None, "leaf_contour_too_small"

    fraction = area / frame_area
    if fraction < thr.MIN_LEAF_AREA_FRACTION:
        return None, "leaf_area_fraction_low"
    if fraction > thr.MAX_LEAF_AREA_FRACTION:
        return None, "leaf_area_fraction_high"

    hull = cv2.convexHull(largest)
    hull_area = float(cv2.contourArea(hull)) or 1.0
    solidity = area / hull_area
    if solidity < thr.MIN_LEAF_SOLIDITY:
        return None, "leaf_solidity_low"

    clean = np.zeros((h, w), dtype=np.uint8)
    cv2.drawContours(clean, [largest], -1, 255, thickness=cv2.FILLED)

    # Expand leaf region with adjacent brown/yellow tissue so lesions on the leaf
    # are still counted even when they are no longer green.
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    symptomish = np.zeros((h, w), dtype=np.uint8)
    for lower_hsv, upper_hsv in thr.LESION_HSV_RANGES:
        part = cv2.inRange(
            hsv, np.array(lower_hsv, dtype=np.uint8), np.array(upper_hsv, dtype=np.uint8)
        )
        symptomish = cv2.bitwise_or(symptomish, part)
    dilate = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
    near_leaf = cv2.dilate(clean, dilate, iterations=1)
    attached = cv2.bitwise_and(symptomish, near_leaf)
    clean = cv2.bitwise_or(clean, attached)
    return clean, ""


def lesion_mask_early_blight(bgr: np.ndarray, leaf_mask: np.ndarray) -> np.ndarray:
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    combined = np.zeros(leaf_mask.shape, dtype=np.uint8)
    for lower, upper in thr.LESION_HSV_RANGES:
        part = cv2.inRange(hsv, np.array(lower, dtype=np.uint8), np.array(upper, dtype=np.uint8))
        combined = cv2.bitwise_or(combined, part)
    combined = cv2.bitwise_and(combined, leaf_mask)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    combined = cv2.morphologyEx(combined, cv2.MORPH_OPEN, kernel, iterations=1)
    return combined


def affected_pct_from_masks(leaf_mask: np.ndarray, lesion: np.ndarray) -> float | None:
    leaf_pixels = int(cv2.countNonZero(leaf_mask))
    if leaf_pixels <= 0:
        return None
    lesion_pixels = int(cv2.countNonZero(lesion))
    if lesion_pixels < thr.MIN_LESION_PIXELS:
        return 0.0
    pct = (lesion_pixels / leaf_pixels) * 100.0
    return round(min(100.0, pct), 1)


def assess_severity(image_bytes: bytes, disease_raw: str | None) -> dict[str, Any]:
    """
    Assess severity from image bytes and classified disease key.
    Confidence must not be supplied or used.
    """
    disease = _normalize_disease(disease_raw)
    if not disease:
        return {
            "ok": False,
            "error": "invalid_disease",
            "message": "Send disease/bar_key: healthy, early_blight, tlcv, or spotted_wilt.",
            "severity": UNABLE,
            "affected_area_pct": None,
            "measurable": False,
            "reason": "invalid_disease",
            "thresholds": thr.thresholds_echo(),
        }

    # Viral diseases: color area alone is not a reliable severity proxy.
    if disease in VIRUS_KEYS:
        return _result(
            disease=disease,
            severity=UNABLE,
            affected_area_pct=None,
            measurable=False,
            reason="virus_not_area_measurable",
        )

    bgr = decode_image(image_bytes)
    if bgr is None:
        return _result(
            disease=disease,
            severity=UNABLE,
            affected_area_pct=None,
            measurable=False,
            reason="image_decode_failed",
        )

    leaf_mask, fail_reason = segment_leaf(bgr)
    if leaf_mask is None:
        return _result(
            disease=disease,
            severity=UNABLE,
            affected_area_pct=None,
            measurable=False,
            reason=fail_reason or "low_leaf_mask_quality",
        )

    if disease == "healthy":
        return _result(
            disease=disease,
            severity="Healthy",
            affected_area_pct=0.0,
            measurable=True,
            reason="healthy_leaf_segmented",
        )

    # early_blight
    lesions = lesion_mask_early_blight(bgr, leaf_mask)
    affected = affected_pct_from_masks(leaf_mask, lesions)
    if affected is None:
        return _result(
            disease=disease,
            severity=UNABLE,
            affected_area_pct=None,
            measurable=False,
            reason="lesion_measurement_failed",
        )

    severity = thr.band_for_affected_pct(affected)
    return _result(
        disease=disease,
        severity=severity,
        affected_area_pct=affected,
        measurable=True,
        reason="early_blight_opencv_estimate",
    )
