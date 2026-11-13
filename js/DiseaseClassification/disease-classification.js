(function () {
  const DEFAULTS = {
    classifyProxyUrl: (window.TOMATO_INSIGHT_API_BASE || "http://127.0.0.1:8765").replace(/\/$/, "") + "/classify",
    severityProxyUrl:
      (window.TOMATO_INSIGHT_API_BASE || "http://127.0.0.1:8765").replace(/\/$/, "") + "/assess-severity",
    specialistProxyUrl:
      (window.TOMATO_INSIGHT_API_BASE || "http://127.0.0.1:8765").replace(/\/$/, "") + "/refine-disease",
    predictUrl: "https://predict-6ae38ddbc663e1b4d2a97fd5-dproatj77a-de.a.run.app/predict",
    apiKey: "",
    /** null = use the deployment defaults, so results match the Ultralytics Predict page. */
    conf: null,
    iou: null,

    imgsz: null,
  };

  const userConfig = window.TomatoInsightDiseaseConfig || {};
  const config = { ...DEFAULTS, ...userConfig };

  /** Matches Ultralytics classNames from your deploy (see response metadata.classNames). */
  const DISEASE_LABELS = [
    { barKey: "healthy", names: ["healthy"] },
    {
      barKey: "tlcv",
      names: ["yellowleafcurlvirus", "yellow leaf curl virus", "tlcv", "yellow leaf curl"],
    },
    {
      barKey: "early_blight",
      names: ["earlyblightvirus", "early blight", "earlyblight"],
    },
    {
      barKey: "spotted_wilt",
      names: ["spottedwiltvirus", "spotted wilt", "spottedwilt", "tswv"],
    },
  ];

  function normalizeKey(name) {
    return String(name || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  function normalizeConfidence(value) {
    const n = Number(value);
    if (Number.isNaN(n)) return 0;
    return n > 1 ? n / 100 : n;
  }

  function collectResultItems(payload) {
    const items = [];
    if (!payload || typeof payload !== "object") return items;
    if (Array.isArray(payload.images)) {
      payload.images.forEach((image) => {
        const rows = Array.isArray(image?.results) ? image.results : [];
        rows.forEach((item) => items.push({ item }));
      });
    }
    if (Array.isArray(payload.results)) {
      payload.results.forEach((item) => items.push({ item }));
    }
    if (Array.isArray(payload.predictions)) {
      payload.predictions.forEach((item) => items.push({ item }));
    }
    return items;
  }

  function extractPredictions(payload) {
    const results = [];
    const seen = new Set();

    collectResultItems(payload).forEach(({ item }) => {
      const cleaned = String(item?.name || item?.class_name || item?.class || item?.label || "").trim();
      if (!cleaned) return;
      const key = normalizeKey(cleaned);
      if (seen.has(key)) return;
      seen.add(key);
      results.push({
        name: cleaned,
        confidence: normalizeConfidence(item?.confidence ?? item?.score ?? 0),
      });
    });

    return results.sort((a, b) => b.confidence - a.confidence);
  }

  function topBarKeyFromScores(scores) {
    let topKey = "";
    let topPct = -1;
    ["healthy", "tlcv", "early_blight", "spotted_wilt"].forEach((key) => {
      const pct = Math.min(100, Math.max(0, Number(scores?.[key]) || 0));
      if (pct > topPct) {
        topPct = pct;
        topKey = key;
      }
    });
    return topPct > 0 ? topKey : "";
  }

  function normalizeDiseaseSeverities(raw) {
    if (!raw || typeof raw !== "object") return {};
    const normalized = {};
    Object.entries(raw).forEach(([key, value]) => {
      if (!value || typeof value !== "object") return;
      const pctRaw = value.severity_pct ?? value.severityPct ?? value.affected_area_pct;
      const pct = pctRaw != null && Number.isFinite(Number(pctRaw))
        ? Math.min(100, Math.max(0, Number(pctRaw)))
        : null;
      normalized[key] = {
        severityPct: pct,
        severityLabel: String(value.severity || value.severityLabel || "Unable to Assess"),
        affectedAreaPct: pct,
        severityAssessable: Boolean(value.measurable) && pct != null,
        severityReason: String(value.reason || ""),
        metric: String(value.metric || "visual_symptom_extent"),
        evidence: Array.isArray(value.evidence) ? value.evidence.map(String) : [],
      };
    });
    return normalized;
  }

  /**
   * Separate image-based symptom assessment. Classification scores identify
   * disease candidates only; the backend never converts confidence to severity.
   */
  async function assessSymptomSeverity(file, diseaseKey) {
    const unable = {
      severityPct: null,
      severityLabel: "Unable to Assess",
      affectedAreaPct: null,
      severityAssessable: false,
      severitySource: "assessment_unavailable",
      severityReason: "request_failed",
      diseaseSeverities: {},
      rescanRecommended: false,
    };

    const url = String(config.severityProxyUrl || "").trim();
    if (!url || !file || !diseaseKey) return unable;

    try {
      const form = new FormData();
      form.append("file", file, file.name || "upload.jpg");
      form.append("disease", diseaseKey);
      form.append("bar_key", diseaseKey);
      const response = await fetch(url, { method: "POST", body: form });
      const payload = await readJsonResponse(response);
      if (!response.ok || !payload?.ok) {
        return {
          ...unable,
          severityReason: payload?.reason || payload?.error || `http_${response.status}`,
        };
      }

      const label = String(payload.severity || "Unable to Assess");
      const measurable = Boolean(payload.measurable);
      const areaRaw = payload.severity_pct ?? payload.affected_area_pct;
      const isHealthy = diseaseKey === "healthy" || label === "Healthy";
      const areaPct = isHealthy
        ? areaRaw != null && Number.isFinite(Number(areaRaw))
          ? Math.min(100, Math.max(0, Number(areaRaw)))
          : 0
        : measurable && areaRaw != null && Number.isFinite(Number(areaRaw))
          ? Math.min(100, Math.max(0, Number(areaRaw)))
          : null;

      return {
        severityPct: areaPct,
        severityLabel: isHealthy ? "Healthy" : label,
        affectedAreaPct: areaPct,
        severityAssessable: isHealthy ? true : measurable && label !== "Unable to Assess",
        severitySource: String(payload.source || "unknown"),
        severityReason: String(payload.reason || ""),
        diseaseSeverities: normalizeDiseaseSeverities(
          payload.disease_severities || payload.diseaseSeverities
        ),
        imageQuality: payload.image_quality || payload.imageQuality || null,
        rescanRecommended: Boolean(payload.rescan_recommended ?? payload.rescanRecommended),
        severityModel: payload.model || null,
      };
    } catch (err) {
      console.warn("[TomatoInsight] Severity assessment failed:", err);
      return { ...unable, severityReason: "network" };
    }
  }

  /** Refine only the Early Blight/Spotted Wilt pair with the fourth model. */
  async function refineDiseaseScores(file, mainScores) {
    const original = { ...mainScores };
    const leading = topBarKeyFromScores(original);
    if (!file || !["early_blight", "spotted_wilt"].includes(leading)) {
      return { scores: original, applied: false, reason: "specialist_not_needed" };
    }
    const url = String(config.specialistProxyUrl || "").trim();
    if (!url) return { scores: original, applied: false, reason: "specialist_proxy_not_configured" };

    try {
      const form = new FormData();
      form.append("file", file, file.name || "upload.jpg");
      form.append("main_scores", JSON.stringify(original));
      const response = await fetch(url, { method: "POST", body: form });
      const payload = await readJsonResponse(response);
      if (!response.ok || !payload?.ok || !payload?.scores) {
        console.warn("[TomatoInsight] Specialist refinement unavailable:", payload);
        return { scores: original, applied: false, reason: payload?.reason || `http_${response.status}` };
      }
      const refined = { ...original };
      ["healthy", "tlcv", "early_blight", "spotted_wilt"].forEach((key) => {
        const value = Number(payload.scores[key]);
        if (Number.isFinite(value)) refined[key] = Math.min(100, Math.max(0, value));
      });
      return {
        scores: refined,
        applied: Boolean(payload.applied),
        reason: String(payload.reason || ""),
        finalDisease: payload.final_disease || topBarKeyFromScores(refined),
        evidence: payload.evidence || null,
        model: payload.model || null,
      };
    } catch (err) {
      console.warn("[TomatoInsight] Specialist refinement failed:", err);
      return { scores: original, applied: false, reason: "network" };
    }
  }

  function mapToBarScores(predictions) {
    const byKey = new Map();
    predictions.forEach((item) => {
      byKey.set(normalizeKey(item.name), item.confidence);
    });

    const scores = {
      healthy: 0,
      tlcv: 0,
      early_blight: 0,
      spotted_wilt: 0,
    };

    DISEASE_LABELS.forEach(({ barKey, names }) => {
      let best = 0;
      names.forEach((label) => {
        const key = normalizeKey(label);
        if (byKey.has(key)) {
          best = Math.max(best, byKey.get(key));
          return;
        }
        byKey.forEach((confidence, candidateKey) => {
          if (candidateKey.includes(key) || key.includes(candidateKey)) {
            best = Math.max(best, confidence);
          }
        });
      });
      scores[barKey] = Math.round(best * 1000) / 10;
    });

    return scores;
  }

  function setClassifying(active) {
    const section = document.querySelector(".scan-results");
    section?.classList.toggle("scan-results--loading", active);
  }

  function showClassificationMessage(title, message, variant) {
    const el = document.getElementById("validation-alert");
    const titleNode = document.getElementById("validation-alert-title");
    const messageNode = document.getElementById("validation-alert-message");
    if (!el || !titleNode || !messageNode) {
      console.warn("[TomatoInsight]", title, message);
      return;
    }
    el.classList.remove(
      "validation-alert--success",
      "validation-alert--warning",
      "validation-alert--error"
    );
    el.classList.add(`validation-alert--${variant || "warning"}`);
    titleNode.textContent = title;
    messageNode.hidden = false;
    messageNode.textContent = message;
    document.getElementById("validation-alert-guide")?.setAttribute("hidden", "");
    el.classList.remove("validation-alert--invalid-image");
    el.hidden = false;
  }

  function buildClassifierForm(file) {
    const form = new FormData();
    form.append("file", file, file.name || "upload.jpg");
    ["conf", "iou", "imgsz"].forEach((key) => {
      const value = config[key];
      if (value === null || value === undefined || String(value).trim() === "") return;
      form.append(key, String(value).trim());
    });
    return form;
  }

  async function postToClassifier(file, useProxy) {
    const directUrl = config.predictUrl?.trim();
    const hasDirect =
      directUrl && config.apiKey && config.apiKey !== "YOUR_ULTRALYTICS_API_KEY";

    if (useProxy) {
      const proxyUrl = config.classifyProxyUrl.trim();
      const proxyResponse = await fetch(proxyUrl, {
        method: "POST",
        body: buildClassifierForm(file),
      });
      const proxyBroken =
        proxyResponse.status === 404 ||
        proxyResponse.status === 405 ||
        proxyResponse.status === 502;
      if (!proxyBroken) return proxyResponse;
      console.warn(
        "[TomatoInsight] Classify proxy unavailable (HTTP",
        proxyResponse.status,
        "). Trying Ultralytics directly."
      );
      if (!hasDirect) return proxyResponse;
    }

    if (!hasDirect) {
      throw new Error("Classification API is not configured.");
    }

    return fetch(directUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: buildClassifierForm(file),
    });
  }

  async function readJsonResponse(response) {
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return { error: "invalid_json", message: text.slice(0, 200) };
    }
  }

  async function classifyImageFile(file, loadToken, requestId) {
    const stopLoading = () => window.TomatoInsightValidation?.finishLoading?.(loadToken);
    const stillCurrent = () =>
      !window.TomatoInsightValidation?.isCurrentRequest ||
      window.TomatoInsightValidation.isCurrentRequest(requestId);

    if (!file?.type?.startsWith("image/")) {
      stopLoading();
      return { ok: false, error: "not_an_image" };
    }

    const useProxy = Boolean(config.classifyProxyUrl?.trim());
    if (!useProxy && (!config.predictUrl?.trim() || !config.apiKey || config.apiKey === "YOUR_ULTRALYTICS_API_KEY")) {
      console.warn("[TomatoInsight] Disease classification not configured.");
      stopLoading();
      return { ok: false, error: "missing_config" };
    }

    setClassifying(true);

    try {
      let response = await postToClassifier(file, useProxy);

      const result = await readJsonResponse(response);
      console.log("[TomatoInsight] Disease classification:", result);

      if (!response.ok) {
        const detail =
          result?.message ||
          result?.error ||
          `Classification failed (${response.status}). Restart server/start.ps1 if /classify was added recently.`;
        console.error("[TomatoInsight]", detail);
        showClassificationMessage("Classification failed", detail, "error");
        return { ok: false, error: "http_error", detail, raw: result };
      }

      const predictions = extractPredictions(result);
      if (!predictions.length) {
        const msg =
          "The model returned no scores. Check the console log for the raw JSON shape.";
        showClassificationMessage("Classification failed", msg, "warning");
        return { ok: false, error: "empty_predictions", raw: result };
      }

      let scores = mapToBarScores(predictions);
      const totalScore = Object.values(scores).reduce((sum, value) => sum + (Number(value) || 0), 0);
      if (totalScore <= 0) {
        showClassificationMessage(
          "Classification failed",
          "The model returned no scores. This scan was not charged.",
          "warning"
        );
        return { ok: false, error: "empty_predictions", raw: result };
      }

      if (!stillCurrent()) return { ok: false, cancelled: true };

      const specialist = await refineDiseaseScores(file, scores);
      scores = specialist.scores;
      if (!stillCurrent()) return { ok: false, cancelled: true };

      const diseaseKey = topBarKeyFromScores(scores);
      const severity = await assessSymptomSeverity(file, diseaseKey);
      if (!stillCurrent()) return { ok: false, cancelled: true };

      console.log("[TomatoInsight] Bar scores:", scores, "Specialist:", specialist, "Severity:", severity);
      window.TomatoInsightScan?.setClassificationScores?.(scores, severity);
      if (!severity.severityAssessable && severity.rescanRecommended) {
        const qualityIssues = Array.isArray(severity.imageQuality?.issues)
          ? severity.imageQuality.issues.filter(Boolean).join(", ")
          : "";
        window.TomatoInsightValidation?.showNotice?.(
          "warning",
          "Please scan the leaf again",
          `The disease classification completed, but symptom severity could not be measured reliably${
            qualityIssues ? ` because of: ${qualityIssues}` : " from this image"
          }. Use bright, even lighting, keep the full leaf in focus, and avoid shadows or glare.`
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 480));
      return { ok: true, scores, predictions, specialistRefinement: specialist, ...severity, raw: result };
    } catch (err) {
      console.error("[TomatoInsight] Disease classification error:", err);
      const msg = String(err?.message || "");
      const hint =
        msg === "Failed to fetch"
          ? "Could not reach the classification service. Run server\\start.ps1 and use http://127.0.0.1:8765/"
          : msg;
      showClassificationMessage("Classification failed", hint, "error");
      return { ok: false, error: "network", detail: err?.message };
    } finally {
      setClassifying(false);
      stopLoading();
    }
  }

  window.TomatoInsightDisease = {
    classifyImageFile,
    mapToBarScores,
    extractPredictions,
    assessSymptomSeverity,
    refineDiseaseScores,
    topBarKeyFromScores,
  };
})();
