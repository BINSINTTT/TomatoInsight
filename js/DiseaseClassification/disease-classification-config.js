window.TomatoInsightDiseaseConfig = {
  classifyProxyUrl: (window.TOMATO_INSIGHT_API_BASE || "http://127.0.0.1:8765").replace(/\/$/, "") + "/classify",
  predictUrl:
    "https://predict-6ae38ddbc663e1b4d2a97fd5-dproatj77a-de.a.run.app/predict",
  apiKey: "",
  /** Require at least 80% confidence from the disease classifier. */
  conf: 0.8,
  iou: null,
  imgsz: null,
};
