(function () {
  /** Paths from site root (Flask serves project/img/…). */
  const tileIcon = "/img/tileIconLeaf.png";
  const happyEmoji = "/img/happyEmoji.png";
  const worryEmoji = "/img/worryEmoji.png";
  const sadEmoji = "/img/sadEmoji.png";

  /**
   * @param {{ barKey: string, pct: number } | null | undefined} summary
   * @returns {{ mood: "default" | "happy" | "worry" | "sad", src: string | null, alt: string }}
   */
  function moodForSummary(summary) {
    if (!summary || Number(summary.pct) <= 0) {
      return { mood: "default", src: null, alt: "Ready for scan" };
    }

    const barKey = String(summary.barKey || "");
    const pct = Math.min(100, Math.max(0, Number(summary.pct) || 0));

    if (barKey === "healthy") {
      return { mood: "happy", src: happyEmoji, alt: "Healthy" };
    }

    /* Mood follows symptom severity (extent), not AI confidence. */
    const severityPct = Number.isFinite(Number(summary.severityPct))
      ? Math.min(100, Math.max(0, Number(summary.severityPct)))
      : pct;
    if (severityPct >= 67) {
      return { mood: "sad", src: sadEmoji, alt: "Severe symptoms" };
    }

    if (severityPct >= 34) {
      return { mood: "worry", src: worryEmoji, alt: "Moderate symptoms" };
    }

    return { mood: "worry", src: worryEmoji, alt: "Mild symptoms" };
  }

  window.TomatoInsightTileEmoji = {
    tileIcon,
    happyEmoji,
    worryEmoji,
    sadEmoji,
    defaultEmoji: tileIcon,
    moodForSummary,
  };
})();
