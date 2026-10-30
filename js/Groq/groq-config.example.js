/**
 * Copy to groq-config.js (optional — defaults work when using the local Flask server).
 * Groq API keys belong in server/.env as GROQ_API_KEY, not in this file.
 */
window.TomatoInsightGroq = {
  /** POST JSON { scores: { healthy, tlcv, early_blight, spotted_wilt } } */
  recommendProxyUrl: "http://127.0.0.1:8765/recommend",
  /** Set false to always use built-in rule-based recommendations in the browser. */
  useGroqRecommendations: true,
  /** Set true to test Groq only (no rule fallback on Home scan panel). Set false for production. */
  groqOnlyMode: false,
};
