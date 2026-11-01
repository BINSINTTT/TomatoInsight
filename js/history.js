(function () {
  const archive = window.TomatoInsightSavedTiles;
  if (!archive) return;

  const listEl = document.getElementById("history-tile-list");
  const listEmptyEl = document.getElementById("history-tile-list-empty");
  const filterEl = document.getElementById("history-filters");
  const weekPickerEl = document.getElementById("history-week-picker");
  const notifyCountEl = document.getElementById("history-stat-notifications");
  const scanCountEl = document.getElementById("history-stat-scans");
  const deletedCountEl = document.getElementById("history-stat-deleted");

  const DISEASE_KEYS = ["tlcv", "early_blight", "spotted_wilt"];
  const farmWeeks = archive.buildFarmWeekOptions();
  let activeFilter = "all";
  let activeWeekKey = String(archive.getSelectedFarmWeek());

  const detail = archive.createTileDetailController({
    rootId: "history-tile-detail",
    titleId: "history-detail-title",
    metaId: "history-detail-meta",
    imageId: "history-detail-image",
    imageWrapId: "history-detail-image-wrap",
    treatmentBtnId: "history-treatment-btn",
    treatmentPanelId: "history-treatment-panel",
    closeSelector: "[data-close-scan-detail]",
    visibleClass: "scan-detail--visible",
  });

  function deletions() {
    return window.TilePlantStorage?.loadDeletions?.() || [];
  }

  function notificationCount(tiles) {
    let count = 0;
    tiles.forEach((tile) => {
      const scores = tile.info?.scores || {};
      let diseases = 0;
      DISEASE_KEYS.forEach((key) => {
        if (Number(scores[key]) > 0) diseases += 1;
      });
      if (!diseases && tile.summary && tile.summary.barKey !== "healthy" && tile.summary.pct > 0) {
        diseases = 1;
      }
      count += diseases;
    });

    const calendar = window.TomatoInsightScanCalendar;
    if (!calendar?.reminderWeekForPlant) return count;
    tiles.forEach((tile) => {
      const weeks = archive.listScanWeeks(tile.info) || [];
      const latest = weeks[weeks.length - 1];
      const latestWeek = latest?.week ?? Number(tile.info.weekNumber);
      const savedAt = latest?.scan?.savedAt || tile.info.savedAt;
      const scanDayIso = latest?.scan?.scanDayIso || tile.info.scanDayIso || "";
      const nextWeek = calendar.reminderWeekForPlant(savedAt, latestWeek, scanDayIso);
      if (!Number.isFinite(nextWeek)) return;
      const savedWeeks = new Set(weeks.map((item) => item.week));
      if (!savedWeeks.has(nextWeek)) count += 1;
    });
    return count;
  }

  function setStat(el, value) {
    if (el) el.textContent = String(value);
  }

  function initial(name) {
    const letter = String(name || "?").trim().charAt(0);
    return archive.escapeHtml(letter ? letter.toUpperCase() : "?");
  }

  function statusHtml(kind, label) {
    return `<span class="history-status history-status--${kind}">${archive.escapeHtml(label)}</span>`;
  }

  function scanRow(tile) {
    const summary = tile.summary;
    const result = summary?.label || "Saved";
    const score = summary ? `${archive.fmtPct(summary.pct)}%` : "—";
    const status = !summary
      ? statusHtml("saved", "Saved")
      : summary.barKey === "healthy"
        ? statusHtml("ok", "Healthy")
        : statusHtml("issue", "Issue");
    const when = archive.formatSavedTimestamp(tile.info.savedAt);
    const row = document.createElement("tr");
    row.innerHTML =
      `<td>#${archive.escapeHtml(tile.tileNum)}</td>` +
      `<td><div class="history-plant"><span class="history-plant__mark">${initial(tile.displayName)}</span>${archive.escapeHtml(tile.displayName)}</div></td>` +
      `<td>${archive.escapeHtml(when)}</td>` +
      `<td>${archive.escapeHtml(result)}</td>` +
      `<td>${status}</td>` +
      `<td>${archive.escapeHtml(score)}</td>` +
      `<td><button type="button" class="history-view">View</button></td>`;
    row.querySelector(".history-view")?.addEventListener("click", () => {
      detail.open(tile.tileNum, Number(activeWeekKey));
    });
    return row;
  }

  function deletedRow(entry) {
    const name = entry.plantName || `Tile ${entry.tileNum}`;
    const when = archive.formatSavedTimestamp(entry.deletedAt, { unknownLabel: "Date unknown" });
    const row = document.createElement("tr");
    row.innerHTML =
      `<td>#${archive.escapeHtml(entry.tileNum ?? "—")}</td>` +
      `<td><div class="history-plant"><span class="history-plant__mark">${initial(name)}</span>${archive.escapeHtml(name)}</div></td>` +
      `<td>${archive.escapeHtml(when)}</td>` +
      `<td>Removed</td>` +
      `<td>${statusHtml("deleted", "Deleted")}</td>` +
      `<td>—</td>` +
      `<td></td>`;
    return row;
  }

  function renderWeekOptions() {
    if (!weekPickerEl) return;
    const current = String(archive.getSelectedFarmWeek());
    weekPickerEl.innerHTML = farmWeeks
      .map(
        (week) =>
          `<option value="${archive.escapeHtml(week.key)}"${week.key === current ? " selected" : ""}>${archive.escapeHtml(week.label)}</option>`
      )
      .join("");
    activeWeekKey = current;
  }

  function renderTable() {
    if (!listEl) return;
    const allTiles = archive.collectSavedTiles("date");
    const removed = deletions();
    setStat(notifyCountEl, notificationCount(allTiles));
    setStat(scanCountEl, allTiles.length);
    setStat(deletedCountEl, removed.length);

    activeWeekKey = String(archive.getSelectedFarmWeek());
    if (weekPickerEl && weekPickerEl.value !== activeWeekKey) weekPickerEl.value = activeWeekKey;

    const weekFiltered = archive.filterTilesByFarmWeek(allTiles, activeWeekKey);
    const scans = activeFilter === "deleted" ? [] : archive.filterTiles(weekFiltered, activeFilter);
    const showDeleted = activeFilter === "all" || activeFilter === "deleted";
    const activeWeek = archive.findWeekByKey(farmWeeks, activeWeekKey);

    listEl.innerHTML = "";
    scans.forEach((tile) => listEl.appendChild(scanRow(tile)));
    if (showDeleted) removed.forEach((entry) => listEl.appendChild(deletedRow(entry)));

    const hasRows = scans.length > 0 || (showDeleted && removed.length > 0);
    if (listEmptyEl) {
      listEmptyEl.hidden = hasRows;
      if (!hasRows) {
        if (activeFilter === "deleted") listEmptyEl.textContent = "No plants have been deleted yet.";
        else if (!weekFiltered.length) {
          listEmptyEl.textContent = activeWeek
            ? `No scans saved for ${activeWeek.label} yet.`
            : "No saved scans yet. Open a tile on Home, run a scan, and tap Save Info.";
        } else listEmptyEl.textContent = "No scans match this filter for the selected week.";
      }
    }
  }

  function init() {
    detail.init();
    renderWeekOptions();
    weekPickerEl?.addEventListener("change", () => {
      archive.setSelectedFarmWeek(weekPickerEl.value);
      renderTable();
    });
    filterEl?.addEventListener("change", () => {
      activeFilter = filterEl.value || "all";
      renderTable();
    });
    renderTable();
    archive.bindStorageRefresh(renderTable);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
