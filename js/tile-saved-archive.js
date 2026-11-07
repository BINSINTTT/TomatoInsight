(function () {
  const CLASSIFICATION_ROW_ORDER = ["healthy", "tlcv", "early_blight", "spotted_wilt"];

  function formatSavedTimestamp(iso, options) {
    if (!iso) return options?.unknownLabel ?? "Save date unknown";
    try {
      return new Date(iso).toLocaleString(undefined, {
        dateStyle: options?.dateStyle ?? "medium",
        timeStyle: options?.timeStyle ?? "short",
      });
    } catch {
      return iso;
    }
  }

  function tileHasSavedInfo(info) {
    if (!info || typeof info !== "object") return false;
    if (info.savedAt || info.imageDataUrl) return true;
    const scores = info.scores;
    if (!scores) return false;
    return Object.values(scores).some((pct) => Number(pct) > 0);
  }

  function badgeForSummary(summary, mode) {
    if (!summary) {
      return { className: "badge badge--history", label: "Saved" };
    }
    if (summary.barKey === "healthy") {
      return { className: "badge badge--healthy", label: "OK" };
    }
    if (mode === "history") {
      return { className: "badge badge--watch", label: "Issue" };
    }
    /* Alert = Severe symptom extent (67–100%); Watch = Mild/Moderate. */
    const severityPct = Number.isFinite(Number(summary.severityPct))
      ? Number(summary.severityPct)
      : summary.pct;
    if (severityPct >= 67) {
      return { className: "badge badge--alert", label: "Alert" };
    }
    return { className: "badge badge--watch", label: "Watch" };
  }

  function statusBucket(summary) {
    if (!summary || summary.barKey === "healthy") return "healthy";
    const severityPct = Number.isFinite(Number(summary.severityPct))
      ? Number(summary.severityPct)
      : summary.pct;
    if (severityPct >= 67) return "alert";
    return "watch";
  }

  function isIssue(summary) {
    return Boolean(summary && summary.barKey !== "healthy");
  }

  function isWithinPastWeek(iso) {
    if (!iso) return false;
    const saved = new Date(iso);
    if (Number.isNaN(saved.getTime())) return false;
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return saved.getTime() >= weekAgo;
  }

  const FARM_WEEK_STORAGE_KEY = "tomatoInsight.selectedFarmWeek";
  const FARM_WEEK_FIRST = 4;
  const FARM_WEEK_LAST = 12;

  const FARM_WEEK_CHART_LABELS = {
    healthy: "Healthy",
    tlcv: "TLCV",
    early_blight: "Blight",
    spotted_wilt: "Wilt",
  };

  function isFarmWeekNumber(value) {
    const n = Number(value);
    return !Number.isNaN(n) && n >= FARM_WEEK_FIRST && n <= FARM_WEEK_LAST;
  }

  function getSelectedFarmWeek() {
    try {
      const raw = localStorage.getItem(FARM_WEEK_STORAGE_KEY);
      const n = Number.parseInt(raw, 10);
      if (isFarmWeekNumber(n)) return n;
    } catch {
      /* ignore */
    }
    return FARM_WEEK_FIRST;
  }

  function setSelectedFarmWeek(weekNumber) {
    const n = Number(weekNumber);
    if (!isFarmWeekNumber(n)) return;
    try {
      localStorage.setItem(FARM_WEEK_STORAGE_KEY, String(n));
      window.TomatoInsightUserData?.syncFarmWeek?.(n);
      window.TomatoInsightUserData?.notifyLocalChange?.("farm-week");
    } catch {
      /* ignore */
    }
  }

  /** Fixed farm weeks. Week 4 is the first scan. Another Save Info updates the same week. */
  function buildFarmWeekOptions() {
    const weeks = [];
    for (let n = FARM_WEEK_FIRST; n <= FARM_WEEK_LAST; n += 1) {
      weeks.push({
        key: String(n),
        weekNumber: n,
        label: `Week ${n}`,
      });
    }
    return weeks;
  }

  function findWeekByKey(weeks, key) {
    return weeks.find((w) => w.key === String(key)) || null;
  }

  /** Older saves used Week 3 as the first scan. Treat those as Week 4. */
  function canonicalWeekNumber(value) {
    const week = Number(value);
    if (week === 3) return FARM_WEEK_FIRST;
    return week;
  }

  function weekScanMap(info) {
    const map = {};
    function add(scan, fallbackWeek) {
      const raw = Number(scan?.weekNumber ?? fallbackWeek);
      const n = canonicalWeekNumber(raw);
      if (!isFarmWeekNumber(n) || !scan) return;
      if (map[n] && raw === 3) return;
      map[n] = { ...scan, weekNumber: n };
    }
    if (info?.weeks && typeof info.weeks === "object") {
      Object.entries(info.weeks).forEach(([key, scan]) => add(scan, key));
    }
    const top = canonicalWeekNumber(info?.weekNumber);
    if (isFarmWeekNumber(top) && info && !map[top] && tileHasSavedInfo(info)) {
      map[top] = {
        savedAt: info.savedAt || null,
        weekNumber: top,
        scores: info.scores || {},
        topBarKey: info.topBarKey ?? null,
        topPct: info.topPct ?? 0,
        severityPct: Math.min(100, Math.max(0, Number(info.severityPct) || 0)),
      };
    }
    return map;
  }

  /** The week Save Info should update. A second click stays on this week. */
  function weekForNextSave(existing) {
    if (!existing || !tileHasSavedInfo(existing)) return FARM_WEEK_FIRST;
    const current = canonicalWeekNumber(existing.weekNumber);
    if (isFarmWeekNumber(current)) return current;
    const savedWeeks = Object.keys(weekScanMap(existing))
      .map(Number)
      .filter((week) => isFarmWeekNumber(week));
    if (!savedWeeks.length) return FARM_WEEK_FIRST;
    return Math.min(...savedWeeks);
  }

  function summaryForScan(scan) {
    if (!scan) return null;
    return window.TilePlantStorage?.diseaseSummaryForInfo?.(scan) || null;
  }

  function filterTilesByFarmWeek(tiles, weekKey) {
    if (!weekKey) return tiles;
    const target = Number(weekKey);
    if (!isFarmWeekNumber(target)) return tiles;
    return tiles.flatMap((tile) => {
      const scan = weekScanMap(tile.info)[target];
      if (!scan) return [];
      const info = {
        ...tile.info,
        ...scan,
        weekNumber: target,
        imageDataUrl: Number(tile.info?.weekNumber) === target ? tile.info.imageDataUrl : null,
      };
      return [
        {
          ...tile,
          info,
          summary: summaryForScan(info),
        },
      ];
    });
  }

  /**
   * Week 4 is the first scan. The latest scan is the highest later week.
   * A new week replaces the latest side and the summary is computed again.
   */
  function compareTileScan(info) {
    const byWeek = weekScanMap(info);
    const baseline = byWeek[FARM_WEEK_FIRST] || null;
    const laterWeeks = Object.keys(byWeek)
      .map(Number)
      .filter((week) => week > FARM_WEEK_FIRST)
      .sort((a, b) => a - b);
    const latestWeek = laterWeeks.length ? laterWeeks[laterWeeks.length - 1] : null;
    const latest = latestWeek != null ? byWeek[latestWeek] : null;
    const first = summaryForScan(baseline);
    const last = summaryForScan(latest);
    const outcome = describeScanChange(first, last, latestWeek);

    return {
      baselineWeek: FARM_WEEK_FIRST,
      baseline,
      first,
      latestWeek,
      latest,
      last,
      outcome,
    };
  }

  function listScanWeeks(info) {
    const byWeek = weekScanMap(info);
    return Object.keys(byWeek)
      .map(Number)
      .filter((week) => week >= FARM_WEEK_FIRST)
      .sort((a, b) => a - b)
      .map((week) => ({
        week,
        scan: byWeek[week],
        summary: summaryForScan(byWeek[week]),
      }));
  }

  function compareAgainstPrevious(info, selectedWeek) {
    const weeks = listScanWeeks(info);
    const index = weeks.findIndex((item) => item.week === Number(selectedWeek));
    if (index < 0) return null;
    const current = weeks[index];
    const past = index > 0 ? weeks[index - 1] : null;
    return {
      pastWeek: past?.week ?? null,
      past: past?.scan ?? null,
      pastSummary: past?.summary ?? null,
      currentWeek: current.week,
      current: current.scan,
      currentSummary: current.summary,
      outcome: past
        ? describeScanChange(past.summary, current.summary, current.week)
        : describeScanChange(current.summary, null, null),
    };
  }

  function describeScanChange(first, last, latestWeek) {
    if (!first && !last) return null;
    if (first && !last) {
      return {
        tone: "waiting",
        label: "First scan",
        line: `Week ${FARM_WEEK_FIRST} · ${first.label} ${fmtPct(first.pct)}%`,
      };
    }
    if (!first && last) {
      return {
        tone: "missing",
        label: `Need Week ${FARM_WEEK_FIRST}`,
        line: `Week ${latestWeek} · ${last.label} ${fmtPct(last.pct)}%`,
      };
    }

    const sameKey = first.barKey === last.barKey;
    const samePct = Math.abs(first.pct - last.pct) < 0.05;
    if (sameKey && samePct) {
      return {
        tone: "same",
        label: "Same",
        line: `${first.label} ${fmtPct(first.pct)}%`,
      };
    }

    const arrow = `${first.label} ${fmtPct(first.pct)}% → ${last.label} ${fmtPct(last.pct)}%`;
    if (first.barKey !== "healthy" && last.barKey === "healthy") {
      return { tone: "better", label: "Improved", line: arrow };
    }
    if (first.barKey === "healthy" && last.barKey !== "healthy") {
      return { tone: "worse", label: "Worse", line: arrow };
    }
    if (sameKey) {
      const rose = last.pct > first.pct;
      const better = first.barKey === "healthy" ? rose : !rose;
      return { tone: better ? "better" : "worse", label: better ? "Improved" : "Worse", line: arrow };
    }
    return { tone: "changed", label: "Changed", line: arrow };
  }

  function mountWeekPicker(container, weeks, selectedKey, onSelect) {
    if (!container) return;
    container.innerHTML = "";
    container.hidden = false;

    weeks.forEach((week) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "filter-chip";
      btn.dataset.weekKey = week.key;
      btn.textContent = week.label;
      btn.classList.toggle("filter-chip--active", week.key === String(selectedKey));
      btn.addEventListener("click", () => {
        setSelectedFarmWeek(week.weekNumber);
        onSelect(week.key, week);
      });
      container.appendChild(btn);
    });
  }

  function renderFarmWeekChart(chartEl, captionEl, tiles, week) {
    if (!chartEl) return;

    const keys = CLASSIFICATION_ROW_ORDER;
    const labels = keys.map((key) => FARM_WEEK_CHART_LABELS[key] || key);

    if (!week) {
      chartEl.innerHTML = "";
      if (captionEl) captionEl.textContent = "";
      return;
    }

    const avgs = keys.map((key) => {
      const vals = tiles.map(({ info }) => Math.min(100, Math.max(0, Number(info?.scores?.[key]) || 0)));
      if (!vals.length) return 0;
      return vals.reduce((sum, v) => sum + v, 0) / vals.length;
    });

    const max = Math.max(1, ...avgs);
    chartEl.innerHTML = avgs
      .map((avg, i) => {
        const pct = Math.max(12, (avg / max) * 100);
        return (
          `<div class="chart-placeholder__day">` +
          `<div class="chart-placeholder__bar" style="height: ${pct}%"></div>` +
          `<span class="chart-placeholder__day-label">${escapeHtml(labels[i])}</span>` +
          `</div>`
        );
      })
      .join("");

    if (captionEl) {
      if (!tiles.length) {
        captionEl.textContent = `${week.label} · No scans saved for this farm week yet.`;
      } else {
        captionEl.textContent = `${week.label} · ${tiles.length} scan${tiles.length === 1 ? "" : "s"} · average scores`;
      }
    }
  }

  function collectSavedTiles(sort) {
    const all = window.TilePlantStorage?.loadAll?.() || {};
    const tiles = Object.entries(all)
      .filter(([, info]) => tileHasSavedInfo(info))
      .map(([tileNum, info]) => {
        const num = Number.parseInt(tileNum, 10);
        const summary = window.TilePlantStorage?.diseaseSummaryForInfo?.(info);
        return {
          tileNum: Number.isNaN(num) ? tileNum : num,
          info,
          summary,
          displayName: window.TilePlantNames?.displayName?.(tileNum) || `Tile ${tileNum}`,
        };
      });

    if (sort === "date") {
      tiles.sort((a, b) => {
        const aTime = a.info.savedAt ? new Date(a.info.savedAt).getTime() : 0;
        const bTime = b.info.savedAt ? new Date(b.info.savedAt).getTime() : 0;
        if (bTime !== aTime) return bTime - aTime;
        const aNum = Number(a.tileNum);
        const bNum = Number(b.tileNum);
        if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) return aNum - bNum;
        return String(a.tileNum).localeCompare(String(b.tileNum));
      });
    } else {
      tiles.sort((a, b) => {
        const aNum = Number(a.tileNum);
        const bNum = Number(b.tileNum);
        if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) return aNum - bNum;
        return String(a.tileNum).localeCompare(String(b.tileNum));
      });
    }

    return tiles;
  }

  function filterTiles(tiles, filterId) {
    switch (filterId) {
      case "week":
        return tiles.filter(({ info }) => isWithinPastWeek(info.savedAt));
      case "healthy":
        return tiles.filter(({ summary }) => summary?.barKey === "healthy");
      case "issues":
        return tiles.filter(({ summary }) => isIssue(summary));
      case "all":
      default:
        return tiles;
    }
  }

  function fmtPct(value) {
    return window.TilePlantStorage?.formatPct?.(value) ?? String(Math.round(Number(value) || 0));
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function createTileDetailController(config) {
    const detailRoot = document.getElementById(config.rootId);
    const detailTitle = document.getElementById(config.titleId);
    const detailMeta = document.getElementById(config.metaId);
    const detailImage = document.getElementById(config.imageId);
    const detailImageWrap = document.getElementById(config.imageWrapId);
    const treatmentBtn = document.getElementById(config.treatmentBtnId);
    const treatmentPanel = document.getElementById(config.treatmentPanelId);
    const closeSelector = config.closeSelector || "[data-close-scan-detail]";
    const visibleClass = config.visibleClass || "scan-detail--visible";

    let activeDetailTop = null;

    function setClassificationScores(scores) {
      if (!detailRoot) return;
      CLASSIFICATION_ROW_ORDER.forEach((key) => {
        const pct = Math.min(100, Math.max(0, Number(scores?.[key]) || 0));
        const fill = detailRoot.querySelector(`.scan-result-row__fill[data-class="${key}"]`);
        const val = detailRoot.querySelector(`.scan-result-row__value[data-class="${key}"]`);
        const track = fill?.parentElement;
        if (fill) fill.style.width = `${pct}%`;
        if (val) val.textContent = `${fmtPct(pct)}%`;
        if (track) track.setAttribute("aria-valuenow", String(Math.round(pct)));
      });
    }

    function setScanHighlight(scores, severityPct) {
      if (!detailRoot) return;
      window.TomatoInsightRecommendations?.renderScanHighlight?.(
        detailRoot.querySelector(".scan-highlight"),
        scores,
        severityPct
      );
    }

    function renderTreatmentPanel(top, tileNum, scores, severityPct) {
      if (!treatmentPanel || !top) return;
      const recs = window.TomatoInsightRecommendations;
      const stored = recs?.storedForTile?.(tileNum);
      const key = scores ? recs?.scoresKeyFor?.(scores) : "";
      const storedMatches = stored && (!stored.scoresKey || !key || stored.scoresKey === key);
      let guides = storedMatches ? recs?.guidesFromStored?.(stored, scores) : null;
      if (!guides?.length) guides = scores ? recs?.guidesForScores?.(scores, severityPct) : null;
      if (!guides?.length && recs?.treatmentForBarKey) {
        guides = [
          {
            ...recs.treatmentForBarKey(top.barKey, top.pct, severityPct),
            barKey: top.barKey,
            pct: top.pct,
          },
        ];
      }
      const html = recs?.renderGuidesHtml?.(guides);
      if (!html) {
        treatmentPanel.hidden = true;
        treatmentPanel.innerHTML = "";
        return;
      }
      treatmentPanel.innerHTML = html;
    }

    function syncTreatmentButton(top, tileNum, scores, severityPct) {
      activeDetailTop = top;
      if (!treatmentBtn) return;
      if (!top) {
        treatmentBtn.hidden = true;
        treatmentBtn.disabled = true;
        if (treatmentPanel) {
          treatmentPanel.hidden = true;
          treatmentPanel.innerHTML = "";
        }
        return;
      }
      treatmentBtn.hidden = false;
      treatmentBtn.disabled = false;
      treatmentBtn.setAttribute("aria-expanded", "false");
      const highlight = window.TomatoInsightRecommendations?.highlightForScores?.(scores, severityPct);
      const isCritical = Boolean(top.barKey !== "healthy" && Number(highlight?.severityPct) >= 100);
      treatmentBtn.textContent = isCritical
        ? "Urgent: remove leaf — view steps"
        : "View care recommendations";
      renderTreatmentPanel(top, tileNum, scores, severityPct);
      if (treatmentPanel) treatmentPanel.hidden = true;
    }

    function open(tileNum, weekNumber) {
      const stored = window.TilePlantStorage?.get?.(tileNum);
      if (!stored || !detailRoot) return;

      const week = Number(weekNumber);
      const scan =
        Number.isFinite(week) && stored.weeks && typeof stored.weeks === "object"
          ? stored.weeks[String(week)]
          : null;
      const info = scan
        ? {
            ...stored,
            ...scan,
            weekNumber: week,
            imageDataUrl: Number(stored.weekNumber) === week ? stored.imageDataUrl : null,
          }
        : stored;

      const displayName = window.TilePlantNames?.displayName?.(tileNum) || `Tile ${tileNum}`;
      const summary = window.TilePlantStorage?.diseaseSummaryForInfo?.(info);

      if (detailTitle) detailTitle.textContent = displayName;
      if (detailMeta) {
        const parts = [`Tile ${tileNum}`];
        if (Number.isFinite(Number(info.weekNumber))) parts.push(`Week ${info.weekNumber}`);
        parts.push(`Saved ${formatSavedTimestamp(info.savedAt)}`);
        const detected = window.TilePlantStorage?.detectedDiseasesForInfo?.(info) || [];
        if (detected.length) {
          parts.splice(
            1,
            0,
            detected.map((item) => `${item.label} ${fmtPct(item.pct)}%`).join(", ")
          );
        } else if (summary?.barKey === "healthy") {
          parts.splice(1, 0, `Healthy · ${fmtPct(summary.pct)}%`);
        }
        detailMeta.textContent = parts.join(" · ");
      }

      if (info.imageDataUrl && detailImage && detailImageWrap) {
        detailImage.src = info.imageDataUrl;
        detailImage.hidden = false;
        detailImageWrap.hidden = false;
      } else if (detailImageWrap) {
        detailImageWrap.hidden = true;
        if (detailImage) detailImage.removeAttribute("src");
      }

      setClassificationScores(info.scores || {});
      setScanHighlight(info.scores || {}, info.severityPct);
      const top =
        summary && summary.pct > 0
          ? { barKey: summary.barKey, pct: summary.pct }
          : window.TilePlantStorage?.findTopScore?.(info.scores);
      syncTreatmentButton(top, tileNum, info.scores || {}, info.severityPct);

      detailRoot.hidden = false;
      document.body.classList.add("modal-open");
      requestAnimationFrame(() => detailRoot.classList.add(visibleClass));
      detailRoot.querySelector(closeSelector)?.focus?.();
    }

    function close() {
      if (!detailRoot) return;
      detailRoot.classList.remove(visibleClass);
      setTimeout(() => {
        detailRoot.hidden = true;
        document.body.classList.remove("modal-open");
      }, 280);
    }

    function init() {
      if (!detailRoot) return;
      detailRoot.querySelectorAll(closeSelector).forEach((el) => {
        el.addEventListener("click", close);
      });

      treatmentBtn?.addEventListener("click", () => {
        if (!activeDetailTop || !treatmentPanel) return;
        const willShow = treatmentPanel.hidden;
        if (willShow) {
          renderTreatmentPanel(activeDetailTop);
          treatmentPanel.hidden = false;
        } else {
          treatmentPanel.hidden = true;
        }
        treatmentBtn.setAttribute("aria-expanded", willShow ? "true" : "false");
      });

      document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        if (!detailRoot.hidden && detailRoot.classList.contains(visibleClass)) {
          close();
        }
      });
    }

    return { init, open, close };
  }

  function bindStorageRefresh(onRefresh) {
    window.addEventListener("storage", (e) => {
      if (
        e.key === "tomatoInsight.tilePlantInfo" ||
        e.key === "tomatoInsight.plantNames" ||
        e.key === "tomatoInsight.tileDeletions"
      ) {
        onRefresh();
      }
    });
    window.addEventListener("focus", onRefresh);
    window.addEventListener("tomatoInsight:userDataReady", (event) => {
      const shouldRefresh = window.TomatoInsightUserData?.shouldRefreshUiForUserDataEvent?.(
        event.detail
      );
      if (shouldRefresh === false) return;
      onRefresh();
    });
    window.addEventListener("tomatoInsight:userDataCleared", onRefresh);
    window.addEventListener("tomatoInsight:farmDataChanged", onRefresh);
  }

  window.TomatoInsightSavedTiles = {
    CLASSIFICATION_ROW_ORDER,
    fmtPct,
    formatSavedTimestamp,
    tileHasSavedInfo,
    badgeForSummary,
    statusBucket,
    isIssue,
    isWithinPastWeek,
    collectSavedTiles,
    filterTiles,
    FARM_WEEK_FIRST,
    FARM_WEEK_LAST,
    getSelectedFarmWeek,
    weekForNextSave,
    setSelectedFarmWeek,
    buildFarmWeekOptions,
    findWeekByKey,
    filterTilesByFarmWeek,
    compareTileScan,
    listScanWeeks,
    compareAgainstPrevious,
    mountWeekPicker,
    renderFarmWeekChart,
    escapeHtml,
    createTileDetailController,
    bindStorageRefresh,
  };
})();
