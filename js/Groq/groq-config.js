/**
 * Groq care recommendations (via Flask proxy). API key: server/.env → GROQ_API_KEY
 */
window.TomatoInsightGroq = {
  recommendProxyUrl: (window.TOMATO_INSIGHT_API_BASE || "http://127.0.0.1:8765").replace(/\/$/, "") + "/recommend",
  useGroqRecommendations: true,
  /** Temporary: skip built-in disease-recommendations.js text on Home scan panel; Groq only. */
  groqOnlyMode: true,
};
