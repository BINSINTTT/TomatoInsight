(function () {
  const DEFAULTS = {
    validationProxyUrl: (window.TOMATO_INSIGHT_API_BASE || "http://127.0.0.1:8765").replace(/\/$/, "") + "/validate",
    minConfidence: 0.5,
    /** true: block classification when the model finds no leaf. false: classify anyway and warn. */
    strictValidation: true,
  };

  /**
   * Ultralytics leaf model classes are TomatoLeaf and NonTomatoLeaf.
   * "Non" and "Not" both mean the photo is not a tomato leaf.
   */
  function isRejectedClass(name) {
    const key = normalizeClassName(name);
    if (!key) return true;
    return (
      key.includes("nontomato") ||
      key.includes("nottomato") ||
      key.includes("nonleaf") ||
      key.includes("notleaf")
    );
  }

  function isTomatoLeafClass(name) {
    if (isRejectedClass(name)) return false;
    const key = normalizeClassName(name);
    return key === "tomatoleaf" || (key.includes("tomato") && key.includes("leaf"));
  }

  /** Class names are compared ignoring case and punctuation. */
  function normalizeClassName(name) {
    return String(name || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  const userConfig = window.TomatoInsightRoboflow || {};
  const config = {
    ...DEFAULTS,
    ...userConfig,
  };

  const alertEl = () => document.getElementById("validation-alert");
  const alertTitleEl = () => document.getElementById("validation-alert-title");
  const alertMessageEl = () => document.getElementById("validation-alert-message");
  const alertOkEl = () => document.getElementById("validation-alert-ok");
  const uploadZone = () => document.getElementById("scan-upload-zone");

  function normalizeConfidence(value) {
    const confidence = Number(value);
    if (Number.isNaN(confidence)) return 0;
    return confidence > 1 ? confidence / 100 : confidence;
  }

  function extractPredictions(payload) {
    const found = [];

    function append(item) {
      if (!item || typeof item !== "object") return;
      const name = String(item.name || item.class_name || item.class || item.label || "").trim();
      if (!name) return;
      found.push({
        name,
        confidence: normalizeConfidence(item.confidence ?? item.score ?? 0),
      });
    }

    const images = payload?.images;
    if (Array.isArray(images)) {
      images.forEach((image) => {
        if (Array.isArray(image?.results)) image.results.forEach(append);
      });
    }
    if (Array.isArray(payload?.results)) payload.results.forEach(append);

    return found.sort((a, b) => b.confidence - a.confidence);
  }

  function interpretValidationPayload(payload) {
    const predictions = extractPredictions(payload);
    if (!predictions.length) {
      return {
        isTomato: false,
        confidence: 0,
        detectedClass: null,
        detectionCount: 0,
        message: "No tomato leaf was detected in this image.",
      };
    }

    const best = predictions[0];
    const detectedClass = best.name;
    const confidence = best.confidence;
    const shown = `${(confidence * 100).toFixed(1)}%`;
    const floor = `${(config.minConfidence * 100).toFixed(0)}%`;
    const isTomato = isTomatoLeafClass(detectedClass) && confidence >= config.minConfidence;

    if (!isTomato) {
      return {
        isTomato: false,
        confidence,
        detectedClass,
        detectionCount: predictions.length,
        message: isRejectedClass(detectedClass)
          ? `This photo was labeled “${detectedClass}” at ${shown}.`
          : `“${detectedClass}” was ${shown} (needs ${floor} or higher).`,
      };
    }

    return {
      isTomato: true,
      confidence,
      detectedClass,
      detectionCount: predictions.length,
      message: "Tomato leaf detected!",
    };
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || "");
        const comma = dataUrl.indexOf(",");
        resolve(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl);
      };
      reader.onerror = () => reject(reader.error || new Error("Could not read image file."));
      reader.readAsDataURL(file);
    });
  }

  let loadingToken = 0;

  function applyLoading(loading) {
    uploadZone()?.classList.toggle("scan-upload--validating", loading);
    const status = document.getElementById("scan-upload-status");
    if (status) status.hidden = !loading;
    const saveBtn = document.getElementById("tile-save-info-btn");
    if (window.TomatoInsightScan?.syncSaveInfoButton) {
      window.TomatoInsightScan.syncSaveInfoButton();
    } else if (saveBtn) {
      const hasImage = uploadZone()?.classList.contains("scan-upload--has-image");
      saveBtn.disabled = loading || !hasImage;
    }
  }

  function beginLoading() {
    loadingToken += 1;
    applyLoading(true);
    return loadingToken;
  }

  function finishLoading(token) {
    if (token != null && token !== loadingToken) return;
    applyLoading(false);
    window.TomatoInsightScan?.endPipeline?.();
  }

  function dismissAlert() {
    const el = alertEl();
    if (!el) return;
    el.hidden = true;
  }

  function showAlert(variant, title, message) {
    const el = alertEl();
    const titleNode = alertTitleEl();
    const messageNode = alertMessageEl();
    if (!el || !titleNode || !messageNode) {
      window.alert(message);
      return;
    }
    el.classList.remove(
      "validation-alert--success",
      "validation-alert--warning",
      "validation-alert--error"
    );
    el.classList.add(`validation-alert--${variant}`);
    titleNode.textContent = title;
    messageNode.textContent = message;
    el.hidden = false;
    alertOkEl()?.focus();
  }

  function bindAlert() {
    alertOkEl()?.addEventListener("click", dismissAlert);
    alertEl()?.addEventListener("click", (e) => {
      if (e.target?.dataset?.closeValidationAlert != null) dismissAlert();
    });
  }

  let activeRequest = 0;

  async function validateImageFile(file) {
    if (!file?.type?.startsWith("image/")) {
      return { isTomato: false, error: "not_an_image" };
    }

    if (!config.validationProxyUrl?.trim()) {
      showAlert(
        "error",
        "Configuration needed",
        "Image validation needs the local server. Run server/validation_api.py and open http://127.0.0.1:8765/."
      );
      return { isTomato: false, error: "missing_proxy" };
    }

    const requestId = ++activeRequest;
    let keepLoading = false;
    const loadToken = beginLoading();
    dismissAlert();

    try {
      const form = new FormData();
      form.append("file", file, file.name || "upload.jpg");
      const response = await fetch(config.validationProxyUrl.trim(), {
        method: "POST",
        body: form,
      });

      const result = await response.json();
      console.log("[TomatoInsight] Ultralytics validation:", result);

      if (requestId !== activeRequest) return { isTomato: false, cancelled: true };

      if (!response.ok) {
        const detail =
          result?.message || result?.error || `Validation request failed (${response.status}).`;
        showAlert("error", "Validation failed", detail);
        return { isTomato: false, error: "http_error", raw: result };
      }

      const verdict = interpretValidationPayload(result);
      let classifying = false;
      if (verdict.isTomato) {
        classifying = startClassification(file, loadToken);
      } else if (config.strictValidation) {
        showAlert("warning", "Not a tomato leaf", verdict.message);
        window.TomatoInsightScan?.setClassificationScores?.({});
      } else {
        showAlert(
          "warning",
          "Leaf not confirmed",
          `${verdict.message} Running classification anyway — check the photo before trusting the result.`
        );
        classifying = startClassification(file, loadToken);
      }
      if (classifying) keepLoading = true;
      return { ...verdict, raw: result };
    } catch (err) {
      console.error("[TomatoInsight] Validation error:", err);
      if (requestId === activeRequest) {
        const msg = String(err?.message || "");
        const corsHint =
          msg === "Failed to fetch"
            ? "Could not reach the validation service. Run server\\start.ps1 and open http://127.0.0.1:8765/."
            : msg || "Could not reach the validation service. Check your connection.";
        showAlert("error", "Validation failed", corsHint);
      }
      return { isTomato: false, error: "network", detail: err?.message };
    } finally {
      if (requestId === activeRequest && !keepLoading) finishLoading(loadToken);
    }
  }

  function isCurrentRequest(requestId) {
    return requestId == null || requestId === activeRequest;
  }

  function startClassification(file, loadToken) {
    if (!window.TomatoInsightDisease?.classifyImageFile) return false;
    window.TomatoInsightDisease.classifyImageFile(file, loadToken, activeRequest);
    return true;
  }

  function resetUI() {
    activeRequest += 1;
    loadingToken += 1;
    applyLoading(false);
    dismissAlert();
  }

  bindAlert();

  window.TomatoInsightValidation = {
    validateImageFile,
    dismissAlert,
    showNotice: showAlert,
    isCurrentRequest,
    resetUI,
    finishLoading,
  };
})();
