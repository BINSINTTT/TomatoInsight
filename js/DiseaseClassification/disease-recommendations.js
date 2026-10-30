(function () {
  const BAR_KEYS = ["healthy", "tlcv", "early_blight", "spotted_wilt"];

  const DISPLAY_NAMES = {
    healthy: "Healthy",
    tlcv: "Yellow leaf curl virus",
    early_blight: "Early blight",
    spotted_wilt: "Spotted wilt",
  };

  let lastTop = null;
  let lastScores = null;
  let activeTileKey = "";
  const openByTile = new Map();
  const guideCache = new Map();
  const guideRequests = new Map();
  const REC_KEY = "tomatoInsight.plantRecommendations";

  function normalizeKey(name) {
    return String(name || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  function fmtPct(value) {
    return window.TilePlantStorage?.formatPct?.(value) ?? String(Math.round(Number(value) || 0));
  }

  function diseaseSeverityLabel(diseaseName, confidencePercent) {
    if (normalizeKey(diseaseName).includes("healthy")) return "Healthy";
    if (confidencePercent >= 80) return "Severe";
    if (confidencePercent >= 50) return "Moderate";
    return "Mild";
  }

  function earlyBlightTreatment() {
    return {
      summary:
        "Early blight (Alternaria) causes brown spots with rings on lower leaves and can defoliate plants.",
      actionSteps: [
        "Remove and destroy infected leaves; do not compost them.",
        "Improve airflow by spacing plants and pruning lower foliage.",
        "Avoid overhead watering; water at the base in the morning.",
        "Apply a copper-based or chlorothalonil fungicide per label directions.",
        "Rotate tomatoes to a new area next season; do not replant in the same spot.",
      ],
      preventionTips: [
        "Mulch around plants to reduce soil splash onto leaves.",
        "Inspect lower leaves weekly during humid weather.",
      ],
    };
  }

  function spottedWiltTreatment() {
    return {
      summary:
        "Tomato spotted wilt virus (TSWV) is spread by thrips and causes bronze spots, rings, and stunted growth.",
      actionSteps: [
        "Remove and destroy infected plants immediately to limit spread.",
        "Control thrips with insecticidal soap or approved products; focus on undersides of leaves.",
        "Use reflective mulch early in the season to repel thrips.",
        "Remove weeds near the farm that host thrips and the virus.",
        "Do not replant tomatoes in the same bed without thrips management.",
      ],
      preventionTips: [
        "Use TSWV-resistant tomato varieties when available.",
        "Install fine mesh row covers until plants flower, if practical.",
      ],
    };
  }

  function yellowLeafCurlTreatment() {
    return {
      summary:
        "Tomato yellow leaf curl virus (TYLCV) causes upward curling, yellowing, and reduced fruit set; whiteflies spread it.",
      actionSteps: [
        "Remove severely infected plants to protect nearby healthy ones.",
        "Control whiteflies with yellow sticky traps and approved insecticides.",
        "Spray undersides of leaves where whiteflies feed; repeat as directed.",
        "Remove solanaceous weeds (tomato relatives) around the field.",
        "Avoid bringing new plants from unknown sources into the farm.",
      ],
      preventionTips: [
        "Plant TYLCV-tolerant varieties where the virus is common.",
        "Inspect new growth twice weekly for curling and whitefly activity.",
      ],
    };
  }

  function healthyPlantCare() {
    return {
      summary: "This leaf looks healthy. Continue good practices to keep plants productive.",
      actionSteps: [
        "Maintain even watering; avoid long dry periods followed by heavy soaking.",
        "Feed with balanced fertilizer according to plant stage.",
        "Stake or trellis plants to keep foliage off the soil.",
        "Scan other tiles regularly so problems are caught early.",
      ],
      preventionTips: [
        "Remove yellowing lower leaves to improve airflow.",
        "Sanitize tools if you work on a diseased plant elsewhere.",
      ],
    };
  }

  function genericTreatment(name) {
    return {
      summary:
        "A plant disease was detected. Isolate the affected plant and confirm symptoms before treating.",
      actionSteps: [
        "Photograph symptoms and note which leaves are affected.",
        "Remove heavily damaged tissue and dispose of it away from the farm.",
        "Avoid working wet plants to reduce spread.",
        "Compare symptoms with a trusted tomato disease guide before treating.",
      ],
      preventionTips: [],
    };
  }

  function treatmentForBarKey(barKey, confidencePercent) {
    const diseaseName = DISPLAY_NAMES[barKey] || barKey;
    const key = normalizeKey(barKey);
    const nameKey = normalizeKey(diseaseName);
    const isHealthy = key === "healthy" || nameKey.includes("healthy");

    let base;
    if (key.includes("earlyblight") || nameKey.includes("earlyblight")) {
      base = earlyBlightTreatment();
    } else if (key.includes("spottedwilt") || nameKey.includes("spottedwilt")) {
      base = spottedWiltTreatment();
    } else if (key.includes("tlcv") || nameKey.includes("yellowleafcurl")) {
      base = yellowLeafCurlTreatment();
    } else if (isHealthy) {
      base = healthyPlantCare();
    } else {
      base = genericTreatment(diseaseName);
    }

    const severity = diseaseSeverityLabel(diseaseName, confidencePercent);
    let urgencyNote;
    let actionSteps = [...base.actionSteps];
    const isFullMatch = confidencePercent >= 100;

    if (isHealthy) {
      urgencyNote = "Keep up regular monitoring to catch problems early.";
    } else if (isFullMatch) {
      urgencyNote =
        "Critical (100%): remove this leaf immediately and destroy it away from the farm. Do not compost.";
      actionSteps = [
        "Remove this leaf immediately; bag it and dispose of it away from healthy plants (do not compost).",
        ...actionSteps,
      ];
    } else if (severity === "Severe") {
      urgencyNote = `Urgent (${fmtPct(confidencePercent)}%): start treatment within 24–48 hours.`;
    } else if (severity === "Moderate") {
      urgencyNote = `Moderate (${fmtPct(confidencePercent)}%): treat this week before it spreads.`;
    } else {
      urgencyNote = `Mild (${fmtPct(confidencePercent)}%): monitor closely and treat if symptoms worsen.`;
    }

    return {
      diseaseName,
      urgencyNote,
      summary: base.summary,
      actionSteps,
      preventionTips: base.preventionTips,
      isCriticalRemoval: !isHealthy && isFullMatch,
    };
  }

  function findTopDisease(scores) {
    let top = { barKey: "healthy", pct: 0 };
    BAR_KEYS.forEach((barKey) => {
      const pct = Math.min(100, Math.max(0, Number(scores?.[barKey]) || 0));
      if (pct > top.pct) top = { barKey, pct };
    });
    return top.pct > 0 ? top : null;
  }

  function renderList(items, emptyMessage) {
    if (!items?.length) return `<p class="scan-treatment-panel__empty">${emptyMessage}</p>`;
    return `<ul class="scan-treatment-panel__list">${items
      .map((item) => `<li>${escapeHtml(item)}</li>`)
      .join("")}</ul>`;
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderPanelContent(top, guide) {
    const panel = document.getElementById("scan-treatment-panel");
    if (!panel || !top || !guide) return;

    const isHealthy = normalizeKey(top.barKey) === "healthy";
    const stepsTitle = isHealthy ? "What to do" : "Treatment steps";

    const urgencyClass = guide.isCriticalRemoval
      ? "scan-treatment-panel__urgency scan-treatment-panel__urgency--critical"
      : "scan-treatment-panel__urgency";

    panel.innerHTML = `
      <h4 class="scan-treatment-panel__title">${escapeHtml(guide.diseaseName || (isHealthy ? "Healthy" : ""))}</h4>
      <p class="${urgencyClass}">${escapeHtml(guide.urgencyNote)}</p>
      <p class="scan-treatment-panel__summary">${escapeHtml(guide.summary)}</p>
      <h5 class="scan-treatment-panel__subtitle">${stepsTitle}</h5>
      ${renderList(guide.actionSteps, "No steps listed.")}
      ${
        guide.preventionTips?.length
          ? `<h5 class="scan-treatment-panel__subtitle">Prevention</h5>${renderList(guide.preventionTips, "")}`
          : ""
      }
      <p class="scan-treatment-panel__disclaimer">Guidance only — verify on the plant before treating.</p>
    `;
    panel.hidden = false;
  }

  function builtInRulesEnabled() {
    return !window.TomatoInsightGroqClient?.groqOnlyMode?.();
  }

  function renderPanelLoading() {
    const panel = document.getElementById("scan-treatment-panel");
    if (!panel) return;
    panel.innerHTML = `<p class="scan-treatment-panel__summary">Loading care steps…</p>`;
    panel.hidden = false;
  }

  function tileKey(tileNum) {
    if (tileNum == null || tileNum === "") return "";
    return String(tileNum);
  }

  function isOpenForActiveTile() {
    return Boolean(activeTileKey && openByTile.get(activeTileKey));
  }

  function setOpenForActiveTile(open) {
    if (!activeTileKey) return;
    openByTile.set(activeTileKey, Boolean(open));
  }

  function clearPanelDisplay() {
    const panel = document.getElementById("scan-treatment-panel");
    const btn = document.getElementById("scan-treatment-btn");
    btn?.setAttribute("aria-expanded", "false");
    if (panel) {
      panel.hidden = true;
      panel.innerHTML = "";
    }
  }

  function renderPanelError(top, title, detail) {
    const panel = document.getElementById("scan-treatment-panel");
    if (!panel || !top) return;
    panel.innerHTML = `
      <p class="scan-treatment-panel__eyebrow">Top match · ${top.pct}% · Groq</p>
      <h4 class="scan-treatment-panel__title">${escapeHtml(title)}</h4>
      <p class="scan-treatment-panel__urgency scan-treatment-panel__urgency--critical">${escapeHtml(
        detail || "Check server/.env (GROQ_API_KEY), restart Flask, and use http://127.0.0.1:8765/."
      )}</p>
      <p class="scan-treatment-panel__disclaimer">Built-in rules are off while groqOnlyMode is true in js/Groq/groq-config.js.</p>
    `;
    panel.hidden = false;
  }

  function renderPanel(top, guideOverride) {
    if (!top) return;
    if (!guideOverride && !builtInRulesEnabled()) {
      renderPanelError(top, "Groq did not return guidance", "No rule-based fallback in groq-only mode.");
      return;
    }
    const guide = guideOverride || treatmentForBarKey(top.barKey, top.pct);
    renderPanelContent(top, guide);
    rememberGuide(activeTileKey, guide, lastScores ? scoresKey(lastScores) : "");
  }

  function readRecommendationStore() {
    try {
      const parsed = JSON.parse(localStorage.getItem(REC_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (err) {
      return {};
    }
  }

  function guideRecord(guide, scoresKeyValue) {
    if (!guide || typeof guide !== "object" || guide.error) return null;
    const summary = String(guide.summary || "").trim().slice(0, 800);
    const actionSteps = Array.isArray(guide.actionSteps)
      ? guide.actionSteps.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 12)
      : [];
    if (!summary && !actionSteps.length) return null;
    const record = {
      diseaseName: String(guide.diseaseName || "").trim().slice(0, 80),
      urgencyNote: String(guide.urgencyNote || "").trim().slice(0, 240),
      summary,
      actionSteps,
      preventionTips: Array.isArray(guide.preventionTips)
        ? guide.preventionTips.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 8)
        : [],
      isCriticalRemoval: Boolean(guide.isCriticalRemoval),
    };
    const key = String(scoresKeyValue || guide.scoresKey || "").trim().slice(0, 200);
    if (key) record.scoresKey = key;
    return record;
  }

  function storedGuide(tileId) {
    const id = tileKey(tileId);
    if (!id) return null;
    return guideRecord(readRecommendationStore()[id]);
  }

  function rememberGuide(tileId, guide, key) {
    const id = tileKey(tileId);
    const record = guideRecord(guide, key);
    if (!id || !record) return;
    const store = readRecommendationStore();
    if (JSON.stringify(store[id]) === JSON.stringify(record)) return;
    store[id] = record;
    localStorage.setItem(REC_KEY, JSON.stringify(store));
    window.TomatoInsightUserData?.syncPlantNames?.();
  }

  function forgetGuide(tileId) {
    const id = tileKey(tileId);
    if (!id) return;
    const store = readRecommendationStore();
    if (!store[id]) return;
    delete store[id];
    localStorage.setItem(REC_KEY, JSON.stringify(store));
  }

  async function captureForSave(tileNum, scores) {
    const id = tileKey(tileNum);
    if (!id || !scores) return null;
    const key = scoresKey(scores);
    const existing = storedGuide(id);
    if (existing && existing.scoresKey === key) return existing;
    const top = findTopDisease(scores);
    if (!top) return null;
    let guide = null;
    const client = window.TomatoInsightGroqClient;
    if (client?.groqEnabled?.() && client.fetchCareRecommendation) {
      const result = await client.fetchCareRecommendation(scores);
      const groqOnly = Boolean(client.groqOnlyMode?.());
      if (result?.ok && result.guide && (!groqOnly || result.groqUsed)) guide = result.guide;
      else if (groqOnly) return null;
    }
    if (!guide && builtInRulesEnabled()) guide = treatmentForBarKey(top.barKey, top.pct);
    if (!guide) return null;
    const record = guideRecord(guide, key);
    if (!record) return null;
    const store = readRecommendationStore();
    store[id] = record;
    localStorage.setItem(REC_KEY, JSON.stringify(store));
    return record;
  }

  function scoresKey(scores) {
    return BAR_KEYS.map(
      (key) => `${key}:${Math.min(100, Math.max(0, Number(scores?.[key]) || 0))}`
    ).join("|");
  }

  function stillShowing(key, tile) {
    return isOpenForActiveTile() && activeTileKey === tile && scoresKey(lastScores) === key;
  }

  async function requestGroqGuide(client, scores, key) {
    if (guideCache.has(key)) return guideCache.get(key);
    if (guideRequests.has(key)) return guideRequests.get(key);

    const request = client
      .fetchCareRecommendation(scores)
      .then((result) => {
        const groqOnly = client.groqOnlyMode?.();
        const usedGroq = Boolean(result?.groqUsed);
        if (result?.ok && result.guide && (!groqOnly || usedGroq)) {
          guideCache.set(key, result.guide);
          return result.guide;
        }
        return { error: result };
      })
      .finally(() => {
        guideRequests.delete(key);
      });

    guideRequests.set(key, request);
    return request;
  }

  async function loadGroqPanel(top, scores) {
    const client = window.TomatoInsightGroqClient;
    const groqOnly = client?.groqOnlyMode?.();
    const key = scoresKey(scores);
    const tile = activeTileKey;

    if (guideCache.has(key)) {
      renderPanel(top, guideCache.get(key));
      return;
    }

    if (!client?.groqEnabled?.() || !client?.fetchCareRecommendation) {
      if (groqOnly) {
        renderPanelError(top, "Groq client not configured", "Set useGroqRecommendations and recommendProxyUrl in js/Groq/groq-config.js.");
      } else {
        renderPanel(top);
      }
      return;
    }

    if (!guideRequests.has(key)) renderPanelLoading();

    const result = await requestGroqGuide(client, scores, key);
    if (!stillShowing(key, tile)) return;

    if (result && !result.error) {
      renderPanel(top, result);
      return;
    }

    const failed = result?.error;
    if (groqOnly && failed?.ok && failed.guide && !failed.groqUsed) {
      const reason = [failed.fallbackReason, failed.httpStatus ? `HTTP ${failed.httpStatus}` : "", failed.detail]
        .filter(Boolean)
        .join(" — ");
      renderPanelError(
        top,
        "Groq was not used (server sent rule-based fallback)",
        reason || "Add GROQ_API_KEY to server/.env and restart the server."
      );
      return;
    }

    if (groqOnly) {
      renderPanelError(
        top,
        "Groq request failed",
        [failed?.error, failed?.detail].filter(Boolean).join(" — ")
      );
      return;
    }

    renderPanel(top);
  }

  function setButtonEnabled(enabled) {
    const btn = document.getElementById("scan-treatment-btn");
    if (!btn) return;
    btn.hidden = !enabled;
    btn.disabled = !enabled;
    if (enabled && lastTop && lastTop.pct >= 100 && normalizeKey(lastTop.barKey) !== "healthy") {
      btn.textContent = "Urgent: remove leaf — view steps";
    } else {
      btn.textContent = "View care recommendations";
    }
    if (!enabled) clearPanelDisplay();
  }

  function showRecommendations() {
    if (!lastTop) return;
    setOpenForActiveTile(true);
    const btn = document.getElementById("scan-treatment-btn");
    btn?.setAttribute("aria-expanded", "true");
    const stored = storedGuide(activeTileKey);
    const currentKey = lastScores ? scoresKey(lastScores) : "";
    if (stored && (!stored.scoresKey || !currentKey || stored.scoresKey === currentKey)) {
      renderPanel(lastTop, stored);
      return;
    }
    if (lastScores) loadGroqPanel(lastTop, lastScores);
    else if (builtInRulesEnabled()) renderPanel(lastTop);
    else renderPanelError(lastTop, "No scores for Groq", "Run classification on a leaf scan first.");
  }

  function onScoresUpdated(scores, tileNum) {
    const nextTile = tileKey(tileNum);
    if (nextTile) activeTileKey = nextTile;
    const nextScores = scores && Object.keys(scores).length ? { ...scores } : null;
    const nextKey = nextScores ? scoresKey(nextScores) : "";
    const prevKey = lastScores ? scoresKey(lastScores) : "";
    lastScores = nextScores;
    lastTop = findTopDisease(nextScores);
    setButtonEnabled(Boolean(lastTop));
    if (!lastTop) {
      clearPanelDisplay();
      return;
    }
    if (isOpenForActiveTile()) showRecommendations();
    else if (nextKey !== prevKey) clearPanelDisplay();
  }

  function init() {
    const btn = document.getElementById("scan-treatment-btn");
    btn?.addEventListener("click", () => {
      if (!lastTop) return;
      const panel = document.getElementById("scan-treatment-panel");
      if (!panel) return;
      if (isOpenForActiveTile() && !panel.hidden) {
        setOpenForActiveTile(false);
        clearPanelDisplay();
        return;
      }
      showRecommendations();
    });
    setButtonEnabled(false);
  }

  init();

  window.TomatoInsightRecommendations = {
    onScoresUpdated,
    treatmentForBarKey,
    findTopDisease,
    captureForSave,
    forget: forgetGuide,
    storedForTile: storedGuide,
    scoresKeyFor: scoresKey,
  };
})();
