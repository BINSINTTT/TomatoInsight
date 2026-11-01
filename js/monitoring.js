(function () {
  const archive = window.TomatoInsightSavedTiles;
  if (!archive) return;

  const SELECTED_KEY = "tomatoInsight.monitorTile";
  const SCORE_KEYS = [
    { key: "healthy", label: "Healthy" },
    { key: "tlcv", label: "TLCV" },
    { key: "early_blight", label: "Blight" },
    { key: "spotted_wilt", label: "Wilt" },
  ];

  const tileSelect = document.getElementById("monitor-tile-select");
  const tileHint = document.getElementById("monitor-tile-hint");
  const pastLabel = document.getElementById("monitor-past-label");
  const currentLabel = document.getElementById("monitor-current-label");
  const firstValue = document.getElementById("monitor-first-value");
  const firstHint = document.getElementById("monitor-first-hint");
  const latestValue = document.getElementById("monitor-latest-value");
  const latestHint = document.getElementById("monitor-latest-hint");
  const changeValue = document.getElementById("monitor-change-value");
  const changeHint = document.getElementById("monitor-change-hint");
  const chartEl = document.getElementById("monitor-overview-chart");
  const chartCaption = document.getElementById("monitor-overview-caption");
  const legendEl = document.getElementById("monitor-overview-legend");
  const weekList = document.getElementById("monitor-week-list");
  const weekCaption = document.getElementById("monitor-weeks-caption");
  const scansEl = document.getElementById("monitor-scans");

  const RESULT_ROWS = [
    { key: "healthy", label: "Healthy", fill: "healthy" },
    { key: "tlcv", label: "TLCV", fill: "tlcv" },
    { key: "early_blight", label: "Early Blight", fill: "blight" },
    { key: "spotted_wilt", label: "Spotted Wilt", fill: "wilt" },
  ];

  let selectedTile = "";
  let selectedWeek = null;
  let activeTile = "";

  function readSelected() {
    try {
      return sessionStorage.getItem(SELECTED_KEY) || "";
    } catch {
      return "";
    }
  }

  function writeSelected(tileNum) {
    selectedTile = tileNum ? String(tileNum) : "";
    try {
      if (selectedTile) sessionStorage.setItem(SELECTED_KEY, selectedTile);
      else sessionStorage.removeItem(SELECTED_KEY);
    } catch {
      /* ignore */
    }
  }

  function tileChoices() {
    return archive.collectSavedTiles("tile");
  }

  function resultText(summary) {
    if (!summary) return "—";
    return summary.label;
  }

  function scoreOf(scan, key) {
    if (!scan) return 0;
    const direct = Number(scan.scores?.[key]);
    if (Number.isFinite(direct) && direct > 0) return Math.min(100, direct);
    if (scan.topBarKey === key) return Math.min(100, Number(scan.topPct) || 0);
    return 0;
  }

  function setText(el, text) {
    if (el) el.textContent = text;
  }

  function setChangeTone(tone) {
    changeValue?.classList.remove("monitor-stat__value--good", "monitor-stat__value--bad");
    if (tone === "better") changeValue?.classList.add("monitor-stat__value--good");
    if (tone === "worse") changeValue?.classList.add("monitor-stat__value--bad");
  }

  function chartTone(key) {
    if (key === "early_blight") return "blight";
    if (key === "spotted_wilt") return "wilt";
    return key;
  }

  function chartBar(pct, tone, phase, weekLabel) {
    const height = Math.max(pct, pct > 0 ? 4 : 0);
    const tip = pct > 0 ? `<span class="monitor-chart__tip">${archive.fmtPct(pct)}%</span>` : "";
    return (
      `<span class="monitor-chart__bar monitor-chart__bar--${tone} monitor-chart__bar--${phase}" ` +
      `style="--bar-h:${height}%" role="img" ` +
      `aria-label="${weekLabel} ${archive.fmtPct(pct)} percent for ${tone}">` +
      tip +
      `</span>`
    );
  }

  function renderChart(pair) {
    if (!chartEl) return;
    const past = pair?.past;
    const current = pair?.current;
    const pastWeek = pair?.pastWeek;
    const currentWeek = pair?.currentWeek;

    if (!past && !current) {
      chartEl.classList.add("monitor-chart--empty");
      chartEl.innerHTML = `<p class="monitor-chart__empty">Choose a week to compare it with the scan before it.</p>`;
      if (legendEl) legendEl.hidden = true;
      setText(chartCaption, "Compared scores for the selected week.");
      return;
    }

    chartEl.classList.remove("monitor-chart--empty");
    const yAxis =
      `<div class="monitor-chart__y-axis" aria-hidden="true">` +
      `<span>100</span><span>75</span><span>50</span><span>25</span><span>0</span>` +
      `</div>`;
    const grid =
      `<div class="monitor-chart__grid" aria-hidden="true">` +
      `<span></span><span></span><span></span><span></span><span></span>` +
      `</div>`;
    const columns = SCORE_KEYS.map(({ key, label }) => {
      const tone = chartTone(key);
      const pastPct = past ? scoreOf(past, key) : 0;
      const currentPct = current ? scoreOf(current, key) : 0;
      const pastBar = past ? chartBar(pastPct, tone, "past", `Week ${pastWeek}`) : "";
      const currentBar = current ? chartBar(currentPct, tone, "current", `Week ${currentWeek}`) : "";
      return (
        `<div class="monitor-chart__group">` +
        `<div class="monitor-chart__bars">` +
        pastBar +
        currentBar +
        `</div>` +
        `<span class="monitor-chart__label monitor-chart__label--${tone}">${label}</span>` +
        `</div>`
      );
    }).join("");

    chartEl.innerHTML =
      `<div class="monitor-chart__inner">` +
      yAxis +
      `<div class="monitor-chart__plot">` +
      grid +
      `<div class="monitor-chart__columns">${columns}</div>` +
      `</div>` +
      `</div>`;

    if (legendEl) {
      legendEl.hidden = false;
      if (past && current) {
        legendEl.innerHTML =
          `<span><i class="monitor-legend__swatch monitor-legend__swatch--past"></i>Week ${pastWeek} (previous)</span>` +
          `<span><i class="monitor-legend__swatch monitor-legend__swatch--current"></i>Week ${currentWeek} (chosen)</span>`;
      } else {
        legendEl.innerHTML =
          `<span><i class="monitor-legend__swatch monitor-legend__swatch--current"></i>Week ${currentWeek || pastWeek}</span>`;
      }
    }

    setText(
      chartCaption,
      past && current
        ? `Week ${pastWeek} compared with Week ${currentWeek}.`
        : `Week ${currentWeek} is the first scan. Choose a later week to compare.`
    );
  }

  function renderWeeks(tileNum, weeks) {
    if (!weekList) return;
    const first = archive.FARM_WEEK_FIRST;
    if (!tileNum) {
      weekList.innerHTML = `<p class="monitor-empty">Choose a tile, then pick a week to compare it with the scan before it.</p>`;
      setText(weekCaption, "Choose a week to compare it with the scan before it.");
      return;
    }
    if (!weeks.length) {
      weekList.innerHTML = `<p class="monitor-empty">No scan saved for this tile yet. Scan it on Home and tap Save Info.</p>`;
      setText(weekCaption, `Week ${first} is the first scan.`);
      return;
    }

    setText(weekCaption, "Choose a week. The overview compares it with the week before.");
    weekList.innerHTML = "";
    weeks.forEach(({ week, summary }, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "monitor-week";
      if (week === selectedWeek) {
        button.classList.add("monitor-week--active");
        button.setAttribute("aria-current", "true");
      }
      button.setAttribute("role", "listitem");
      const previous = index > 0 ? weeks[index - 1].week : null;
      const note = previous == null ? "First scan" : `Compare with Week ${previous}`;
      button.innerHTML =
        `<span class="monitor-week__mark">W${week}</span>` +
        `<span class="monitor-week__main">` +
        `<p class="monitor-week__title">Week ${week}</p>` +
        `<p class="monitor-week__meta">${archive.escapeHtml(summary ? `${summary.label} · ${note}` : note)}</p>` +
        `</span>` +
        `<span class="monitor-week__pct">${summary ? `${archive.fmtPct(summary.pct)}%` : "—"}</span>`;
      button.addEventListener("click", () => {
        selectedWeek = week;
        render();
      });
      weekList.appendChild(button);
    });
  }

  function imageForWeek(info, week, scan) {
    if (scan?.imageDataUrl) return scan.imageDataUrl;
    if (info && Number(info.weekNumber) === Number(week) && info.imageDataUrl) return info.imageDataUrl;
    return "";
  }

  function appendScanCard(info, week, scan, summary) {
    const article = document.createElement("article");
    article.className = "monitor-scan";

    const head = document.createElement("header");
    head.className = "monitor-scan__head";
    const title = document.createElement("h3");
    title.textContent = `Week ${week}`;
    const meta = document.createElement("p");
    const saved = scan?.savedAt ? archive.formatSavedTimestamp(scan.savedAt) : "";
    meta.textContent = summary
      ? `${summary.label} · ${archive.fmtPct(summary.pct)}%${saved ? ` · ${saved}` : ""}`
      : "No classification saved";
    head.append(title, meta);

    const frame = document.createElement("div");
    frame.className = "monitor-scan__frame";
    const image = imageForWeek(info, week, scan);
    if (image) {
      const photo = document.createElement("img");
      photo.className = "monitor-scan__photo";
      photo.src = image;
      photo.alt = `Week ${week} scan`;
      frame.appendChild(photo);
    } else {
      const empty = document.createElement("p");
      empty.className = "monitor-scan__photo-empty";
      empty.textContent = "No photo saved for this week.";
      frame.appendChild(empty);
    }

    const classTitle = document.createElement("h4");
    classTitle.className = "monitor-scan__class-title";
    classTitle.textContent = "Classification";

    const list = document.createElement("ul");
    list.className = "monitor-scan__list";
    RESULT_ROWS.forEach(({ key, label, fill }) => {
      const pct = scoreOf(scan, key);
      const row = document.createElement("li");
      row.className = "monitor-scan__row";
      const name = document.createElement("span");
      name.className = "monitor-scan__label";
      name.textContent = label;
      const track = document.createElement("div");
      track.className = "monitor-scan__track";
      track.setAttribute("role", "progressbar");
      track.setAttribute("aria-valuemin", "0");
      track.setAttribute("aria-valuemax", "100");
      track.setAttribute("aria-valuenow", String(Math.round(pct)));
      track.setAttribute("aria-label", label);
      const bar = document.createElement("div");
      bar.className = `monitor-scan__fill monitor-scan__fill--${fill}`;
      bar.style.width = `${pct}%`;
      track.appendChild(bar);
      const value = document.createElement("span");
      value.className = "monitor-scan__pct";
      value.textContent = `${archive.fmtPct(pct)}%`;
      row.append(name, track, value);
      list.appendChild(row);
    });

    article.append(head, frame, classTitle, list);
    scansEl.appendChild(article);
  }

  function renderScans(info, pair) {
    if (!scansEl) return;
    scansEl.innerHTML = "";
    scansEl.classList.remove("monitor-scans--single", "monitor-scans--week4");
    if (!pair?.current) {
      scansEl.classList.add("monitor-scans--single");
      const empty = document.createElement("p");
      empty.className = "monitor-empty";
      empty.textContent = "Choose a tile with a saved scan to see the photo and classification.";
      scansEl.appendChild(empty);
      return;
    }

    const cards = [];
    if (pair.past) cards.push({ week: pair.pastWeek, scan: pair.past, summary: pair.pastSummary });
    cards.push({ week: pair.currentWeek, scan: pair.current, summary: pair.currentSummary });
    if (cards.length === 1) {
      scansEl.classList.add("monitor-scans--single");
      if (cards[0].week === archive.FARM_WEEK_FIRST) scansEl.classList.add("monitor-scans--week4");
    }
    cards.forEach(({ week, scan, summary }) => appendScanCard(info, week, scan, summary));
  }

  function renderSelected(choices) {
    const tile = choices.find((item) => String(item.tileNum) === selectedTile) || null;
    const weeks = tile?.info ? archive.listScanWeeks(tile.info) : [];
    const tileKey = tile ? String(tile.tileNum) : "";
    if (tileKey !== activeTile) {
      activeTile = tileKey;
      selectedWeek = null;
    }
    if (selectedWeek == null || !weeks.some((item) => item.week === selectedWeek)) {
      selectedWeek = weeks.length ? weeks[weeks.length - 1].week : null;
    }
    const pair = tile?.info && selectedWeek != null ? archive.compareAgainstPrevious(tile.info, selectedWeek) : null;
    const outcome = pair?.outcome;

    if (pair?.pastWeek) {
      setText(pastLabel, `Week ${pair.pastWeek}`);
      setText(currentLabel, `Week ${pair.currentWeek}`);
      setText(firstValue, resultText(pair.pastSummary));
      setText(firstHint, `${archive.fmtPct(pair.pastSummary.pct)}% · previous scan`);
      setText(latestValue, resultText(pair.currentSummary));
      setText(latestHint, `${archive.fmtPct(pair.currentSummary.pct)}% · chosen week`);
      setText(changeHint, `Week ${pair.pastWeek} vs Week ${pair.currentWeek}`);
    } else if (pair?.currentWeek) {
      setText(pastLabel, "Past week");
      setText(currentLabel, `Week ${pair.currentWeek}`);
      setText(firstValue, "—");
      setText(firstHint, "No earlier scan");
      setText(latestValue, resultText(pair.currentSummary));
      setText(latestHint, `${archive.fmtPct(pair.currentSummary.pct)}% · first scan`);
      setText(changeHint, "This is the first scan");
    } else {
      setText(pastLabel, "Past week");
      setText(currentLabel, "Chosen week");
      setText(firstValue, "—");
      setText(firstHint, "Previous scan");
      setText(latestValue, "—");
      setText(latestHint, "Chosen week");
      setText(changeHint, "Pick a week after the first scan");
    }
    setText(
      tileHint,
      tile
        ? pair?.pastWeek
          ? outcome?.line || "No scan saved for this tile yet."
          : pair?.currentSummary
            ? `Week ${pair.currentWeek} · ${pair.currentSummary.label} ${archive.fmtPct(pair.currentSummary.pct)}%`
            : "No scan saved for this tile yet."
        : "Select a tile to see its scans."
    );
    setText(changeValue, pair?.pastWeek ? outcome?.label || "—" : pair?.currentWeek ? "First scan" : "—");
    setChangeTone(outcome?.tone);
    renderChart(pair);
    renderWeeks(tile?.tileNum, weeks);
    renderScans(tile?.info, pair);
  }

  function render() {
    const choices = tileChoices();
    if (!selectedTile) selectedTile = readSelected();
    if (selectedTile && !choices.some((item) => String(item.tileNum) === selectedTile)) {
      selectedTile = "";
    }

    if (tileSelect) {
      const current = selectedTile;
      tileSelect.innerHTML = `<option value="">Choose a tile</option>`;
      choices.forEach((item) => {
        const option = document.createElement("option");
        option.value = String(item.tileNum);
        option.textContent = item.displayName;
        tileSelect.appendChild(option);
      });
      tileSelect.value = current;
      tileSelect.disabled = choices.length === 0;
    }

    renderSelected(choices);
  }

  function init() {
    selectedTile = readSelected();
    tileSelect?.addEventListener("change", () => {
      writeSelected(tileSelect.value);
      render();
    });
    render();
    archive.bindStorageRefresh(render);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
