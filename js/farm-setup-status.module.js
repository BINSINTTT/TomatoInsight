/** Farm setup checklist — all six steps required for the +5 scan credit bonus. */

export function readFarmSetupStats() {
  let tileCount = 0;
  let rows = 0;
  let columns = 0;
  let scansSaved = 0;
  let farmWeek = null;

  try {
    const layoutRaw = localStorage.getItem("tomatoInsight.farmLayout");
    if (layoutRaw) {
      const layout = JSON.parse(layoutRaw);
      if (layout.rows >= 1 && layout.columns >= 1) {
        rows = layout.rows;
        columns = layout.columns;
        tileCount = rows * columns;
      }
    }
  } catch {
    /* ignore */
  }

  try {
    const tilesRaw = localStorage.getItem("tomatoInsight.tilePlantInfo");
    const tiles = tilesRaw ? JSON.parse(tilesRaw) : {};
    scansSaved = Object.values(tiles).filter((t) => t && typeof t === "object" && t.savedAt).length;
  } catch {
    /* ignore */
  }

  try {
    const w = Number.parseInt(localStorage.getItem("tomatoInsight.selectedFarmWeek"), 10);
    if (!Number.isNaN(w)) farmWeek = w;
  } catch {
    /* ignore */
  }

  return { tileCount, rows, columns, scansSaved, farmWeek };
}

export function hasProfilePhoto(profile) {
  const photo = String(profile?.photo || "");
  return photo.startsWith("data:image/jpeg;base64,") && photo.length > 30;
}

export function isFarmSetupComplete(profile, stats = readFarmSetupStats()) {
  return Boolean(
    String(profile?.firstName || "").trim() &&
      String(profile?.lastName || "").trim() &&
      String(profile?.farmName || "").trim() &&
      hasProfilePhoto(profile) &&
      stats.tileCount > 0 &&
      stats.scansSaved > 0 &&
      stats.farmWeek != null
  );
}
