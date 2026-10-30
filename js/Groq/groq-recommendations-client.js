(function () {
  function getConfig() {
    return window.TomatoInsightGroq || {};
  }

  function groqEnabled() {
    const cfg = getConfig();
    if (cfg.useGroqRecommendations === false) return false;
    return Boolean(String(cfg.recommendProxyUrl || "").trim());
  }

  function groqOnlyMode() {
    return Boolean(getConfig().groqOnlyMode);
  }

  /**
   * @param {{ healthy?: number, tlcv?: number, early_blight?: number, spotted_wilt?: number }} scores
   * @returns {Promise<{ ok: boolean, guide?: object, groqUsed?: boolean, error?: string, detail?: string }>}
   */
  async function fetchCareRecommendation(scores) {
    const url = String(getConfig().recommendProxyUrl || "").trim();
    if (!url) {
      return { ok: false, error: "missing_url" };
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scores }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        return {
          ok: false,
          error: payload.error || "http_error",
          detail: payload.message || payload.detail || `HTTP ${response.status}`,
        };
      }
      if (!payload.guide) {
        return { ok: false, error: "no_guide", detail: payload.message };
      }
      const detailText =
        typeof payload.detail === "string"
          ? payload.detail
          : payload.detail?.message || payload.message || "";

      return {
        ok: true,
        guide: payload.guide,
        groqUsed: Boolean(payload.groq_used),
        top: payload.top,
        fallbackReason: payload.error,
        detail: detailText,
        httpStatus: payload.http_status,
      };
    } catch (err) {
      return { ok: false, error: "network", detail: String(err?.message || err) };
    }
  }

  window.TomatoInsightGroqClient = {
    groqEnabled,
    groqOnlyMode,
    fetchCareRecommendation,
  };
})();
