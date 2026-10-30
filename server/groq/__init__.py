"""Groq-powered care recommendations (scores in → text out)."""

from .recommendations import fetch_care_recommendation, groq_is_configured

__all__ = ["fetch_care_recommendation", "groq_is_configured"]
