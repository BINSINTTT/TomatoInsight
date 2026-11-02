(function () {
  const LAYOUT_KEY = "tomatoInsight.farmLayout";
  const healthyEl = document.getElementById("metric-healthy-plants");
  const issueEl = document.getElementById("metric-issue-plants");
  const todayEl = document.getElementById("home-today-text");

  function plantLimit() {
    try {
      const layout = JSON.parse(localStorage.getItem(LAYOUT_KEY) || "null");
      const rows = Number(layout?.rows);
      const columns = Number(layout?.columns);
      if (rows > 0 && columns > 0) return rows * columns;
    } catch {
      /* ignore */
    }
    return 0;
  }

  function refresh() {
    const storage = window.TilePlantStorage;
    const limit = plantLimit();
    let healthy = 0;
    let issues = 0;
    if (storage && limit) {
      Object.entries(storage.loadAll?.() || {}).forEach(([tileNum, info]) => {
        const num = Number(tileNum);
        if (!Number.isFinite(num) || num < 1 || num > limit) return;
        const summary = storage.diseaseSummaryForInfo?.(info);
        if (!summary) return;
        if (summary.barKey === "healthy") healthy += 1;
        else issues += 1;
      });
    }
    if (healthyEl) healthyEl.textContent = String(healthy);
    if (issueEl) issueEl.textContent = String(issues);
  }

  function renderDate() {
    if (!todayEl) return;
    todayEl.textContent = new Date().toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  window.TomatoInsightHomeOverview = { refresh };

  renderDate();
  refresh();
  window.addEventListener("tomatoInsight:userDataReady", (event) => {
    const shouldRefresh = window.TomatoInsightUserData?.shouldRefreshUiForUserDataEvent?.(
      event.detail
    );
    if (shouldRefresh === false) return;
    refresh();
  });
  window.addEventListener("tomatoInsight:userDataCleared", refresh);
  window.addEventListener("tomatoInsight:farmDataChanged", refresh);
  window.addEventListener("storage", refresh);
  window.addEventListener("focus", () => {
    renderDate();
    refresh();
  });
})();
