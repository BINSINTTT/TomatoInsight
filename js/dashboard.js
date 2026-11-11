(function () {
  const MIN = 1;
  const MAX = 10;
  const STORAGE_KEY = "tomatoInsight.farmLayout";
  const workspace = document.getElementById("farm-workspace");
  const emptyState = document.getElementById("farm-empty-state");
  const gridViewport = document.getElementById("farm-grid-viewport");
  const gridHost = document.getElementById("farm-grid");
  const layoutSummary = document.getElementById("farm-layout-summary");
  const totalPlantsEl = document.getElementById("metric-total-plants");
  const modal = document.getElementById("layout-modal");
  const form = document.getElementById("layout-form");
  const rowsInput = document.getElementById("input-rows");
  const colsInput = document.getElementById("input-columns");
  const previewGrid = document.getElementById("modal-preview-grid");
  const previewCount = document.getElementById("modal-preview-count");
  const tileDrawer = document.getElementById("tile-drawer");
  const tilePlantNameInput = document.getElementById("tile-plant-name-input");
  const tileDrawerTileRef = document.getElementById("tile-drawer-tile-ref");
  const tileDrawerPosition = document.getElementById("tile-drawer-position");
  if (!workspace || !modal) return;

  let layout = loadLayout();
  let tileDrawerCloseTimer = null;
  let activeTileNum = null;
  let activeTileImageDataUrl = null;
  /** Symptom extent from segmentation masks (separate from AI confidence). */
  let activeSeverityPct = null;
  let activeSeverityMeta = null;
  let pendingScanTile = null;
  /** Tile number while validation + classification is still running for an upload. */
  let scanInFlightTile = null;
  let suppressDraft = false;
  const tileDrafts = new Map();
  const tileNameDrafts = new Map();
  /** Tiles with a new successful classification not yet saved (Save Info charges 1 credit). */
  const scanCreditDueTiles = new Set();

  const CLASSIFICATION_ROW_ORDER = ["healthy", "tlcv", "early_blight", "spotted_wilt"];

  const POPOVER_BAR_LABELS = {
    healthy: "Healthy",
    tlcv: "TLCV",
    early_blight: "Early Blight",
    spotted_wilt: "Spotted Wilt",
  };

  const POPOVER_FILL_CLASS = {
    healthy: "scan-result-row__fill--healthy",
    tlcv: "scan-result-row__fill--tlcv",
    early_blight: "scan-result-row__fill--blight",
    spotted_wilt: "scan-result-row__fill--wilt",
  };

  const POPOVER_BADGE_CLASS = {
    healthy: "farm-tile__popover-badge--healthy",
    tlcv: "farm-tile__popover-badge--tlcv",
    early_blight: "farm-tile__popover-badge--blight",
    spotted_wilt: "farm-tile__popover-badge--wilt",
  };

  function findGridTile(tileNum) {
    if (!gridHost) return null;
    return gridHost.querySelector(`.farm-tile[data-tile="${tileNum}"]`);
  }

  function getCurrentClassificationScores() {
    const scores = {};
    CLASSIFICATION_ROW_ORDER.forEach((key) => {
      const val = tileDrawer?.querySelector(`.scan-result-row__value[data-class="${key}"]`);
      scores[key] = Math.min(100, Math.max(0, Number.parseInt(val?.textContent, 10) || 0));
    });
    return scores;
  }

  function showTileSaveMessage(message) {
    const statusEl = document.getElementById("tile-save-status");
    if (!statusEl) return;
    if (!message) {
      statusEl.hidden = true;
      statusEl.textContent = "";
      return;
    }
    statusEl.textContent = message;
    statusEl.hidden = false;
  }

  function updateTileSaveStatus(iso, weekNumber) {
    void iso;
    void weekNumber;
    const statusEl = document.getElementById("tile-save-status");
    if (!statusEl) return;
    if (statusEl.textContent === "Enter a plant name before saving.") return;
    statusEl.hidden = true;
    statusEl.textContent = "";
  }

  function syncTilePlantName(tileNum, tileEl) {
    const tile = tileEl || findGridTile(tileNum);
    if (!tile) return;
    const display = window.TilePlantNames?.displayName?.(tileNum) || `Tile ${tileNum}`;
    const numEl = tile.querySelector(".farm-tile__num");
    const titleEl = tilePopoverHost(tile).querySelector(".farm-tile__popover-title");
    if (numEl) {
      numEl.textContent = display;
      numEl.classList.toggle("farm-tile__num--named", display !== `Tile ${tileNum}`);
    }
    if (titleEl) titleEl.textContent = display;
  }

  function loadPlantNameIntoDrawer(tileNum) {
    if (!tilePlantNameInput) return;
    const custom = window.TilePlantNames?.get?.(tileNum) || "";
    const placeholder = `Tile ${tileNum}`;
    tilePlantNameInput.value = tileNameDrafts.has(String(tileNum))
      ? tileNameDrafts.get(String(tileNum))
      : custom;
    tilePlantNameInput.placeholder = placeholder;
    if (tileDrawerTileRef) tileDrawerTileRef.textContent = placeholder;
  }

  function rememberTileNameDraft(tileNum) {
    if (tileNum == null || !tilePlantNameInput) return;
    const typed = tilePlantNameInput.value;
    const saved = window.TilePlantNames?.get?.(tileNum) || "";
    if (typed.trim() === String(saved).trim()) {
      tileNameDrafts.delete(String(tileNum));
      return;
    }
    tileNameDrafts.set(String(tileNum), typed);
  }

  function activePlantName() {
    return tilePlantNameInput?.value.trim() || "";
  }

  function persistActivePlantName() {
    if (activeTileNum == null || !tilePlantNameInput) return;
    window.TilePlantNames?.set?.(activeTileNum, tilePlantNameInput.value);
    tileNameDrafts.delete(String(activeTileNum));
    syncTilePlantName(activeTileNum, findGridTile(activeTileNum));
  }

  function clampScorePct(value) {
    const n = Math.min(100, Math.max(0, Number(value) || 0));
    return window.TilePlantStorage?.roundPct?.(n) ?? n;
  }

  function fmtPct(value) {
    return window.TilePlantStorage?.formatPct?.(value) ?? String(Math.round(Number(value) || 0));
  }

  function renderPopoverScoreBars(tile, scores, summary) {
    const host = tilePopoverHost(tile);
    const barsWrap = host.querySelector(".farm-tile__popover-bars");
    const listEl = host.querySelector(".farm-tile__popover-bars-list");
    const badgeEl = host.querySelector(".farm-tile__popover-badge");
    if (!barsWrap || !listEl) return;

    const hasScores = scores && CLASSIFICATION_ROW_ORDER.some((key) => clampScorePct(scores[key]) > 0);
    if (!hasScores) {
      barsWrap.hidden = true;
      listEl.innerHTML = "";
      if (badgeEl) badgeEl.hidden = true;
      return;
    }

    const rows = CLASSIFICATION_ROW_ORDER.map((key) => ({
      key,
      pct: clampScorePct(scores[key]),
    }));

    const topPct = rows.reduce((max, row) => Math.max(max, row.pct), 0);
    listEl.innerHTML = rows
      .map(({ key, pct }) => {
        const fillClass = POPOVER_FILL_CLASS[key] || POPOVER_FILL_CLASS.healthy;
        const isTop = pct > 0 && pct === topPct;
        return (
          `<li class="scan-result-row scan-result-row--compact${isTop ? " scan-result-row--top" : ""}">` +
          `<span class="scan-result-row__label">${POPOVER_BAR_LABELS[key] || key}</span>` +
          `<div class="scan-result-row__track" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">` +
          `<div class="scan-result-row__fill ${fillClass}" style="width:${pct}%"></div>` +
          `</div>` +
          `<span class="scan-result-row__value">${fmtPct(pct)}%</span>` +
          `</li>`
        );
      })
      .join("");

    barsWrap.hidden = false;

    const detected = rows
      .filter((row) => row.key !== "healthy" && row.pct > 0)
      .sort((a, b) => b.pct - a.pct);
    if (badgeEl && detected.length) {
      badgeEl.textContent = detected
        .map((row) => `${POPOVER_BAR_LABELS[row.key] || row.key} ${fmtPct(row.pct)}%`)
        .join(" · ");
      badgeEl.hidden = false;
      badgeEl.className = "farm-tile__popover-badge";
      const badgeTone = POPOVER_BADGE_CLASS[detected[0].key];
      if (badgeTone) badgeEl.classList.add(badgeTone);
    } else if (badgeEl) {
      badgeEl.hidden = true;
    }
  }

  function syncTileMoodIcon(tile, summary, severityPct) {
    const iconEl = tile.querySelector(".farm-tile__icon");
    if (!iconEl) return;
    const moodApi = window.TomatoInsightTileEmoji;
    const moodSummary =
      summary && Number.isFinite(Number(severityPct))
        ? { ...summary, severityPct: Number(severityPct) }
        : summary;
    const { mood, src, alt } = moodApi?.moodForSummary?.(moodSummary) || {
      mood: "default",
      src: null,
      alt: "Ready for scan",
    };
    iconEl.classList.remove(
      "farm-tile__icon--default",
      "farm-tile__icon--happy",
      "farm-tile__icon--worry",
      "farm-tile__icon--sad"
    );
    iconEl.classList.add(`farm-tile__icon--${mood}`);

    if (src) {
      let img = iconEl.querySelector("img.farm-tile__icon-img");
      if (!img) {
        iconEl.textContent = "";
        img = document.createElement("img");
        img.className = "farm-tile__icon-img";
        img.width = 38;
        img.height = 38;
        img.decoding = "async";
        iconEl.appendChild(img);
      }
      img.src = src;
      img.alt = alt || "";
    } else {
      iconEl.innerHTML = "";
      const img = document.createElement("img");
      img.className = "farm-tile__icon-img";
      img.src = moodApi?.tileIcon || moodApi?.defaultEmoji || "/img/tileIconLeaf.png";
      img.alt = alt || "Tomato plant";
      img.width = 38;
      img.height = 38;
      img.decoding = "async";
      iconEl.appendChild(img);
    }
  }

  function syncTileActionButtons(tileNum, tileEl) {
    const tile = tileEl || findGridTile(tileNum);
    const cell = tile?.closest(".farm-tile-cell");
    if (!cell) return;
    const info = window.TilePlantStorage?.get?.(tileNum);
    const hasSavedPlant = Boolean(window.TomatoInsightSavedTiles?.tileHasSavedInfo?.(info));
    const notifyBtn = cell.querySelector(".farm-tile__notify");
    const deleteBtn = cell.querySelector(".farm-tile__delete");
    const popup = cell.querySelector(".farm-tile__notify-popup");
    if (notifyBtn) notifyBtn.hidden = !hasSavedPlant;
    if (deleteBtn) deleteBtn.hidden = !hasSavedPlant;
    if (!hasSavedPlant && popup && !popup.hidden) {
      popup.hidden = true;
      notifyBtn?.setAttribute("aria-expanded", "false");
      cell.classList.remove("farm-tile-cell--notify-open");
    }
  }

  function syncTileGridSummary(tileNum, tileEl) {
    const tile = tileEl || findGridTile(tileNum);
    if (!tile) return;
    syncTilePlantName(tileNum, tile);
    const info = window.TilePlantStorage?.get?.(tileNum);
    const summary = window.TilePlantStorage?.diseaseSummaryForInfo?.(info);

    syncTileMoodIcon(tile, summary, info?.severityPct);

    renderPopoverScoreBars(tile, info?.scores, summary);

    const hasData =
      Boolean(info?.imageDataUrl) || Boolean(summary);
    tile.classList.toggle("farm-tile--has-data", hasData);
    syncTileActionButtons(tileNum, tile);

    const toneClass = {
      healthy: "farm-tile--tone-healthy",
      tlcv: "farm-tile--tone-tlcv",
      early_blight: "farm-tile--tone-blight",
      spotted_wilt: "farm-tile--tone-wilt",
    };
    tile.classList.remove(
      "farm-tile--tone-healthy",
      "farm-tile--tone-tlcv",
      "farm-tile--tone-blight",
      "farm-tile--tone-wilt"
    );
    const tone = summary?.barKey ? toneClass[summary.barKey] : "";
    if (tone) tile.classList.add(tone);
  }

  function weekNumberForSave(existing) {
    const fromCalendar = window.TomatoInsightScanCalendar?.weekForScan?.();
    if (Number.isFinite(fromCalendar)) return fromCalendar;
    return window.TomatoInsightSavedTiles?.weekForNextSave?.(existing) ?? 4;
  }

  function buildPlantInfoRecord() {
    const scores = getCurrentClassificationScores();
    const top = window.TilePlantStorage?.findTopScore?.(scores);
    const existing = activeTileNum == null ? null : window.TilePlantStorage?.get?.(activeTileNum);
    const calendar = window.TomatoInsightScanCalendar;
    const schedule = calendar?.read?.();
    const customEnabled = Boolean(schedule?.enabled);
    const scanDayIso = customEnabled
      ? calendar.scanDayIsoForSave?.() || schedule.selected || schedule.anchor || calendar.isoFromDate?.(new Date()) || ""
      : "";
    const savedAt =
      (customEnabled && calendar.savedAtForScan?.()) || new Date().toISOString();
    const highlight = window.TomatoInsightRecommendations?.highlightForScores?.(
      scores,
      activeSeverityMeta ?? activeSeverityPct
    );
    const severityPct =
      activeSeverityMeta?.severityPct != null && Number.isFinite(Number(activeSeverityMeta.severityPct))
        ? Number(activeSeverityMeta.severityPct)
        : activeSeverityPct != null && Number.isFinite(Number(activeSeverityPct))
          ? Number(activeSeverityPct)
          : highlight?.severityPct != null && Number.isFinite(Number(highlight.severityPct))
            ? Number(highlight.severityPct)
            : null;
    const severityLabel =
      activeSeverityMeta?.severityLabel || highlight?.severity || "Unable to Assess";
    const affectedAreaPct =
      activeSeverityMeta?.affectedAreaPct != null &&
      Number.isFinite(Number(activeSeverityMeta.affectedAreaPct))
        ? Number(activeSeverityMeta.affectedAreaPct)
        : highlight?.affectedAreaPct != null && Number.isFinite(Number(highlight.affectedAreaPct))
          ? Number(highlight.affectedAreaPct)
          : null;
    return {
      savedAt,
      scanDayIso,
      weekNumber: weekNumberForSave(existing),
      plantName: activePlantName(),
      imageDataUrl: activeTileImageDataUrl || null,
      scores,
      topBarKey: top?.barKey ?? null,
      topPct: top?.pct ?? 0,
      severityPct: severityPct == null ? null : Math.min(100, Math.max(0, severityPct)),
      severityLabel,
      affectedAreaPct:
        affectedAreaPct == null ? null : Math.min(100, Math.max(0, affectedAreaPct)),
      severityAssessable: Boolean(
        activeSeverityMeta?.severityAssessable ?? highlight?.severityAssessable
      ),
      severitySource: activeSeverityMeta?.severitySource || null,
      severityReason: activeSeverityMeta?.severityReason || "",
      diseaseSeverities: activeSeverityMeta?.diseaseSeverities || {},
      imageQuality: activeSeverityMeta?.imageQuality || null,
      rescanRecommended: Boolean(activeSeverityMeta?.rescanRecommended),
      severityModel: activeSeverityMeta?.severityModel || null,
    };
  }

  function hasPlantInfoToSave() {
    if (activeTileImageDataUrl) return true;
    const scores = getCurrentClassificationScores();
    return Object.values(scores).some((pct) => pct > 0);
  }

  function persistActiveTilePlantInfo() {
    if (activeTileNum == null || !activePlantName() || !hasPlantInfoToSave()) return false;
    const record = buildPlantInfoRecord();
    const ok = window.TilePlantStorage?.set?.(activeTileNum, record);
    if (ok) {
      const calendar = window.TomatoInsightScanCalendar;
      const schedule = calendar?.read?.();
      if (schedule?.enabled) {
        calendar.noteScanDate(
          schedule.selected || schedule.anchor || calendar.isoFromDate(new Date())
        );
      }
      tileDrafts.delete(String(activeTileNum));
      scanCreditDueTiles.delete(String(activeTileNum));
      syncTileGridSummary(activeTileNum);
      updateTileSaveStatus(record.savedAt, record.weekNumber);
      window.TomatoInsightNotifications?.syncTiles?.();
      window.TomatoInsightHomeOverview?.refresh?.();
    }
    return ok;
  }

  function applyPlantInfoToDrawer(info) {
    if (!info) {
      updateTileSaveStatus(null);
      return;
    }

    const zone = document.getElementById("scan-upload-zone");
    const preview = document.getElementById("scan-upload-preview");
    const placeholder = document.getElementById("scan-upload-placeholder");

    if (info.imageDataUrl && preview) {
      activeTileImageDataUrl = info.imageDataUrl;
      preview.src = info.imageDataUrl;
      preview.hidden = false;
      if (placeholder) placeholder.hidden = true;
      zone?.classList.add("scan-upload--has-image");
    }
    syncSaveInfoButton();

    if (info.scores) {
      setClassificationScores(info.scores, "stored", {
        severityPct: info.severityPct,
        severityLabel: info.severityLabel,
        affectedAreaPct: info.affectedAreaPct,
        severityAssessable: info.severityAssessable,
        severitySource: info.severitySource,
        severityReason: info.severityReason,
        diseaseSeverities: info.diseaseSeverities,
        imageQuality: info.imageQuality,
        rescanRecommended: info.rescanRecommended,
        severityModel: info.severityModel,
      });
    }

    updateTileSaveStatus(info.savedAt, info.weekNumber);
  }

  function loadPlantInfoForActiveTile() {
    if (activeTileNum == null) return;
    const info = window.TilePlantStorage?.get?.(activeTileNum);
    if (info) applyPlantInfoToDrawer(info);
    else updateTileSaveStatus(null);
  }

  function resetGridView() {
    if (!gridViewport) return;
    gridViewport.scrollTop = 0;
    gridViewport.scrollLeft = 0;
  }

  function setGridViewportVisible(show) {
    if (gridViewport) gridViewport.hidden = !show;
  }

  function isScanInFlight(tileNum) {
    return scanInFlightTile != null && String(scanInFlightTile) === String(tileNum);
  }

  function refreshScanLoadingUI() {
    const zone = document.getElementById("scan-upload-zone");
    const status = document.getElementById("scan-upload-status");
    const section = tileDrawer?.querySelector(".scan-results");
    const loading = activeTileNum != null && isScanInFlight(activeTileNum);
    zone?.classList.toggle("scan-upload--validating", loading);
    if (status) status.hidden = !loading;
    section?.classList.toggle("scan-results--loading", loading);
    syncSaveInfoButton();
  }

  function beginScanPipeline(tileNum) {
    scanInFlightTile = tileNum;
    refreshScanLoadingUI();
  }

  function endScanPipeline() {
    scanInFlightTile = null;
    refreshScanLoadingUI();
  }

  function openTileDrawer(tileNum, row, col) {
    if (!tileDrawer) return;
    activeTileNum = tileNum;
    loadPlantNameIntoDrawer(tileNum);
    if (tileDrawerPosition) {
      tileDrawerPosition.textContent = `Row ${row + 1} · Column ${col + 1}`;
    }
    const keepScan = isScanInFlight(tileNum);
    resetScanUploadUI({ cancelRequests: false, keepScan });
    if (!keepScan) loadPlantInfoForActiveTile();
    restoreTileDraft(tileNum);
    refreshScanLoadingUI();
    clearTimeout(tileDrawerCloseTimer);
    tileDrawer.hidden = false;
    document.body.classList.add("modal-open");
    requestAnimationFrame(() => {
      tileDrawer.classList.add("tile-drawer--visible");
      refreshScanLoadingUI();
    });
  }

  function plantNameForTile(tileNum) {
    return window.TilePlantNames?.displayName?.(tileNum) || `Tile ${tileNum}`;
  }

  function clearTileReminders(tileNum) {
    const key = "tomatoInsight.scanReminderConfirmed";
    try {
      const raw = JSON.parse(localStorage.getItem(key) || "[]");
      const prefix = `${tileNum}:`;
      const next = (Array.isArray(raw) ? raw : []).filter((item) => !String(item).startsWith(prefix));
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  function deleteTileData(tileNum) {
    const plantName = plantNameForTile(tileNum);
    tileDrafts.delete(String(tileNum));
    tileNameDrafts.delete(String(tileNum));
    if (pendingScanTile != null && String(pendingScanTile) === String(tileNum)) pendingScanTile = null;
    if (scanInFlightTile != null && String(scanInFlightTile) === String(tileNum)) scanInFlightTile = null;
    window.TomatoInsightRecommendations?.forget?.(tileNum);
    window.TilePlantNames?.set?.(tileNum, "");
    window.TilePlantStorage?.recordDeletion?.({ tileNum, plantName });
    window.TilePlantStorage?.remove?.(tileNum);
    clearTileReminders(tileNum);

    if (activeTileNum != null && String(activeTileNum) === String(tileNum)) {
      activeTileNum = null;
      resetScanUploadUI();
      closeTileDrawer();
    }

    syncTileGridSummary(tileNum);
    window.TomatoInsightNotifications?.syncTiles?.();
    window.TomatoInsightHomeOverview?.refresh?.();
  }

  let pendingDeleteTile = null;

  function openDeleteConfirm(tileNum) {
    const dialog = document.getElementById("tile-delete-confirm");
    const message = document.getElementById("tile-delete-confirm-message");
    if (!dialog || !message) return;
    pendingDeleteTile = tileNum;
    const name = plantNameForTile(tileNum);
    message.textContent = `Delete all saved data for ${name}? This removes the plant name, scans, and scores.`;
    dialog.hidden = false;
    dialog.querySelector("[data-cancel-tile-delete]")?.focus();
  }

  function closeDeleteConfirm() {
    const dialog = document.getElementById("tile-delete-confirm");
    pendingDeleteTile = null;
    if (dialog) dialog.hidden = true;
  }

  function initDeleteConfirm() {
    const dialog = document.getElementById("tile-delete-confirm");
    if (!dialog) return;
    dialog.querySelectorAll("[data-cancel-tile-delete]").forEach((el) => {
      el.addEventListener("click", closeDeleteConfirm);
    });
    document.getElementById("tile-delete-confirm-ok")?.addEventListener("click", () => {
      const tileNum = pendingDeleteTile;
      closeDeleteConfirm();
      if (tileNum != null) deleteTileData(tileNum);
    });
  }

  function draftHasScores(scores) {
    return Boolean(scores && Object.values(scores).some((pct) => Number(pct) > 0));
  }

  function scoresDifferFromSaved(tileNum, scores) {
    const saved = window.TilePlantStorage?.get?.(tileNum);
    if (!saved?.scores) return draftHasScores(scores);
    return CLASSIFICATION_ROW_ORDER.some((scoreKey) => {
      const current = Math.min(100, Math.max(0, Number(scores?.[scoreKey]) || 0));
      const stored = Math.min(100, Math.max(0, Number(saved.scores?.[scoreKey]) || 0));
      return Math.abs(current - stored) >= 0.05;
    });
  }

  function markScanCreditDue(tileNum, scores) {
    if (tileNum == null || !draftHasScores(scores)) return;
    if (!scoresDifferFromSaved(tileNum, scores)) {
      scanCreditDueTiles.delete(String(tileNum));
      return;
    }
    scanCreditDueTiles.add(String(tileNum));
  }

  function scanNeedsCreditCharge(tileNum) {
    return tileNum != null && scanCreditDueTiles.has(String(tileNum));
  }

  function rememberTileDraft(tileNum, patch) {
    if (tileNum == null || suppressDraft) return;
    const key = String(tileNum);
    const prev = tileDrafts.get(key) || {};
    const next = {
      imageDataUrl:
        patch.imageDataUrl !== undefined ? patch.imageDataUrl : prev.imageDataUrl || null,
      scores: patch.scores !== undefined ? patch.scores : prev.scores || null,
      severityPct:
        patch.severityPct !== undefined
          ? patch.severityPct
          : prev.severityPct != null
            ? prev.severityPct
            : null,
      severityMeta:
        patch.severityMeta !== undefined
          ? patch.severityMeta
          : prev.severityMeta != null
            ? prev.severityMeta
            : null,
    };
    if (!next.imageDataUrl && !draftHasScores(next.scores)) {
      tileDrafts.delete(key);
      return;
    }

    const saved = window.TilePlantStorage?.get?.(tileNum);
    const imageSame = (next.imageDataUrl || null) === (saved?.imageDataUrl || null);
    const scoresSame = CLASSIFICATION_ROW_ORDER.every((scoreKey) => {
      const current = Math.min(100, Math.max(0, Number(next.scores?.[scoreKey]) || 0));
      const stored = Math.min(100, Math.max(0, Number(saved?.scores?.[scoreKey]) || 0));
      return Math.abs(current - stored) < 0.05;
    });
    if (imageSame && scoresSame) {
      tileDrafts.delete(key);
      return;
    }
    tileDrafts.set(key, next);
  }

  function snapshotOpenDrawer() {
    if (activeTileNum == null) return;
    const preview = document.getElementById("scan-upload-preview");
    const imageDataUrl =
      activeTileImageDataUrl || (preview && !preview.hidden ? preview.src || null : null);
    rememberTileDraft(activeTileNum, {
      imageDataUrl,
      scores: getCurrentClassificationScores(),
      severityPct: activeSeverityPct,
      severityMeta: activeSeverityMeta,
    });
  }

  function restoreTileDraft(tileNum) {
    const draft = tileDrafts.get(String(tileNum));
    if (!draft) return;
    const zone = document.getElementById("scan-upload-zone");
    const preview = document.getElementById("scan-upload-preview");
    const placeholder = document.getElementById("scan-upload-placeholder");
    if (draft.imageDataUrl && preview) {
      activeTileImageDataUrl = draft.imageDataUrl;
      preview.src = draft.imageDataUrl;
      preview.hidden = false;
      if (placeholder) placeholder.hidden = true;
      zone?.classList.add("scan-upload--has-image");
    }
    if (draft.scores) {
      setClassificationScores(
        draft.scores,
        "stored",
        draft.severityMeta || { severityPct: draft.severityPct }
      );
      markScanCreditDue(tileNum, draft.scores);
    }
    syncSaveInfoButton();
  }

  function closeTileDrawer() {
    if (!tileDrawer) return;
    snapshotOpenDrawer();
    rememberTileNameDraft(activeTileNum);
    tileDrawer.classList.remove("tile-drawer--visible");
    clearTimeout(tileDrawerCloseTimer);
    tileDrawerCloseTimer = setTimeout(() => {
      tileDrawer.hidden = true;
      if (modal.hidden) document.body.classList.remove("modal-open");
    }, 320);
  }

  function getClassificationList() {
    return tileDrawer?.querySelector(".scan-results__list");
  }

  function restoreClassificationRowOrder() {
    const list = getClassificationList();
    if (!list) return;
    CLASSIFICATION_ROW_ORDER.forEach((key) => {
      const row = tileDrawer.querySelector(
        `.scan-result-row__fill[data-class="${key}"]`
      )?.closest(".scan-result-row");
      if (row) list.appendChild(row);
    });
  }

  function setClassificationScores(scores, source, severityMeta) {
    if (!tileDrawer) return;
    const fromScan = source === "scan";
    const scanTile = pendingScanTile;
    const updateDom = !fromScan || (scanTile != null && String(scanTile) === String(activeTileNum));
    const keys = CLASSIFICATION_ROW_ORDER;
    let totalScore = 0;
    keys.forEach((key) => {
      const pct = Math.min(100, Math.max(0, Number(scores?.[key]) || 0));
      totalScore += pct;
      if (!updateDom) return;
      const fill = tileDrawer.querySelector(`.scan-result-row__fill[data-class="${key}"]`);
      const val = tileDrawer.querySelector(`.scan-result-row__value[data-class="${key}"]`);
      const track = fill?.parentElement;
      if (fill) fill.style.width = `${pct}%`;
      if (val) val.textContent = `${fmtPct(pct)}%`;
      if (track) track.setAttribute("aria-valuenow", String(Math.round(pct)));
    });

    if (source === "reset") {
      activeSeverityPct = null;
      activeSeverityMeta = null;
    } else if (severityMeta && typeof severityMeta === "object") {
      activeSeverityMeta = {
        severityPct:
          severityMeta.severityPct != null && Number.isFinite(Number(severityMeta.severityPct))
            ? Math.min(100, Math.max(0, Number(severityMeta.severityPct)))
            : null,
        severityLabel: severityMeta.severityLabel || null,
        affectedAreaPct:
          severityMeta.affectedAreaPct != null &&
          Number.isFinite(Number(severityMeta.affectedAreaPct))
            ? Math.min(100, Math.max(0, Number(severityMeta.affectedAreaPct)))
            : null,
        severityAssessable: Boolean(severityMeta.severityAssessable),
        severityReason: severityMeta.severityReason || "",
        severitySource: severityMeta.severitySource || "",
        diseaseSeverities:
          severityMeta.diseaseSeverities && typeof severityMeta.diseaseSeverities === "object"
            ? severityMeta.diseaseSeverities
            : {},
        imageQuality:
          severityMeta.imageQuality && typeof severityMeta.imageQuality === "object"
            ? severityMeta.imageQuality
            : null,
        rescanRecommended: Boolean(severityMeta.rescanRecommended),
        severityModel: severityMeta.severityModel || null,
      };
      activeSeverityPct = activeSeverityMeta.severityPct;
    } else if (severityMeta != null && Number.isFinite(Number(severityMeta))) {
      activeSeverityPct = Math.min(100, Math.max(0, Number(severityMeta)));
      activeSeverityMeta = {
        severityPct: activeSeverityPct,
        severityLabel: null,
        affectedAreaPct: activeSeverityPct,
        severityAssessable: true,
      };
    } else if (fromScan || source === "stored") {
      // Never invent severity from confidence scores when assessment is missing.
      activeSeverityPct = null;
      activeSeverityMeta = {
        severityPct: null,
        severityLabel: "Unable to Assess",
        affectedAreaPct: null,
        severityAssessable: false,
      };
    }

    if (updateDom) restoreClassificationRowOrder();

    if (fromScan && scanTile != null) {
      rememberTileDraft(scanTile, {
        scores,
        severityPct: activeSeverityPct,
        severityMeta: activeSeverityMeta,
      });
      if (totalScore > 0) markScanCreditDue(scanTile, scores);
    }

    if (!updateDom) return;
    window.TomatoInsightRecommendations?.renderScanHighlight?.(
      tileDrawer.querySelector(".scan-highlight"),
      scores,
      activeSeverityMeta ?? activeSeverityPct
    );
    const hasImage = document
      .getElementById("scan-upload-zone")
      ?.classList.contains("scan-upload--has-image");
    window.TomatoInsightRecommendations?.onScoresUpdated?.(
      totalScore > 0 && hasImage ? scores : {},
      activeTileNum,
      activeSeverityMeta ?? activeSeverityPct
    );
  }

  function resetScanUploadUI(options = {}) {
    const cancelRequests = options.cancelRequests !== false;
    const keepScan = options.keepScan === true;
    const zone = document.getElementById("scan-upload-zone");
    const input = document.getElementById("scan-upload-input");
    const preview = document.getElementById("scan-upload-preview");
    const placeholder = document.getElementById("scan-upload-placeholder");
    suppressDraft = true;
    if (input) input.value = "";
    if (!keepScan) {
      if (preview) {
        preview.hidden = true;
        preview.removeAttribute("src");
      }
      if (placeholder) placeholder.hidden = false;
      zone?.classList.remove("scan-upload--has-image", "scan-upload--dragover", "scan-upload--validating");
      const status = document.getElementById("scan-upload-status");
      if (status) status.hidden = true;
      tileDrawer?.querySelector(".scan-results")?.classList.remove("scan-results--loading");
      activeTileImageDataUrl = null;
      setClassificationScores({}, "reset");
      updateTileSaveStatus(null);
    }
    if (cancelRequests) {
      window.TomatoInsightValidation?.resetUI?.();
      scanInFlightTile = null;
    }
    suppressDraft = false;
    syncSaveInfoButton();
  }

  function syncSaveInfoButton() {
    const saveBtn = document.getElementById("tile-save-info-btn");
    if (!saveBtn) return;
    const zone = document.getElementById("scan-upload-zone");
    const loading =
      (activeTileNum != null && isScanInFlight(activeTileNum)) ||
      zone?.classList.contains("scan-upload--validating");
    const hasImage = zone?.classList.contains("scan-upload--has-image");
    saveBtn.disabled = Boolean(loading || !hasImage);
  }

  function showScanPreview(file, tileNum) {
    const zone = document.getElementById("scan-upload-zone");
    const preview = document.getElementById("scan-upload-preview");
    const placeholder = document.getElementById("scan-upload-placeholder");
    if (!file?.type?.startsWith("image/")) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : null;
      if (!dataUrl) return;
      rememberTileDraft(tileNum, { imageDataUrl: dataUrl });
      if (String(activeTileNum) !== String(tileNum)) return;
      activeTileImageDataUrl = dataUrl;
      if (preview) {
        preview.src = dataUrl;
        preview.hidden = false;
      }
      if (placeholder) placeholder.hidden = true;
      zone?.classList.add("scan-upload--has-image");
      syncSaveInfoButton();
    };
    reader.readAsDataURL(file);
  }

  function showScanNotice(variant, title, message) {
    if (window.TomatoInsightValidation?.showNotice) {
      window.TomatoInsightValidation.showNotice(variant, title, message);
      return;
    }
    window.alert(message);
  }

  function showCreditBlock(gate) {
    const noneLeft = gate?.code === "insufficient-credits";
    if (noneLeft && window.TomatoInsightCredits?.showOutOfCreditModal) {
      window.TomatoInsightCredits.showOutOfCreditModal();
      return;
    }
    showScanNotice(
      "error",
      "Credits unavailable",
      gate?.error || "Could not reach your credit balance. Try again."
    );
  }

  async function handleScanImageFile(file) {
    if (!file?.type?.startsWith("image/")) return;
    pendingScanTile = activeTileNum;
    beginScanPipeline(activeTileNum);
    showScanPreview(file, activeTileNum);
    window.TomatoInsightValidation?.validateImageFile?.(file);
  }

  function initScanUpload() {
    const zone = document.getElementById("scan-upload-zone");
    const input = document.getElementById("scan-upload-input");
    if (!zone || !input) return;

    zone.addEventListener("click", (e) => {
      if (e.target === input) return;
      input.click();
    });
    zone.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        input.click();
      }
    });
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (file) handleScanImageFile(file);
    });
    ["dragenter", "dragover"].forEach((type) => {
      zone.addEventListener(type, (e) => {
        e.preventDefault();
        zone.classList.add("scan-upload--dragover");
      });
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("scan-upload--dragover"));
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("scan-upload--dragover");
      const file = e.dataTransfer?.files?.[0];
      if (file) handleScanImageFile(file);
    });
  }

  function initTileDrawer() {
    if (!tileDrawer) return;
    tileDrawer.querySelectorAll("[data-close-tile-drawer]").forEach((el) => {
      el.addEventListener("click", closeTileDrawer);
    });
    initScanUpload();

    tilePlantNameInput?.addEventListener("input", () => {
      const statusEl = document.getElementById("tile-save-status");
      if (
        activePlantName() &&
        statusEl?.textContent === "Enter a plant name before saving."
      ) {
        showTileSaveMessage("");
      }
      rememberTileNameDraft(activeTileNum);
    });

    const saveBtn = document.getElementById("tile-save-info-btn");
    saveBtn?.addEventListener("click", async () => {
      if (saveBtn.disabled) return;
      if (!activePlantName()) {
        showTileSaveMessage("Enter a plant name before saving.");
        tilePlantNameInput?.focus();
        return;
      }
      if (!hasPlantInfoToSave()) {
        updateTileSaveStatus(null);
        return;
      }
      const original = saveBtn.textContent;
      const savedTile = activeTileNum;
      const savedScores = getCurrentClassificationScores();
      const needsCredit = scanNeedsCreditCharge(savedTile);
      saveBtn.disabled = true;
      saveBtn.textContent = "Saving...";

      let charged = false;
      let chargeResult = null;
      if (needsCredit) {
        if (!window.TomatoInsightCredits?.ensureReadyForScan) {
          saveBtn.disabled = false;
          saveBtn.textContent = original;
          showScanNotice("error", "Credits unavailable", "Scan credits are still loading. Try again in a moment.");
          return;
        }
        const gate = await window.TomatoInsightCredits.ensureReadyForScan();
        if (!gate.ok) {
          saveBtn.disabled = false;
          saveBtn.textContent = original;
          showCreditBlock(gate);
          return;
        }
        const charge = await window.TomatoInsightCredits.spendForSuccessfulScan();
        if (!charge?.ok) {
          saveBtn.disabled = false;
          saveBtn.textContent = original;
          showCreditBlock(charge);
          return;
        }
        charged = true;
        chargeResult = charge;
      }

      persistActivePlantName();
      if (window.TomatoInsightRecommendations?.captureForSave) {
        try {
          await window.TomatoInsightRecommendations.captureForSave(
            savedTile,
            savedScores,
            activeSeverityMeta ?? activeSeverityPct
          );
        } catch (err) {
          console.error("[TomatoInsight] Could not store care recommendation:", err);
        }
      }
      const ok = persistActiveTilePlantInfo();
      if (!ok && charged) {
        await window.TomatoInsightCredits?.refundScanCredit?.();
      }
      saveBtn.disabled = false;
      if (ok) {
        if (charged && chargeResult?.ok) {
          const cost = window.TomatoInsightCredits?.SCAN_CREDIT_COST ?? 1;
          const balanceAfter =
            chargeResult.balance ?? window.TomatoInsightCredits?.getBalance?.() ?? null;
          window.TomatoInsightCredits?.showCreditDeductionToast?.(cost, balanceAfter);
        }
        saveBtn.textContent = "Saved!";
        setTimeout(() => {
          if (saveBtn.textContent === "Saved!") saveBtn.textContent = original;
        }, 1600);
      } else {
        saveBtn.textContent = original;
        if (charged) {
          showScanNotice("error", "Save failed", "Your credit was returned because the save did not complete.");
        }
      }
    });
  }

  window.TomatoInsightScan = {
    setClassificationScores(scores, severityMeta) {
      setClassificationScores(scores, "scan", severityMeta);
    },
    syncSaveInfoButton,
    refreshScanLoadingUI,
    endPipeline: endScanPipeline,
  };

  function tilePopoverHost(tile) {
    return tile?.closest(".farm-tile-cell") || tile;
  }

  function adjustTilePopoverPlacement(tile) {
    const popover = tilePopoverHost(tile).querySelector(".farm-tile__popover");
    if (!popover || !gridViewport || gridViewport.hidden) return;

    popover.classList.remove("farm-tile__popover--below");
    popover.classList.add("farm-tile__popover--placement");

    const margin = 10;
    const vp = gridViewport.getBoundingClientRect();
    let rect = popover.getBoundingClientRect();

    if (rect.top < vp.top + margin) {
      popover.classList.add("farm-tile__popover--below");
      rect = popover.getBoundingClientRect();
    }

    if (popover.classList.contains("farm-tile__popover--below") && rect.bottom > vp.bottom - margin) {
      popover.classList.remove("farm-tile__popover--below");
    }

    popover.classList.remove("farm-tile__popover--placement");
  }

  function bindTilePopoverPlacement(tile) {
    const refreshNote = () => {
      const num = tile.dataset.tile;
      if (num) syncTileGridSummary(num);
    };
    tile.addEventListener("mouseenter", () => {
      refreshNote();
      adjustTilePopoverPlacement(tile);
    });
    tile.addEventListener("focus", () => {
      refreshNote();
      adjustTilePopoverPlacement(tile);
    });
    tile.addEventListener("mouseleave", () => {
      tilePopoverHost(tile).querySelector(".farm-tile__popover")?.classList.remove("farm-tile__popover--below");
    });
  }

  function getTileNumber(r, c, rows, columns) {
    const fromBottomRow = rows - 1 - r;
    const isEvenFromBottom = fromBottomRow % 2 === 0;
    const colOffset = isEvenFromBottom ? columns - 1 - c : c;
    return fromBottomRow * columns + colOffset + 1;
  }

  function clamp(value) {
    const n = parseInt(String(value), 10);
    if (Number.isNaN(n)) return MIN;
    return Math.min(MAX, Math.max(MIN, n));
  }

  function loadLayout() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (data.rows >= MIN && data.columns >= MIN) {
        return { rows: clamp(data.rows), columns: clamp(data.columns) };
      }
    } catch (_) {
      /* ignore */
    }
    return null;
  }

  function tileNumbersForLayout(rows, columns) {
    const numbers = new Set();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) numbers.add(getTileNumber(r, c, rows, columns));
    }
    return numbers;
  }

  function tilesRemovedByLayout(rows, columns) {
    const kept = tileNumbersForLayout(rows, columns);
    const affected = new Set();

    const saved = window.TilePlantStorage?.loadAll?.() || {};
    Object.entries(saved).forEach(([num, info]) => {
      const tileNum = Number(num);
      if (!Number.isFinite(tileNum) || kept.has(tileNum)) return;
      if (window.TomatoInsightSavedTiles?.tileHasSavedInfo?.(info)) affected.add(tileNum);
    });

    const names = window.TilePlantNames?.loadAll?.() || {};
    Object.entries(names).forEach(([num, name]) => {
      const tileNum = Number(num);
      if (!Number.isFinite(tileNum) || kept.has(tileNum)) return;
      if (String(name || "").trim()) affected.add(tileNum);
    });

    tileDrafts.forEach((draft, num) => {
      const tileNum = Number(num);
      if (!Number.isFinite(tileNum) || kept.has(tileNum)) return;
      if (draft?.imageDataUrl || draftHasScores(draft?.scores)) affected.add(tileNum);
    });

    tileNameDrafts.forEach((name, num) => {
      const tileNum = Number(num);
      if (!Number.isFinite(tileNum) || kept.has(tileNum)) return;
      if (String(name || "").trim()) affected.add(tileNum);
    });

    if (activeTileNum != null && !kept.has(Number(activeTileNum))) {
      const preview = document.getElementById("scan-upload-preview");
      const imageDataUrl =
        activeTileImageDataUrl || (preview && !preview.hidden ? preview.src || null : null);
      if (imageDataUrl || draftHasScores(getCurrentClassificationScores())) {
        affected.add(Number(activeTileNum));
      }
    }

    return [...affected].sort((a, b) => a - b);
  }

  function showLayoutBlockedAlert(tileNums) {
    const names = tileNums.map(
      (tileNum) => window.TilePlantNames?.displayName?.(tileNum) || `Tile ${tileNum}`
    );
    const list = names.length === 1 ? names[0] : names.join(", ");
    const message =
      names.length === 1
        ? `Layout can't be changed because ${list} still has data and would be removed.`
        : `Layout can't be changed because these tiles still have data and would be removed: ${list}.`;

    const note = document.getElementById("layout-blocked-message");
    if (note) {
      note.textContent = message;
      note.hidden = false;
    }
    window.alert(message);
  }

  function clearLayoutBlockedAlert() {
    const note = document.getElementById("layout-blocked-message");
    if (!note) return;
    note.hidden = true;
    note.textContent = "";
  }

  function saveLayout(rows, columns) {
    layout = { rows, columns };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    window.TomatoInsightStorageSnapshot?.schedule?.();
    window.TomatoInsightUserData?.syncLayout?.(layout);
    window.TomatoInsightUserData?.flushFarmToCloud?.();
    window.TomatoInsightUserData?.notifyLocalChange?.("layout");
    renderDashboard();
  }

  function renderPreview(rows, columns) {
    previewGrid.innerHTML = "";
    previewGrid.style.setProperty("--farm-cols", String(columns));
    previewCount.textContent = String(rows * columns);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) {
        const tile = document.createElement("div");
        tile.className = "farm-tile farm-tile--preview";
        tile.textContent = getTileNumber(r, c, rows, columns);
        previewGrid.appendChild(tile);
      }
    }
  }

  function readFormDimensions() {
    const rows = clamp(rowsInput.value);
    const columns = clamp(colsInput.value);
    rowsInput.value = rows;
    colsInput.value = columns;
    return { rows, columns };
  }

  function renderDashboard() {
    if (!layout) {
      workspace.classList.add("farm-workspace--empty");
      if (emptyState) emptyState.hidden = false;
      setGridViewportVisible(false);
      gridHost.innerHTML = "";
      resetGridView();
      if (layoutSummary) {
        layoutSummary.hidden = false;
        layoutSummary.textContent = "Not set";
      }
      if (totalPlantsEl) totalPlantsEl.textContent = "0";
      window.TomatoInsightHomeOverview?.refresh?.();
      return;
    }

    const { rows, columns } = layout;
    workspace.classList.remove("farm-workspace--empty");
    if (emptyState) emptyState.hidden = true;
    setGridViewportVisible(true);
    gridHost.innerHTML = "";
    gridHost.style.setProperty("--farm-cols", String(columns));
    resetGridView();

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) {
        const tileNum = getTileNumber(r, c, rows, columns);
        const cell = document.createElement("div");
        cell.className = "farm-tile-cell";

        const tile = document.createElement("button");
        tile.type = "button";
        tile.className = "farm-tile";
        tile.dataset.tile = String(tileNum);
        tile.innerHTML =
          '<span class="farm-tile__icon farm-tile__icon--default" aria-hidden="true">' +
          '<img class="farm-tile__icon-img" src="/img/tileIconLeaf.png" alt="" width="38" height="38" decoding="async">' +
          "</span>" +
          `<span class="farm-tile__num">${tileNum}</span>`;

        const popover = document.createElement("span");
        popover.className = "farm-tile__popover";
        popover.setAttribute("role", "tooltip");
        popover.innerHTML =
          `<span class="farm-tile__popover-head">` +
          `<span class="farm-tile__popover-title">Tile ${tileNum}</span>` +
          `<span class="farm-tile__popover-badge" hidden></span>` +
          `</span>` +
          `<div class="farm-tile__popover-bars" hidden>` +
          `<p class="farm-tile__popover-bars-title">Scan results</p>` +
          `<ul class="farm-tile__popover-bars-list scan-results__list"></ul>` +
          `</div>`;
        tile.addEventListener("click", (e) => {
          e.stopPropagation();
          openTileDrawer(tileNum, r, c);
        });

        const notifyBtn = document.createElement("button");
        notifyBtn.type = "button";
        notifyBtn.className = "farm-tile__notify";
        notifyBtn.hidden = true;
        notifyBtn.setAttribute("aria-label", `Notifications for Tile ${tileNum}`);
        notifyBtn.setAttribute("aria-expanded", "false");
        notifyBtn.setAttribute("aria-controls", `tile-notify-${tileNum}`);
        notifyBtn.innerHTML =
          `<svg viewBox="0 0 24 24" aria-hidden="true">` +
          `<path fill="currentColor" d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>` +
          `</svg>` +
          `<span class="farm-tile__notify-count" hidden>0</span>`;
        notifyBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          window.TomatoInsightNotifications?.toggleTilePopup?.(tileNum, notifyBtn);
        });

        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "farm-tile__delete";
        deleteBtn.hidden = true;
        deleteBtn.setAttribute("aria-label", `Delete Tile ${tileNum}`);
        deleteBtn.innerHTML =
          `<svg viewBox="0 0 24 24" aria-hidden="true">` +
          `<path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>` +
          `</svg>`;
        deleteBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          openDeleteConfirm(tileNum);
        });

        const popup = document.createElement("div");
        popup.className = "farm-tile__notify-popup";
        popup.id = `tile-notify-${tileNum}`;
        popup.hidden = true;
        popup.setAttribute("role", "dialog");
        popup.setAttribute("aria-label", `Notifications for Tile ${tileNum}`);

        cell.append(tile, notifyBtn, deleteBtn, popup, popover);
        gridHost.appendChild(cell);
        syncTileGridSummary(tileNum, tile);
        bindTilePopoverPlacement(tile);
      }
    }

    window.TomatoInsightNotifications?.syncTiles?.();

    if (layoutSummary) {
      layoutSummary.hidden = false;
      layoutSummary.textContent = `${rows} × ${columns}`;
    }
    if (totalPlantsEl) {
      totalPlantsEl.textContent = String(rows * columns);
    }
    window.TomatoInsightHomeOverview?.refresh?.();

  }

  function openModal() {
    const rows = layout ? layout.rows : 3;
    const columns = layout ? layout.columns : 3;
    rowsInput.value = rows;
    colsInput.value = columns;
    renderPreview(rows, columns);
    clearLayoutBlockedAlert();
    modal.hidden = false;
    document.body.classList.add("modal-open");
    rowsInput.focus();
  }

  function closeModal() {
    modal.hidden = true;
    document.body.classList.remove("modal-open");
  }

  workspace.addEventListener("click", () => {
    if (workspace.classList.contains("farm-workspace--empty")) {
      openModal();
    }
  });

  workspace.addEventListener("keydown", (e) => {
    if (
      workspace.classList.contains("farm-workspace--empty") &&
      (e.key === "Enter" || e.key === " ")
    ) {
      e.preventDefault();
      openModal();
    }
  });

  document.getElementById("btn-edit-layout")?.addEventListener("click", (e) => {
    e.stopPropagation();
    openModal();
  });

  modal.querySelectorAll("[data-close-modal]").forEach((el) => {
    el.addEventListener("click", closeModal);
  });

  modal.addEventListener("click", (e) => {
    if (e.target === modal.querySelector(".modal__backdrop")) {
      closeModal();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const deleteConfirm = document.getElementById("tile-delete-confirm");
    if (deleteConfirm && !deleteConfirm.hidden) {
      closeDeleteConfirm();
      return;
    }
    if (tileDrawer && !tileDrawer.hidden && tileDrawer.classList.contains("tile-drawer--visible")) {
      closeTileDrawer();
      return;
    }
    if (!modal.hidden) closeModal();
  });

  function bindStepper(btnId, inputId, delta) {
    document.getElementById(btnId)?.addEventListener("click", () => {
      const input = document.getElementById(inputId);
      input.value = clamp(parseInt(input.value, 10) + delta);
      const dims = readFormDimensions();
      renderPreview(dims.rows, dims.columns);
      clearLayoutBlockedAlert();
    });
  }

  bindStepper("rows-decrement", "input-rows", -1);
  bindStepper("rows-increment", "input-rows", 1);
  bindStepper("cols-decrement", "input-columns", -1);
  bindStepper("cols-increment", "input-columns", 1);

  rowsInput.addEventListener("input", () => {
    const dims = readFormDimensions();
    renderPreview(dims.rows, dims.columns);
    clearLayoutBlockedAlert();
  });
  colsInput.addEventListener("input", () => {
    const dims = readFormDimensions();
    renderPreview(dims.rows, dims.columns);
    clearLayoutBlockedAlert();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const { rows, columns } = readFormDimensions();
    const affected = tilesRemovedByLayout(rows, columns);
    if (affected.length) {
      showLayoutBlockedAlert(affected);
      return;
    }
    clearLayoutBlockedAlert();
    saveLayout(rows, columns);
    closeModal();
  });

  initTileDrawer();
  initDeleteConfirm();

  function reloadFarmFromStorage() {
    layout = loadLayout();
    renderDashboard();
  }

  function bootDashboardFromCloud() {
    const boot = window.TomatoInsightAppPageLoad?.boot;
    const run = boot
      ? boot({ message: "Loading your farm…" })
      : Promise.resolve();
    run.then(() => {
      reloadFarmFromStorage();
    });
  }

  window.addEventListener("tomatoInsight:userDataReady", (event) => {
    const detail = event.detail || {};
    const shouldRefresh = window.TomatoInsightUserData?.shouldRefreshUiForUserDataEvent?.(detail);
    // Always apply cloud hydrate results. Skip only pure local-cache announces when the grid is already up.
    if (shouldRefresh === false && detail.fromCache && layout) return;
    reloadFarmFromStorage();
  });
  window.addEventListener("tomatoInsight:userDataCleared", reloadFarmFromStorage);
  window.addEventListener("tomatoInsight:farmDataChanged", (event) => {
    // Local layout save already re-renders; still reload for cloud/other sources.
    if (event.detail?.source === "layout" && event.detail?.local) return;
    reloadFarmFromStorage();
  });

  bootDashboardFromCloud();
})();
