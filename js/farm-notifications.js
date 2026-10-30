(function () {
  const storage = window.TilePlantStorage;
  const archive = window.TomatoInsightSavedTiles;
  const names = window.TilePlantNames;
  if (!storage || !archive) return;

  const CONFIRMED_KEY = "tomatoInsight.scanReminderConfirmed";

  function readConfirmed() {
    try {
      const raw = JSON.parse(localStorage.getItem(CONFIRMED_KEY) || "[]");
      return new Set(Array.isArray(raw) ? raw : []);
    } catch {
      return new Set();
    }
  }

  function savedTiles() {
    const all = storage.loadAll?.() || {};
    return Object.entries(all)
      .map(([tileNum, info]) => ({ tileNum: Number(tileNum), info }))
      .filter((tile) => Number.isFinite(tile.tileNum) && archive.tileHasSavedInfo(tile.info));
  }

  function tileLabel(tileNum) {
    return names?.displayName?.(tileNum) || `Tile ${tileNum}`;
  }

  const DISEASE_KEYS = ["tlcv", "early_blight", "spotted_wilt"];

  function detectedDiseases(info) {
    if (!info) return [];
    const labels = storage.BAR_LABELS || {};
    const fromScores = DISEASE_KEYS.map((barKey) => ({
      barKey,
      label: labels[barKey] || barKey,
      pct: storage.roundPct(Number(info.scores?.[barKey]) || 0),
    })).filter((item) => item.pct > 0);
    if (fromScores.length) return fromScores;
    const summary = storage.diseaseSummaryForInfo(info);
    if (!summary || summary.barKey === "healthy" || summary.pct <= 0) return [];
    return [summary];
  }

  function diseaseNotice(disease) {
    const pct = archive.fmtPct(disease.pct);
    if (disease.pct >= 100) return `${disease.label} ${pct}%. Remove this leaf now.`;
    return `${disease.label} ${pct}% detected.`;
  }

  function dueScans() {
    const confirmed = readConfirmed();
    const calendar = window.TomatoInsightScanCalendar;
    const schedule = calendar?.read?.();
    if (!schedule?.enabled || !calendar?.reminderWeekForPlant) return [];
    return savedTiles().flatMap((tile) => {
      const weeks = archive.listScanWeeks(tile.info) || [];
      const latest = weeks[weeks.length - 1];
      const latestWeek = latest?.week ?? Number(tile.info.weekNumber);
      const savedAt = latest?.scan?.savedAt || tile.info.savedAt;
      const nextWeek = calendar.reminderWeekForPlant(savedAt, latestWeek);
      if (!Number.isFinite(nextWeek) || nextWeek > archive.FARM_WEEK_LAST) return [];
      const savedWeeks = new Set(weeks.map((item) => item.week));
      if (savedWeeks.has(nextWeek)) return [];
      const key = `${tile.tileNum}:${nextWeek}`;
      if (confirmed.has(key)) return [];
      return [{ ...tile, nextWeek, key }];
    });
  }

  function messagesByTile() {
    const map = new Map();
    const add = (tileNum, text) => {
      const list = map.get(tileNum) || [];
      list.push(text);
      map.set(tileNum, list);
    };
    savedTiles().forEach((tile) => {
      detectedDiseases(tile.info).forEach((disease) => {
        add(tile.tileNum, diseaseNotice(disease));
      });
    });
    dueScans().forEach((tile) => {
      add(tile.tileNum, `Week ${tile.nextWeek} needs to be scanned again.`);
    });
    return map;
  }

  function closeAllTilePopups() {
    document.querySelectorAll(".farm-tile__notify-popup").forEach((popup) => {
      popup.hidden = true;
      popup.innerHTML = "";
    });
    document.querySelectorAll(".farm-tile__notify").forEach((btn) => {
      btn.setAttribute("aria-expanded", "false");
    });
    document.querySelectorAll(".farm-tile-cell--notify-open").forEach((cell) => {
      cell.classList.remove("farm-tile-cell--notify-open");
    });
  }

  function renderTilePopup(popup, tileNum, messages) {
    const title = archive.escapeHtml(tileLabel(tileNum));
    const body = messages.length
      ? `<ul class="farm-tile__notify-popup__list">${messages
          .map((text) => `<li class="farm-tile__notify-popup__item">${archive.escapeHtml(text)}</li>`)
          .join("")}</ul>`
      : `<p class="farm-tile__notify-popup__empty">No notifications.</p>`;
    popup.innerHTML =
      `<div class="farm-tile__notify-popup__head">` +
      `<p class="farm-tile__notify-popup__title">${title}</p>` +
      `<button type="button" class="farm-tile__notify-popup__close" aria-label="Close notifications">×</button>` +
      `</div>` +
      body;
    popup.querySelector(".farm-tile__notify-popup__close")?.addEventListener("click", (event) => {
      event.stopPropagation();
      closeAllTilePopups();
    });
  }

  function syncTiles() {
    const map = messagesByTile();
    document.querySelectorAll(".farm-tile__notify").forEach((btn) => {
      const tile = btn.closest(".farm-tile-cell")?.querySelector(".farm-tile");
      const tileNum = Number(tile?.dataset.tile);
      if (!Number.isFinite(tileNum)) return;
      const messages = map.get(tileNum) || [];
      const noticeCount = messages.length;
      const countEl = btn.querySelector(".farm-tile__notify-count");
      if (countEl) {
        countEl.hidden = noticeCount === 0;
        countEl.textContent = String(noticeCount);
      }
      btn.classList.toggle("farm-tile__notify--active", noticeCount > 0);
      const label = tileLabel(tileNum);
      btn.setAttribute(
        "aria-label",
        noticeCount
          ? `Notifications for ${label}, ${noticeCount} ${noticeCount === 1 ? "notification" : "notifications"}`
          : `Notifications for ${label}, no notifications`
      );
      const popup = btn.closest(".farm-tile-cell")?.querySelector(".farm-tile__notify-popup");
      if (popup && !popup.hidden) renderTilePopup(popup, tileNum, messages);
    });
  }

  function toggleTilePopup(tileNum, button) {
    const cell = button.closest(".farm-tile-cell");
    const popup = cell?.querySelector(".farm-tile__notify-popup");
    if (!popup) return;
    const willOpen = popup.hidden;
    closeAllTilePopups();
    if (!willOpen) return;
    const messages = messagesByTile().get(Number(tileNum)) || [];
    renderTilePopup(popup, Number(tileNum), messages);
    popup.hidden = false;
    button.setAttribute("aria-expanded", "true");
    cell.classList.add("farm-tile-cell--notify-open");
  }

  function refresh() {
    syncTiles();
  }

  document.addEventListener("click", (event) => {
    const target = event.target;
    const insideTileNotify =
      target instanceof Node &&
      Boolean(target.closest(".farm-tile__notify") || target.closest(".farm-tile__notify-popup"));
    if (!insideTileNotify) closeAllTilePopups();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeAllTilePopups();
  });

  window.TomatoInsightNotifications = { syncTiles, toggleTilePopup };

  refresh();
  setInterval(refresh, 5000);
  window.addEventListener("tomatoInsight:userDataReady", refresh);
  window.addEventListener("tomatoInsight:scanCalendar", refresh);
  window.addEventListener("focus", refresh);
})();
