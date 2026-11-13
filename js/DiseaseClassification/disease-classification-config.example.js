/**
 * Copy to disease-classification-config.js (gitignored) and set your Ultralytics Deploy URL + API key.
 */
window.TomatoInsightDiseaseConfig = {
  /** Local proxy (server/validation_api.py) — recommended to avoid CORS. */
  classifyProxyUrl: "http://127.0.0.1:8765/classify",
  specialistProxyUrl: "http://127.0.0.1:8765/refine-disease",
  predictUrl: "https://your-deployment-url.run.app/predict",
  apiKey: "YOUR_ULTRALYTICS_API_KEY",
  /** null = use the deployment defaults, so results match the Ultralytics Predict page. */
  conf: null,
  iou: null,
  imgsz: null,
};
