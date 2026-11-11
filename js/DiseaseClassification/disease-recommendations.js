(function () {
  const BAR_KEYS = ["healthy", "tlcv", "early_blight", "spotted_wilt"];

  const DISPLAY_NAMES = {
    healthy: "Healthy",
    tlcv: "Yellow leaf curl virus",
    early_blight: "Early blight",
    spotted_wilt: "Spotted wilt",
  };

  /** Longer titles for the scan highlight card. */
  const HIGHLIGHT_NAMES = {
    healthy: "Healthy",
    tlcv: "Tomato Leaf Curl Virus (TLCV)",
    early_blight: "Early Blight",
    spotted_wilt: "Tomato Spotted Wilt Virus (TSWV)",
  };

  let lastTop = null;
  let lastDetected = [];
  let lastScores = null;
  let lastSeverityPct = null;
  let lastSeverityMeta = null;
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

  function normalizeSeverityMeta(meta) {
    if (meta == null) return null;
    if (typeof meta === "number" || typeof meta === "string") {
      const n = Number(meta);
      if (!Number.isFinite(n) || n < 0) {
        return {
          severityPct: null,
          severityLabel: "Unable to Assess",
          affectedAreaPct: null,
          severityAssessable: false,
        };
      }
      return {
        severityPct: Math.min(100, n),
        severityLabel: null,
        affectedAreaPct: Math.min(100, n),
        severityAssessable: true,
      };
    }
    if (typeof meta !== "object") return null;
    const label = meta.severityLabel != null ? String(meta.severityLabel) : null;
    const areaRaw = meta.affectedAreaPct ?? meta.affected_area_pct;
    const pctRaw = meta.severityPct ?? meta.severity_pct ?? areaRaw;
    const areaPct =
      areaRaw != null && Number.isFinite(Number(areaRaw))
        ? Math.min(100, Math.max(0, Number(areaRaw)))
        : null;
    const severityPct =
      pctRaw != null && Number.isFinite(Number(pctRaw))
        ? Math.min(100, Math.max(0, Number(pctRaw)))
        : null;
    const assessable =
      meta.severityAssessable != null
        ? Boolean(meta.severityAssessable)
        : Boolean(label && label !== "Unable to Assess" && severityPct != null);
    const rawDiseaseSeverities = meta.diseaseSeverities || meta.disease_severities;
    const diseaseSeverities = {};
    if (rawDiseaseSeverities && typeof rawDiseaseSeverities === "object") {
      Object.entries(rawDiseaseSeverities).forEach(([key, entry]) => {
        if (!entry || typeof entry !== "object") return;
        const entryAreaRaw = entry.affectedAreaPct ?? entry.affected_area_pct;
        const entryPctRaw = entry.severityPct ?? entry.severity_pct ?? entryAreaRaw;
        const entryPct =
          entryPctRaw != null && Number.isFinite(Number(entryPctRaw))
            ? Math.min(100, Math.max(0, Number(entryPctRaw)))
            : null;
        diseaseSeverities[key] = {
          severityPct: entryPct,
          severityLabel: String(entry.severityLabel || entry.severity || "Unable to Assess"),
          affectedAreaPct: entryPct,
          severityAssessable: Boolean(entry.severityAssessable ?? entry.measurable) && entryPct != null,
          severityReason: entry.severityReason || entry.reason || "",
          metric: entry.metric || "visual_symptom_extent",
        };
      });
    }
    return {
      severityPct,
      severityLabel: label,
      affectedAreaPct: areaPct,
      severityAssessable: assessable,
      severityReason: meta.severityReason || meta.reason || "",
      severitySource: meta.severitySource || meta.source || "",
      diseaseSeverities,
    };
  }

  /**
   * Severity from the separate image assessment only. Never from AI confidence / score share.
   * Provisional bands Mild 1–33 / Moderate 34–66 / Severe 67–100 when a measurable % exists.
   */
  function diseaseSeverityLabel(diseaseName, symptomScorePercent, explicitLabel) {
    if (explicitLabel) return String(explicitLabel);
    if (normalizeKey(diseaseName).includes("healthy")) return "Healthy";
    if (symptomScorePercent == null || !Number.isFinite(Number(symptomScorePercent))) {
      return "Unable to Assess";
    }
    const pct = Number(symptomScorePercent);
    if (pct >= 67) return "Severe";
    if (pct >= 34) return "Moderate";
    if (pct > 0) return "Mild";
    return "Unable to Assess";
  }

  function resolveSeverityMeta(scores, severityInput, top) {
    const baseMeta = normalizeSeverityMeta(severityInput) || lastSeverityMeta;
    const diseaseMeta = top?.barKey ? baseMeta?.diseaseSeverities?.[top.barKey] : null;
    const meta = diseaseMeta ? { ...baseMeta, ...diseaseMeta } : baseMeta;
    if (top?.barKey === "healthy") {
      const area =
        meta?.affectedAreaPct != null && Number.isFinite(Number(meta.affectedAreaPct))
          ? Number(meta.affectedAreaPct)
          : meta?.severityPct != null && Number.isFinite(Number(meta.severityPct))
            ? Number(meta.severityPct)
            : 0;
      return {
        severityPct: area,
        severityLabel: "Healthy",
        affectedAreaPct: area,
        severityAssessable: true,
      };
    }
    if (!meta) {
      return {
        severityPct: null,
        severityLabel: "Unable to Assess",
        affectedAreaPct: null,
        severityAssessable: false,
      };
    }
    const diseaseName = HIGHLIGHT_NAMES[top?.barKey] || DISPLAY_NAMES[top?.barKey] || top?.barKey || "";
    const label = diseaseSeverityLabel(diseaseName, meta.severityPct, meta.severityLabel);
    return {
      severityPct: meta.severityPct,
      severityLabel: label,
      affectedAreaPct: meta.affectedAreaPct,
      severityAssessable: Boolean(meta.severityAssessable && label !== "Unable to Assess"),
      severityReason: meta.severityReason || "",
    };
  }

  function highlightForScores(scores, severityInput) {
    const top = findTopDisease(scores);
    if (!top || !(Number(top.pct) > 0)) {
      return {
        diseaseName: "—",
        confidenceText: "—",
        severity: "—",
        severityPct: null,
        affectedAreaText: "—",
        affectedAreaPct: null,
        barKey: "",
        pct: 0,
      };
    }
    const diseaseName = HIGHLIGHT_NAMES[top.barKey] || DISPLAY_NAMES[top.barKey] || top.barKey;
    const resolved = resolveSeverityMeta(scores, severityInput, top);
    // Healthy leaves always show 0% affected area (metric stays visible).
    const isHealthy = top.barKey === "healthy";
    const affectedAreaPct = isHealthy
      ? resolved.affectedAreaPct != null && Number.isFinite(Number(resolved.affectedAreaPct))
        ? Number(resolved.affectedAreaPct)
        : 0
      : resolved.affectedAreaPct;
    const affectedAreaText = isHealthy
      ? `${fmtPct(affectedAreaPct)}%`
      : affectedAreaPct != null && resolved.severityAssessable
        ? `${fmtPct(affectedAreaPct)}%`
        : "—";
    return {
      diseaseName,
      confidenceText: `${fmtPct(top.pct)}%`,
      severity: isHealthy
        ? resolved.severityLabel && resolved.severityLabel !== "Unable to Assess"
          ? resolved.severityLabel
          : "Healthy"
        : resolved.severityLabel || "Unable to Assess",
      severityPct: isHealthy ? affectedAreaPct : resolved.severityPct,
      affectedAreaText,
      affectedAreaPct,
      severityAssessable: isHealthy ? true : resolved.severityAssessable,
      barKey: top.barKey,
      pct: top.pct,
    };
  }

  function renderScanHighlight(root, scores, severityInput) {
    if (!root) return;
    const diseaseEl = root.querySelector("[data-scan-detected-disease]");
    const confidenceEl = root.querySelector("[data-scan-ai-confidence]");
    const severityEl = root.querySelector("[data-scan-symptom-severity]");
    const areaEl = root.querySelector("[data-scan-affected-area]");
    const highlight = highlightForScores(scores, severityInput);
    if (diseaseEl) diseaseEl.textContent = highlight.diseaseName;
    if (confidenceEl) confidenceEl.textContent = highlight.confidenceText;
    if (areaEl) areaEl.textContent = highlight.affectedAreaText;
    if (severityEl) {
      severityEl.textContent = highlight.severity;
      severityEl.classList.remove(
        "scan-highlight__metric-value--healthy",
        "scan-highlight__metric-value--mild",
        "scan-highlight__metric-value--moderate",
        "scan-highlight__metric-value--severe",
        "scan-highlight__metric-value--unable"
      );
      const tone = String(highlight.severity || "")
        .toLowerCase()
        .replace(/\s+/g, "-");
      if (tone === "healthy" || tone === "mild" || tone === "moderate" || tone === "severe") {
        severityEl.classList.add(`scan-highlight__metric-value--${tone}`);
      } else if (tone === "unable-to-assess") {
        severityEl.classList.add("scan-highlight__metric-value--unable");
      }
    }
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

  function treatmentForBarKey(barKey, confidencePercent, severityInput) {
    const diseaseName = DISPLAY_NAMES[barKey] || barKey;
    const key = normalizeKey(barKey);
    const nameKey = normalizeKey(diseaseName);
    const isHealthy = key === "healthy" || nameKey.includes("healthy");
    const resolved = resolveSeverityMeta(
      { [barKey]: confidencePercent },
      severityInput,
      { barKey, pct: confidencePercent }
    );
    const symptomPct = isHealthy
      ? resolved.affectedAreaPct != null
        ? resolved.affectedAreaPct
        : 0
      : resolved.severityPct;

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

    const severity = diseaseSeverityLabel(diseaseName, symptomPct, resolved.severityLabel);
    let urgencyNote;
    let actionSteps = [...base.actionSteps];
    const isCriticalExtent =
      !isHealthy && severity !== "Unable to Assess" && Number(symptomPct) >= 100;

    if (isHealthy && severity !== "Unable to Assess") {
      urgencyNote = "Keep up regular monitoring to catch problems early.";
    } else if (severity === "Unable to Assess") {
      urgencyNote =
        "Severity could not be measured from this image. Confirm symptoms on the plant before treating; follow disease-specific steps cautiously.";
    } else if (isCriticalExtent) {
      urgencyNote =
        "Critical (severity 100%): remove this leaf immediately and destroy it away from the farm. Do not compost.";
      actionSteps = [
        "Remove this leaf immediately; bag it and dispose of it away from healthy plants (do not compost).",
        ...actionSteps,
      ];
    } else if (severity === "Severe") {
      urgencyNote = `Urgent (estimated extent ${fmtPct(symptomPct)}%): start treatment within 24–48 hours.`;
    } else if (severity === "Moderate") {
      urgencyNote = `Moderate (estimated extent ${fmtPct(symptomPct)}%): treat this week before it spreads.`;
    } else if (severity === "Mild") {
      urgencyNote = `Mild (estimated extent ${fmtPct(symptomPct)}%): monitor closely and treat if symptoms worsen.`;
    } else {
      urgencyNote = "Confirm symptoms on the plant before treating.";
    }

    return {
      diseaseName,
      urgencyNote,
      summary: base.summary,
      actionSteps,
      preventionTips: base.preventionTips,
      isCriticalRemoval: isCriticalExtent,
      severity,
      severityPct: symptomPct,
      affectedAreaPct: resolved.affectedAreaPct,
      confidencePercent: Math.min(100, Math.max(0, Number(confidencePercent) || 0)),
    };
  }

  function findTopDisease(scores) {
    const detected = findDetectedMatches(scores);
    return detected[0] || null;
  }

  /** Every score bar above 0% (diseases and healthy), highest first. */
  function findDetectedMatches(scores) {
    if (!scores) return [];
    return BAR_KEYS.map((barKey) => ({
      barKey,
      pct: Math.min(100, Math.max(0, Number(scores[barKey]) || 0)),
    }))
      .filter((item) => item.pct > 0)
      .sort((a, b) => b.pct - a.pct || BAR_KEYS.indexOf(a.barKey) - BAR_KEYS.indexOf(b.barKey));
  }

  function guidesForScores(scores, severityInput) {
    return findDetectedMatches(scores).map(({ barKey, pct }) => {
      const resolved = resolveSeverityMeta(scores, severityInput, { barKey, pct });
      return {
        ...treatmentForBarKey(
          barKey,
          pct,
          barKey === "healthy"
            ? { ...resolved, severityLabel: resolved.severityLabel || "Healthy" }
            : resolved
        ),
        barKey,
        pct,
      };
    });
  }

  function isHealthyGuide(guide) {
    const key = normalizeKey(guide?.barKey || "");
    const name = normalizeKey(guide?.diseaseName || "");
    return key === "healthy" || name.includes("healthy");
  }

  function mergeGuidesWithTopOverride(scores, topGuide, severityInput) {
    const detected = findDetectedMatches(scores);
    if (!detected.length) return [];
    return detected.map((match, index) => {
      const resolved = resolveSeverityMeta(scores, severityInput, match);
      const builtIn = {
        ...treatmentForBarKey(
          match.barKey,
          match.pct,
          match.barKey === "healthy"
            ? { ...resolved, severityLabel: resolved.severityLabel || "Healthy" }
            : resolved
        ),
        barKey: match.barKey,
        pct: match.pct,
      };
      if (index !== 0 || !topGuide || topGuide.error) return builtIn;
      return {
        ...builtIn,
        ...topGuide,
        barKey: match.barKey,
        pct: match.pct,
        diseaseName: topGuide.diseaseName || builtIn.diseaseName,
        severity: builtIn.severity,
        severityPct: builtIn.severityPct,
        confidencePercent: builtIn.confidencePercent,
      };
    });
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

  function renderGuideSectionHtml(guide, index, total) {
    if (!guide) return "";
    const isHealthy = isHealthyGuide(guide);
    const stepsTitle = isHealthy ? "What to do" : "Treatment steps";
    const pct = Number(guide.pct);
    const hasPct = Number.isFinite(pct) && pct > 0;
    const eyebrow =
      total > 1
        ? `Detected${hasPct ? ` · ${fmtPct(pct)}%` : ""}`
        : hasPct
          ? `Match · ${fmtPct(pct)}%`
          : "";
    const urgencyClass = guide.isCriticalRemoval
      ? "scan-treatment-panel__urgency scan-treatment-panel__urgency--critical"
      : "scan-treatment-panel__urgency";

    return `
      <section class="scan-treatment-panel__disease"${index > 0 ? ' data-secondary="true"' : ""}>
        ${eyebrow ? `<p class="scan-treatment-panel__eyebrow">${escapeHtml(eyebrow)}</p>` : ""}
        <h4 class="scan-treatment-panel__title">${escapeHtml(
          guide.diseaseName || (isHealthy ? "Healthy" : "")
        )}</h4>
        <p class="${urgencyClass}">${escapeHtml(guide.urgencyNote)}</p>
        <p class="scan-treatment-panel__summary">${escapeHtml(guide.summary)}</p>
        <h5 class="scan-treatment-panel__subtitle">${stepsTitle}</h5>
        ${renderList(guide.actionSteps, "No steps listed.")}
        ${
          guide.preventionTips?.length
            ? `<h5 class="scan-treatment-panel__subtitle">Prevention</h5>${renderList(guide.preventionTips, "")}`
            : ""
        }
      </section>
    `;
  }

  function renderGuidesHtml(guides) {
    const list = Array.isArray(guides) ? guides.filter(Boolean) : guides ? [guides] : [];
    if (!list.length) return "";
    return (
      list.map((guide, index) => renderGuideSectionHtml(guide, index, list.length)).join("") +
      `<p class="scan-treatment-panel__disclaimer">Guidance only — verify on the plant before treating.</p>`
    );
  }

  function renderPanelContent(guides) {
    const panel = document.getElementById("scan-treatment-panel");
    const html = renderGuidesHtml(guides);
    if (!panel || !html) return;
    panel.innerHTML = html;
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
      <p class="scan-treatment-panel__eyebrow">Top match · ${fmtPct(top.pct)}% · Groq</p>
      <h4 class="scan-treatment-panel__title">${escapeHtml(title)}</h4>
      <p class="scan-treatment-panel__urgency scan-treatment-panel__urgency--critical">${escapeHtml(
        detail || "Check server/.env (GROQ_API_KEY), restart Flask, and use http://127.0.0.1:8765/."
      )}</p>
      <p class="scan-treatment-panel__disclaimer">Built-in rules are off while groqOnlyMode is true in js/Groq/groq-config.js.</p>
    `;
    panel.hidden = false;
  }

  function renderPanel(top, guidesOverride) {
    if (!top) return;
    let guides = Array.isArray(guidesOverride)
      ? guidesOverride
      : guidesOverride
        ? guidesFromStored(guidesOverride, lastScores)
        : null;
    if (!guides?.length) {
      if (!builtInRulesEnabled()) {
        renderPanelError(top, "Groq did not return guidance", "No rule-based fallback in groq-only mode.");
        return;
      }
      guides = lastScores ? guidesForScores(lastScores) : [{ ...treatmentForBarKey(top.barKey, top.pct), barKey: top.barKey, pct: top.pct }];
    }
    if (!guides.length) return;
    renderPanelContent(guides);
    rememberGuide(activeTileKey, guides, lastScores ? scoresKey(lastScores) : "");
  }

  function readRecommendationStore() {
    try {
      const parsed = JSON.parse(localStorage.getItem(REC_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (err) {
      return {};
    }
  }

  function singleGuideRecord(guide) {
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
    const barKey = String(guide.barKey || "").trim();
    if (BAR_KEYS.includes(barKey)) record.barKey = barKey;
    const pct = Math.min(100, Math.max(0, Number(guide.pct) || 0));
    if (pct > 0) record.pct = Math.round(pct * 10) / 10;
    return record;
  }

  function guideRecord(guideOrGuides, scoresKeyValue) {
    const list = Array.isArray(guideOrGuides)
      ? guideOrGuides
      : guideOrGuides?.guides && Array.isArray(guideOrGuides.guides)
        ? guideOrGuides.guides
        : guideOrGuides
          ? [guideOrGuides]
          : [];
    const guides = list.map(singleGuideRecord).filter(Boolean).slice(0, BAR_KEYS.length);
    if (!guides.length) {
      const legacy = singleGuideRecord(guideOrGuides);
      if (!legacy) return null;
      const key = String(scoresKeyValue || guideOrGuides?.scoresKey || "").trim().slice(0, 200);
      if (key) legacy.scoresKey = key;
      return legacy;
    }
    const primary = { ...guides[0] };
    const key = String(
      scoresKeyValue || guideOrGuides?.scoresKey || (Array.isArray(guideOrGuides) ? "" : guideOrGuides?.scoresKey) || ""
    ).trim().slice(0, 200);
    if (key) primary.scoresKey = key;
    if (guides.length > 1) primary.guides = guides;
    return primary;
  }

  function guidesFromStored(stored, scores, severityPct) {
    const symptomPct = severityPct != null ? severityPct : lastSeverityPct;
    const fromScores = scores ? guidesForScores(scores, symptomPct) : [];
    if (stored?.guides?.length) {
      return stored.guides.map((guide) => singleGuideRecord(guide)).filter(Boolean);
    }
    // Older saves only kept the top match — rebuild from scores when more were detected.
    if (fromScores.length > 1) return fromScores;
    if (stored && (stored.summary || stored.actionSteps?.length)) {
      const one = singleGuideRecord(stored);
      if (one) {
        if (!one.barKey && fromScores[0]?.barKey) one.barKey = fromScores[0].barKey;
        if (!one.pct && fromScores[0]?.pct) one.pct = fromScores[0].pct;
        return [one];
      }
    }
    return fromScores;
  }

  function storedGuide(tileId) {
    const id = tileKey(tileId);
    if (!id) return null;
    return guideRecord(readRecommendationStore()[id]);
  }

  function rememberGuide(tileId, guides, key) {
    const id = tileKey(tileId);
    const record = guideRecord(guides, key);
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

  async function captureForSave(tileNum, scores, severityInput) {
    const id = tileKey(tileNum);
    if (!id || !scores) return null;
    const key = scoresKey(scores);
    const existing = storedGuide(id);
    if (existing && existing.scoresKey === key) return existing;
    const top = findTopDisease(scores);
    if (!top) return null;
    const resolved =
      resolveSeverityMeta(scores, severityInput ?? lastSeverityMeta ?? lastSeverityPct, top) ||
      undefined;
    let topGuide = null;
    const client = window.TomatoInsightGroqClient;
    if (client?.groqEnabled?.() && client.fetchCareRecommendation) {
      const result = await client.fetchCareRecommendation(scores, {
        severityPct: resolved?.severityPct,
        severityLabel: resolved?.severityLabel,
      });
      const groqOnly = Boolean(client.groqOnlyMode?.());
      if (result?.ok && result.guide && (!groqOnly || result.groqUsed)) topGuide = result.guide;
      else if (groqOnly) return null;
    }
    let guides = mergeGuidesWithTopOverride(scores, topGuide, resolved);
    if (!guides.length && builtInRulesEnabled()) guides = guidesForScores(scores, resolved);
    if (!guides.length) return null;
    const record = guideRecord(guides, key);
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

  async function requestGroqGuide(client, scores, key, severityInput) {
    if (guideCache.has(key)) return guideCache.get(key);
    if (guideRequests.has(key)) return guideRequests.get(key);
    const resolved = resolveSeverityMeta(scores, severityInput, findTopDisease(scores));

    const request = client
      .fetchCareRecommendation(scores, {
        severityPct: resolved?.severityPct,
        severityLabel: resolved?.severityLabel,
      })
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

  async function loadGroqPanel(top, scores, severityInput) {
    const client = window.TomatoInsightGroqClient;
    const groqOnly = client?.groqOnlyMode?.();
    const key = scoresKey(scores);
    const tile = activeTileKey;
    const resolved =
      resolveSeverityMeta(scores, severityInput ?? lastSeverityMeta ?? lastSeverityPct, top);

    if (guideCache.has(key)) {
      renderPanel(top, mergeGuidesWithTopOverride(scores, guideCache.get(key), resolved));
      return;
    }

    if (!client?.groqEnabled?.() || !client?.fetchCareRecommendation) {
      if (groqOnly) {
        renderPanelError(top, "Groq client not configured", "Set useGroqRecommendations and recommendProxyUrl in js/Groq/groq-config.js.");
      } else {
        renderPanel(top, guidesForScores(scores, resolved));
      }
      return;
    }

    if (!guideRequests.has(key)) renderPanelLoading();

    const result = await requestGroqGuide(client, scores, key, resolved);
    if (!stillShowing(key, tile)) return;

    if (result && !result.error) {
      renderPanel(top, mergeGuidesWithTopOverride(scores, result, resolved));
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

    renderPanel(top, guidesForScores(scores, resolved));
  }

  function setButtonEnabled(enabled) {
    const btn = document.getElementById("scan-treatment-btn");
    if (!btn) return;
    btn.hidden = !enabled;
    btn.disabled = !enabled;
    const top = lastTop;
    const resolved = resolveSeverityMeta(lastScores, lastSeverityMeta ?? lastSeverityPct, top);
    const critical = Boolean(
      top &&
        top.barKey !== "healthy" &&
        resolved.severityLabel !== "Unable to Assess" &&
        Number(resolved.severityPct) >= 100
    );
    if (enabled && critical) {
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
      const guides = guidesFromStored(stored, lastScores);
      renderPanel(lastTop, guides.length ? guides : stored);
      return;
    }
    if (lastScores) loadGroqPanel(lastTop, lastScores, lastSeverityMeta ?? lastSeverityPct);
    else if (builtInRulesEnabled()) renderPanel(lastTop);
    else renderPanelError(lastTop, "No scores for Groq", "Run classification on a leaf scan first.");
  }

  function onScoresUpdated(scores, tileNum, severityInput) {
    const nextTile = tileKey(tileNum);
    if (nextTile) activeTileKey = nextTile;
    const nextScores = scores && Object.keys(scores).length ? { ...scores } : null;
    const nextKey = nextScores ? scoresKey(nextScores) : "";
    const prevKey = lastScores ? scoresKey(lastScores) : "";
    lastScores = nextScores;
    const topPreview = findTopDisease(nextScores);
    lastSeverityMeta =
      severityInput == null || severityInput === ""
        ? null
        : resolveSeverityMeta(nextScores, severityInput, topPreview);
    lastSeverityPct =
      lastSeverityMeta?.severityPct != null && Number.isFinite(Number(lastSeverityMeta.severityPct))
        ? Number(lastSeverityMeta.severityPct)
        : null;
    lastDetected = findDetectedMatches(nextScores);
    lastTop = lastDetected[0] || null;
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
    findDetectedMatches,
    guidesForScores,
    guidesFromStored,
    renderGuidesHtml,
    captureForSave,
    forget: forgetGuide,
    storedForTile: storedGuide,
    scoresKeyFor: scoresKey,
    diseaseSeverityLabel,
    highlightForScores,
    renderScanHighlight,
  };
})();
