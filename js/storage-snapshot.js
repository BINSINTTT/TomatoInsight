(function () {
  const PREFIX = "tomatoInsight.";
  const DEBOUNCE_MS = 600;
  let timer;

  function collect() {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(PREFIX)) continue;
      const raw = localStorage.getItem(key);
      try {
        out[key] = JSON.parse(raw);
      } catch {
        out[key] = raw;
      }
    }
    return out;
  }

  function formatText() {
    const data = collect();
    const lines = [
      "TomatoInsight — local storage snapshot",
      "Updated: " + new Date().toISOString(),
      "Open this site at: " + location.origin,
      "",
    ];
    const keys = Object.keys(data).sort();
    if (!keys.length) {
      lines.push("(No tomatoInsight.* keys in localStorage yet.)");
      return lines.join("\r\n");
    }
    keys.forEach((key) => {
      lines.push("=== " + key + " ===");
      lines.push(JSON.stringify(data[key], null, 2));
      lines.push("");
    });
    return lines.join("\r\n");
  }

  async function writeSnapshotToServer() {
    try {
      const res = await fetch("/debug/local-storage-snapshot", {
        method: "POST",
        headers: { "Content-Type": "text/plain; charset=utf-8" },
        body: formatText(),
      });
      if (!res.ok) return { ok: false };
      const json = await res.json();
      return { ok: true, path: json.path };
    } catch {
      return { ok: false };
    }
  }

  function scheduleSnapshot() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      writeSnapshotToServer();
    }, DEBOUNCE_MS);
  }

  function downloadTxt() {
    const blob = new Blob([formatText()], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tomato-insight-local-data.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  window.TomatoInsightStorageSnapshot = {
    refresh: writeSnapshotToServer,
    schedule: scheduleSnapshot,
    download: downloadTxt,
  };
})();
