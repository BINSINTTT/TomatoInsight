(function () {
  const BAR_KEYS = ["healthy", "tlcv", "early_blight", "spotted_wilt"];
  const VIRAL_KEYS = new Set(["tlcv", "spotted_wilt"]);

  const DISPLAY_NAMES = {
    healthy: "Healthy",
    tlcv: "Tomato Leaf Curl Virus (TLCV)",
    early_blight: "Early blight",
    spotted_wilt: "Spotted wilt",
  };

  const UNASSESSABLE_STEPS = [
    "Retake the scan with one leaf in focus, evenly lit, and filling the frame.",
    "Check the plant for the listed disease symptoms before starting treatment.",
    "Use disease-specific treatment only after the affected-area severity can be assessed.",
  ];
  const UNASSESSABLE_VIRAL_STEPS = [
    "Retake the scan with one leaf in focus, evenly lit, and filling the frame.",
    "Check the whole plant and nearby plants for symptoms before deciding whether to remove it.",
    "Manage the insects that spread this virus while its visible severity is being assessed.",
  ];

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
        const entryAreaPct =
          entryAreaRaw != null && Number.isFinite(Number(entryAreaRaw))
            ? Math.min(100, Math.max(0, Number(entryAreaRaw)))
            : entryPct;
        diseaseSeverities[key] = {
          severityPct: entryPct,
          severityLabel: String(entry.severityLabel || entry.severity || "Unable to Assess"),
          affectedAreaPct: entryAreaPct,
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
  /**
   * Band comes from symptom area on the leaf: Mild 1–33, Moderate 34–66, Severe 67–100.
   * A stored "Unable to Assess" label must not hide a measured percentage.
   */
  function diseaseSeverityLabel(diseaseName, symptomScorePercent, explicitLabel) {
    const explicit = explicitLabel == null ? "" : String(explicitLabel).trim();
    const hasArea =
      symptomScorePercent != null && Number.isFinite(Number(symptomScorePercent));
    if (normalizeKey(diseaseName).includes("healthy")) {
      return explicit && explicit.toLowerCase() !== "unable to assess" ? explicit : "Healthy";
    }
    const returnedBand = {
      mild: "Mild",
      moderate: "Moderate",
      severe: "Severe",
    }[explicit.toLowerCase()];
    if (returnedBand) return returnedBand;
    if (hasArea) {
      const pct = Number(symptomScorePercent);
      if (pct >= 67) return "Severe";
      if (pct >= 34) return "Moderate";
      if (pct > 0) return "Mild";
    }
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
        diseaseSeverities: baseMeta?.diseaseSeverities || {},
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
    const areaKnown =
      meta.severityPct != null && Number.isFinite(Number(meta.severityPct)) && Number(meta.severityPct) > 0;
    return {
      severityPct: meta.severityPct,
      severityLabel: label,
      affectedAreaPct: meta.affectedAreaPct ?? (areaKnown ? meta.severityPct : null),
      severityAssessable: label !== "Unable to Assess" && (Boolean(meta.severityAssessable) || areaKnown),
      severityReason: meta.severityReason || "",
      diseaseSeverities: baseMeta?.diseaseSeverities || {},
    };
  }

  function highlightForScores(scores, severityInput) {
    const top = findTopDisease(scores);
    if (!top || !(Number(top.pct) > 0)) {
      return {
        diseaseName: "—",
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
    const severityEl = root.querySelector("[data-scan-symptom-severity]");
    const areaEl = root.querySelector("[data-scan-affected-area]");
    const highlight = highlightForScores(scores, severityInput);
    if (diseaseEl) diseaseEl.textContent = highlight.diseaseName;
    if (areaEl) areaEl.textContent = highlight.affectedAreaText;
    if (severityEl) {
      const band = highlight.severity;
      severityEl.textContent = band;
      severityEl.classList.remove(
        "scan-highlight__metric-value--healthy",
        "scan-highlight__metric-value--mild",
        "scan-highlight__metric-value--moderate",
        "scan-highlight__metric-value--severe",
        "scan-highlight__metric-value--unable"
      );
      const tone = String(band || "")
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
      severitySteps: {
        Mild: [
          "Remove and destroy the visibly infected leaves; do not compost them.",
          "Avoid overhead watering; water at the base in the morning.",
          "Inspect lower leaves closely and rescan if the affected area increases.",
        ],
        Moderate: [
          "Remove and destroy infected leaves; do not compost them.",
          "Improve airflow by spacing plants and pruning lower foliage.",
          "Avoid overhead watering; water at the base in the morning.",
          "Apply a copper-based or chlorothalonil fungicide per label directions.",
        ],
        Severe: [
          "Remove and destroy heavily infected leaves immediately; do not compost them.",
          "Apply a copper-based or chlorothalonil fungicide per label directions.",
          "Improve airflow by spacing plants and pruning lower foliage.",
          "Avoid overhead watering; water at the base in the morning.",
          "Inspect nearby tomato plants for lower-leaf symptoms.",
        ],
      },
      preventionTips: [
        "Mulch around plants to reduce soil splash onto leaves.",
        "Inspect lower leaves weekly during humid weather.",
      ],
    };
  }

  function spottedWiltTreatment() {
    return {
      summary:
        "Suspected tomato spotted wilt virus (TSWV) has no cure. Thrips spread it between plants; this leaf's visible severity does not confirm whole-plant infection.",
      actionSteps: [
        "Check the whole plant and confirm the suspected virus before removing it.",
        "Monitor and manage thrips to protect nearby plants; follow locally approved product labels.",
        "Remove weeds around the plot that can host thrips and the virus.",
      ],
      severitySteps: {
        Mild: [
          "Check the whole plant and nearby plants; confirm the suspected virus before removing a plant.",
          "Monitor for thrips and manage them to protect nearby plants, following local product labels.",
          "Remove nearby weeds that can host thrips and the virus.",
        ],
        Moderate: [
          "Check the whole plant and seek confirmation promptly; consider removing it if infection is confirmed, especially when young.",
          "Monitor and manage thrips to limit spread to nearby plants, following local product labels.",
          "Remove nearby weeds that can host thrips and the virus.",
          "Inspect neighboring tomato plants for new symptoms.",
        ],
        Severe: [
          "Seek confirmation urgently; if infection is confirmed, remove the whole plant to limit virus spread.",
          "Monitor and manage thrips to protect nearby plants, following local product labels.",
          "Remove nearby weeds that can host thrips and the virus.",
          "Inspect neighboring tomato plants promptly.",
        ],
      },
      preventionTips: [
        "Thrips carry tomato spotted wilt virus from infected plants to healthy plants; monitor and manage them.",
        "Use TSWV-resistant tomato varieties when available.",
        "Use healthy transplants and remove weeds that may host thrips.",
      ],
    };
  }

  function yellowLeafCurlTreatment() {
    return {
      summary:
        "Suspected tomato leaf curl virus has no cure. Whiteflies spread leaf curl viruses between plants; this leaf's visible severity does not confirm whole-plant infection.",
      actionSteps: [
        "Check the whole plant and confirm the suspected virus before removing it.",
        "Monitor and manage whiteflies to protect nearby plants; follow locally approved product labels.",
        "Remove nearby weeds that can host whiteflies and the virus.",
      ],
      severitySteps: {
        Mild: [
          "Check new growth and nearby plants; confirm the suspected virus before removing a plant.",
          "Monitor and manage whiteflies, especially under leaves, to protect nearby plants.",
          "Rescan if visible symptoms increase.",
        ],
        Moderate: [
          "Check the whole plant and seek confirmation promptly; consider removing confirmed infected plants when infection is limited in the plot.",
          "Monitor and manage whiteflies to protect nearby plants, following local product labels.",
          "Remove nearby weeds and inspect neighboring plants for curling and yellowing.",
        ],
        Severe: [
          "Seek confirmation urgently; if infection is confirmed, remove the whole plant to protect nearby plants.",
          "Monitor and manage whiteflies to limit spread, following local product labels.",
          "Remove nearby weeds and inspect neighboring tomato plants promptly.",
        ],
      },
      preventionTips: [
        "Whiteflies carry tomato leaf curl virus from infected plants to healthy plants; monitor and manage them.",
        "Use healthy transplants and leaf curl virus-resistant varieties where available.",
        "Inspect new growth and nearby plants for curling, yellowing, and whitefly activity.",
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
    const isViral = VIRAL_KEYS.has(barKey);
    let urgencyNote;
    const actionSteps = [
      ...(!isHealthy && severity === "Unable to Assess"
        ? isViral ? UNASSESSABLE_VIRAL_STEPS : UNASSESSABLE_STEPS
        : base.severitySteps?.[severity] || base.actionSteps),
    ];
    const isCriticalExtent = !isHealthy && severity === "Severe";

    if (isHealthy && severity !== "Unable to Assess") {
      urgencyNote = "Keep up regular monitoring to catch problems early.";
    } else if (severity === "Unable to Assess") {
      urgencyNote =
        "Severity could not be measured from this image. Confirm symptoms on the plant before choosing disease-specific actions.";
    } else if (severity === "Severe") {
      urgencyNote = `Severe: follow the urgent ${isViral ? "management" : "care"} steps now.`;
    } else if (severity === "Moderate") {
      urgencyNote = `Moderate: begin the ${isViral ? "management" : "care"} steps this week.`;
    } else if (severity === "Mild") {
      urgencyNote = `Mild: use the early ${isViral ? "management" : "care"} steps and monitor closely.`;
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
      recommendationBasis: "affected_area_severity",
    };
  }

  function findTopDisease(scores) {
    const detected = findDetectedMatches(scores);
    return detected[0] || null;
  }

  /** Every returned detection above 0% (diseases and healthy), highest first. */
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
    const baseMeta = normalizeSeverityMeta(severityInput) || lastSeverityMeta;
    const matches = findDetectedMatches(scores);
    const hasDiseaseMatch = matches.some((match) => match.barKey !== "healthy");
    return matches.map((match, index) => {
      const ownSeverity = baseMeta?.diseaseSeverities?.[match.barKey];
      const severityForMatch = index === 0
        ? resolveSeverityMeta(scores, severityInput, match)
        : ownSeverity?.severityAssessable
          ? ownSeverity
          : { severityPct: null, affectedAreaPct: null, severityLabel: "Unable to Assess", severityAssessable: false };
      const guide = {
        ...treatmentForBarKey(match.barKey, match.pct, severityForMatch),
        barKey: match.barKey,
        pct: match.pct,
        isSecondary: index > 0,
      };
      if (match.barKey === "healthy" && hasDiseaseMatch) {
        guide.urgencyNote = "Review the possible disease detection below and continue monitoring.";
        guide.summary = "Healthy tissue may be present, but this result does not rule out the other model detection. Check visible symptoms before acting.";
      }
      return guide;
    });
  }

  function isHealthyGuide(guide) {
    const key = normalizeKey(guide?.barKey || "");
    const name = normalizeKey(guide?.diseaseName || "");
    return key === "healthy" || name.includes("healthy");
  }

  function mergeGuidesWithTopOverride(scores, topGuide, severityInput) {
    const guides = guidesForScores(scores, severityInput);
    const builtIn = guides[0];
    if (!builtIn || !topGuide || topGuide.error) return guides;
    const mergedTop = {
      ...builtIn,
      ...topGuide,
      barKey: builtIn.barKey,
      pct: builtIn.pct,
      diseaseName: topGuide.diseaseName || builtIn.diseaseName,
      severity: builtIn.severity,
      severityPct: builtIn.severityPct,
      affectedAreaPct: builtIn.affectedAreaPct,
      confidencePercent: builtIn.confidencePercent,
      recommendationBasis: "affected_area_severity",
      ...(VIRAL_KEYS.has(builtIn.barKey) ? {
        urgencyNote: builtIn.urgencyNote,
        summary: builtIn.summary,
        actionSteps: builtIn.actionSteps,
        preventionTips: builtIn.preventionTips,
        isCriticalRemoval: builtIn.isCriticalRemoval,
      } : {}),
      ...(builtIn.barKey === "healthy" && guides.some((guide) => guide.barKey !== "healthy") ? {
        urgencyNote: builtIn.urgencyNote,
        summary: builtIn.summary,
      } : {}),
    };
    return [mergedTop, ...guides.slice(1)];
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
    const diseaseName = guide.barKey === "tlcv" || /(?:yellow\s*leaf\s*curl|tomato\s*leaf\s*curl|\btlcv\b)/i.test(guide.diseaseName || "")
      ? DISPLAY_NAMES.tlcv
      : guide.diseaseName;
    const isHealthy = isHealthyGuide(guide);
    const isViral = VIRAL_KEYS.has(guide.barKey) || /(?:leaf\s*curl|spotted\s*wilt)/i.test(diseaseName || "");
    const stepsTitle = isHealthy ? "What to do" : isViral ? "Management actions" : "Treatment steps";
    const severity = String(guide.severity || "").trim();
    const eyebrow = index > 0
      ? `Additional model detection · ${fmtPct(guide.pct ?? guide.confidencePercent)}% confidence`
      : isHealthy
      ? "Healthy care plan"
      : severity === "Severe"
        ? "Intervention"
      : severity && severity !== "Unable to Assess"
        ? `${severity} care plan`
        : "General care guidance · severity unavailable";
    return `
      <section class="scan-treatment-panel__disease"${index > 0 ? ' data-secondary="true"' : ""}>
        ${eyebrow ? `<p class="scan-treatment-panel__eyebrow">${escapeHtml(eyebrow)}</p>` : ""}
        <h4 class="scan-treatment-panel__title">${escapeHtml(
          diseaseName || (isHealthy ? "Healthy" : "")
        )}</h4>
        ${index > 0 ? `<p class="scan-treatment-panel__summary">This is another model detection, not a confirmed second diagnosis.${severity === "Unable to Assess" ? " Its severity was not assessed." : ""} Check this leaf and nearby plants before acting.</p>` : ""}
        <p class="scan-treatment-panel__summary">${escapeHtml(guide.summary)}</p>
        <h5 class="scan-treatment-panel__subtitle">${stepsTitle}</h5>
        ${renderList(guide.actionSteps, "No steps listed.")}
        ${
          guide.preventionTips?.length
            ? `<h5 class="scan-treatment-panel__subtitle">${isViral ? "Prevent spread to other plants" : "Prevention"}</h5>${renderList(guide.preventionTips, "")}`
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
      `<p class="scan-treatment-panel__disclaimer">Guidance only — confirm the diagnosis before removing a plant or applying products.</p>`
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
    rememberGuide(
      activeTileKey,
      guides,
      lastScores ? scoresKey(lastScores) : "",
      lastScores ? recommendationKey(lastScores, lastSeverityMeta ?? lastSeverityPct) : ""
    );
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
    const severity = String(guide.severity || "").trim();
    if (["Healthy", "Mild", "Moderate", "Severe", "Unable to Assess"].includes(severity)) {
      record.severity = severity;
    }
    const severityPct = guide.severityPct == null ? NaN : Number(guide.severityPct);
    if (Number.isFinite(severityPct) && severityPct >= 0) {
      record.severityPct = Math.round(Math.min(100, severityPct) * 10) / 10;
    }
    const affectedAreaRaw = guide.affectedAreaPct ?? guide.severityPct;
    const affectedAreaPct = affectedAreaRaw == null ? NaN : Number(affectedAreaRaw);
    if (Number.isFinite(affectedAreaPct) && affectedAreaPct >= 0) {
      record.affectedAreaPct = Math.round(Math.min(100, affectedAreaPct) * 10) / 10;
    }
    if (guide.recommendationBasis === "affected_area_severity") {
      record.recommendationBasis = "affected_area_severity";
    }
    if (guide.source === "groq" || guide.source === "rules") record.source = guide.source;
    return record;
  }

  function guideRecord(guideOrGuides, scoresKeyValue, recommendationKeyValue) {
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
      const recKey = String(
        recommendationKeyValue || guideOrGuides?.recommendationKey || ""
      ).trim().slice(0, 280);
      if (recKey) legacy.recommendationKey = recKey;
      return legacy;
    }
    const primary = { ...guides[0] };
    const key = String(
      scoresKeyValue || guideOrGuides?.scoresKey || (Array.isArray(guideOrGuides) ? "" : guideOrGuides?.scoresKey) || ""
    ).trim().slice(0, 200);
    if (key) primary.scoresKey = key;
    const recKey = String(
      recommendationKeyValue ||
        guideOrGuides?.recommendationKey ||
        (Array.isArray(guideOrGuides) ? "" : guideOrGuides?.recommendationKey) ||
        ""
    ).trim().slice(0, 280);
    if (recKey) primary.recommendationKey = recKey;
    if (guides.length > 1) primary.guides = guides;
    return primary;
  }

  function guidesFromStored(stored, scores, severityPct) {
    const symptomPct = severityPct != null ? severityPct : lastSeverityPct;
    const fromScores = scores ? guidesForScores(scores, symptomPct) : [];
    if (stored?.guides?.length) {
      return stored.guides.map((guide) => singleGuideRecord(guide)).filter(Boolean);
    }
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
    const stored = readRecommendationStore()[id];
    return guideRecord(stored, stored?.scoresKey, stored?.recommendationKey);
  }

  function rememberGuide(tileId, guides, scoreKey, recKey) {
    const id = tileKey(tileId);
    const record = guideRecord(guides, scoreKey, recKey);
    if (!id || !record || !window.TomatoInsightScan?.isDisplayingSavedPlant(id)) return;
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

  async function captureForSave(tileNum, scores, severityInput, persist = true) {
    const id = tileKey(tileNum);
    if (!id || !scores) return null;
    const top = findTopDisease(scores);
    if (!top) return null;
    const resolved =
      resolveSeverityMeta(scores, severityInput ?? lastSeverityMeta ?? lastSeverityPct, top) ||
      undefined;
    const scoreKey = scoresKey(scores);
    const recKey = recommendationKey(scores, resolved);
    const existing = storedGuide(id);
    if (existing && existing.recommendationKey === recKey) return existing;
    let topGuide = null;
    const client = window.TomatoInsightGroqClient;
    if (client?.groqEnabled?.() && client.fetchCareRecommendation) {
      const result = await requestGroqGuide(client, scores, recKey, resolved);
      if (result && !result.error) topGuide = result;
      else if (client.groqOnlyMode?.()) return null;
    }
    let guides = mergeGuidesWithTopOverride(scores, topGuide, resolved);
    if (!guides.length && builtInRulesEnabled()) guides = guidesForScores(scores, resolved);
    if (!guides.length) return null;
    const record = guideRecord(guides, scoreKey, recKey);
    if (!record || !persist) return record;
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

  function recommendationKey(scores, severityInput) {
    const top = findTopDisease(scores);
    const resolved = resolveSeverityMeta(scores, severityInput, top);
    const severity = String(resolved?.severityLabel || "Unable to Assess").trim();
    const areaRaw = resolved?.affectedAreaPct ?? resolved?.severityPct;
    const area = areaRaw == null ? NaN : Number(areaRaw);
    const areaKey = Number.isFinite(area) && area >= 0 ? String(Math.round(area * 10) / 10) : "na";
    const additionalSeverity = findDetectedMatches(scores)
      .slice(1)
      .map(({ barKey }) => {
        const meta = resolved?.diseaseSeverities?.[barKey];
        const pct = meta?.affectedAreaPct ?? meta?.severityPct;
        const area = pct != null && Number.isFinite(Number(pct)) ? Math.round(Number(pct) * 10) / 10 : "na";
        return `${barKey}:${meta?.severityAssessable ? `${meta.severityLabel}:${area}` : "na"}`;
      })
      .join("|");
    return `multi-guides-v2|${scoresKey(scores)}|severity:${severity}|affected:${areaKey}|additional:${additionalSeverity}`;
  }

  function stillShowing(key, tile) {
    return (
      isOpenForActiveTile() &&
      activeTileKey === tile &&
      recommendationKey(lastScores, lastSeverityMeta ?? lastSeverityPct) === key
    );
  }

  async function requestGroqGuide(client, scores, key, severityInput) {
    if (guideCache.has(key)) return guideCache.get(key);
    if (guideRequests.has(key)) return guideRequests.get(key);
    const resolved = resolveSeverityMeta(scores, severityInput, findTopDisease(scores));

    const request = client
      .fetchCareRecommendation(scores, {
        affectedAreaPct: resolved?.affectedAreaPct,
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
    const resolved =
      resolveSeverityMeta(scores, severityInput ?? lastSeverityMeta ?? lastSeverityPct, top);
    const key = recommendationKey(scores, resolved);
    const tile = activeTileKey;

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
    btn.textContent = "View Intervention";
    if (!enabled) clearPanelDisplay();
  }

  function showRecommendations() {
    if (!lastTop) return;
    setOpenForActiveTile(true);
    const btn = document.getElementById("scan-treatment-btn");
    btn?.setAttribute("aria-expanded", "true");
    const stored = storedGuide(activeTileKey);
    const currentKey = lastScores
      ? recommendationKey(lastScores, lastSeverityMeta ?? lastSeverityPct)
      : "";
    if (stored && stored.recommendationKey && stored.recommendationKey === currentKey) {
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
    const prevKey = lastScores
      ? recommendationKey(lastScores, lastSeverityMeta ?? lastSeverityPct)
      : "";
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
    const nextKey = nextScores
      ? recommendationKey(nextScores, lastSeverityMeta ?? lastSeverityPct)
      : "";
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
    recommendationKeyFor: recommendationKey,
    diseaseSeverityLabel,
    highlightForScores,
    renderScanHighlight,
  };
})();
