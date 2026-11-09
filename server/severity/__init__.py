"""Symptom severity assessment (separate from YOLO classification; no OpenCV)."""

from .assess import assess_severity

__all__ = ["assess_severity"]
