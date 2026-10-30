(function () {
  const STORAGE_KEY = "tomatoInsight.plantNames";

  function loadAll() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function get(tileNum) {
    const value = loadAll()[String(tileNum)];
    if (typeof value === "string") return value.trim();
    if (value && typeof value === "object" && typeof value.name === "string") return value.name.trim();
    return "";
  }

  function set(tileNum, name) {
    const all = loadAll();
    const trimmed = String(name || "").trim();
    if (trimmed) all[String(tileNum)] = trimmed;
    else delete all[String(tileNum)];
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
      window.TomatoInsightStorageSnapshot?.schedule?.();
      window.TomatoInsightUserData?.syncPlantNames?.();
      return true;
    } catch (err) {
      console.error("[TomatoInsight] Could not save plant name:", err);
      return false;
    }
  }

  function displayName(tileNum) {
    const custom = get(tileNum);
    return custom || `Tile ${tileNum}`;
  }

  window.TilePlantNames = {
    get,
    set,
    displayName,
    loadAll,
  };
})();
