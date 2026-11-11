/**
 * Image validation goes through the local /validate proxy to the Ultralytics leaf model.
 */
window.TomatoInsightValidation = {
  validationProxyUrl: (window.TOMATO_INSIGHT_API_BASE || "http://127.0.0.1:8765").replace(/\/$/, "") + "/validate",
  minConfidence: 0.5,
  /** Block disease scoring unless the top class is a tomato leaf. */
  strictValidation: true,
};
