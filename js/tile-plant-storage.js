(function () {
  const STORAGE_KEY = "tomatoInsight.tilePlantInfo";
  const DELETIONS_KEY = "tomatoInsight.tileDeletions";

  const BAR_LABELS = {
    healthy: "Healthy",
    tlcv: "TLCV",
    early_blight: "Early blight",
    spotted_wilt: "Spotted wilt",
  };

  const BAR_KEYS = ["healthy", "tlcv", "early_blight", "spotted_wilt"];

  function loadAll() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function get(tileNum) {
    const entry = loadAll()[String(tileNum)];
    if (!entry || typeof entry !== "object") return null;
    return entry;
  }

  function weekSnapshot(info) {
    const weekNumber = Number(info?.weekNumber);
    if (!Number.isFinite(weekNumber)) return null;
    return {
      savedAt: info.savedAt || null,
      scanDayIso: typeof info.scanDayIso === "string" ? info.scanDayIso : "",
      weekNumber,
      scores: info.scores || {},
      topBarKey: info.topBarKey ?? null,
      topPct: info.topPct ?? 0,
      severityPct: Math.min(100, Math.max(0, Number(info.severityPct) || 0)),
      imageDataUrl: info.imageDataUrl || null,
    };
  }

  /** Keep one score snapshot per farm week. The top-level record stays the latest save. */
  function withWeekHistory(existing, info) {
    const weeks = {};
    if (existing?.weeks && typeof existing.weeks === "object") {
      Object.entries(existing.weeks).forEach(([key, scan]) => {
        const snap = weekSnapshot(scan) || weekSnapshot({ ...scan, weekNumber: key });
        if (snap) weeks[String(snap.weekNumber)] = snap;
      });
    } else {
      const previous = weekSnapshot(existing);
      if (previous) weeks[String(previous.weekNumber)] = previous;
    }
    const current = weekSnapshot(info);
    if (current) weeks[String(current.weekNumber)] = current;
    return { ...info, weeks };
  }

  function set(tileNum, info) {
    const all = loadAll();
    const existing = all[String(tileNum)];
    all[String(tileNum)] = withWeekHistory(existing, info);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
      window.TomatoInsightStorageSnapshot?.schedule?.();
      window.TomatoInsightUserData?.syncTile?.(tileNum);
      window.TomatoInsightUserData?.notifyLocalChange?.("tile-save");
      return true;
    } catch (err) {
      console.error("[TomatoInsight] Could not save tile plant info:", err);
      return false;
    }
  }

  function remove(tileNum) {
    const all = loadAll();
    delete all[String(tileNum)];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    window.TomatoInsightStorageSnapshot?.schedule?.();
    window.TomatoInsightUserData?.syncTile?.(tileNum);
    window.TomatoInsightUserData?.notifyLocalChange?.("tile-remove");
  }

  function loadDeletions() {
    try {
      const raw = JSON.parse(localStorage.getItem(DELETIONS_KEY) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  }

  function recordDeletion(entry) {
    const tileNum = Number(entry?.tileNum);
    if (!Number.isFinite(tileNum)) return false;
    const plantName = String(entry?.plantName || `Tile ${tileNum}`).trim() || `Tile ${tileNum}`;
    const next = [
      {
        id: `${tileNum}-${Date.now()}`,
        tileNum,
        plantName,
        deletedAt: new Date().toISOString(),
      },
      ...loadDeletions(),
    ];
    try {
      localStorage.setItem(DELETIONS_KEY, JSON.stringify(next));
      window.TomatoInsightStorageSnapshot?.schedule?.();
      window.TomatoInsightUserData?.syncDeletions?.();
      window.TomatoInsightUserData?.notifyLocalChange?.("tile-deletion");
      return true;
    } catch (err) {
      console.error("[TomatoInsight] Could not record tile deletion:", err);
      return false;
    }
  }

  /** One decimal, matching the precision the Ultralytics response reports. */
  function roundPct(value) {
    const n = Math.min(100, Math.max(0, Number(value) || 0));
    return Math.round(n * 10) / 10;
  }

  function formatPct(value) {
    const n = roundPct(value);
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  }

  function findTopScore(scores) {
    if (!scores) return null;
    let top = { barKey: "healthy", pct: 0 };
    BAR_KEYS.forEach((barKey) => {
      const pct = Math.min(100, Math.max(0, Number(scores[barKey]) || 0));
      if (pct > top.pct) top = { barKey, pct };
    });
    return top.pct > 0 ? top : null;
  }

  /** Diseases above 0%. Healthy stays on the score rows and is not a disease label. */
  function detectedDiseasesForInfo(info) {
    if (!info) return [];
    const scores = info.scores && typeof info.scores === "object" ? info.scores : null;
    if (scores) {
      return BAR_KEYS.filter((barKey) => barKey !== "healthy")
        .map((barKey) => ({
          barKey,
          label: BAR_LABELS[barKey] || barKey,
          pct: roundPct(scores[barKey]),
        }))
        .filter((item) => item.pct > 0)
        .sort((a, b) => b.pct - a.pct);
    }
    const summary = diseaseSummaryForInfo(info);
    if (!summary || summary.barKey === "healthy" || summary.pct <= 0) return [];
    return [summary];
  }

  /** Top result from a saved tile, including Healthy. */
  function diseaseSummaryForInfo(info) {
    if (!info) return null;

    const severityPct = Math.min(100, Math.max(0, Number(info.severityPct) || 0));

    if (info.topBarKey && Number(info.topPct) > 0) {
      const barKey = String(info.topBarKey);
      return {
        barKey,
        label: BAR_LABELS[barKey] || barKey,
        pct: roundPct(info.topPct),
        severityPct,
      };
    }

    const top = findTopScore(info.scores);
    if (!top) return null;
    return {
      barKey: top.barKey,
      label: BAR_LABELS[top.barKey] || top.barKey,
      pct: roundPct(top.pct),
      severityPct,
    };
  }

  function statusLineForInfo(info) {
    const summary = diseaseSummaryForInfo(info);
    if (summary) return `Status: ${summary.label} · ${formatPct(summary.pct)}%`;
    if (info?.imageDataUrl) return "Status: Scan saved";
    return "Status: Ready for scan";
  }

  window.TilePlantStorage = {
    get,
    set,
    remove,
    loadAll,
    loadDeletions,
    recordDeletion,
    roundPct,
    formatPct,
    findTopScore,
    diseaseSummaryForInfo,
    detectedDiseasesForInfo,
    statusLineForInfo,
    BAR_KEYS,
    BAR_LABELS,
  };
})();
