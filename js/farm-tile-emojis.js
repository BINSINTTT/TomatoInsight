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

    if (pct >= 100) {
      return { mood: "sad", src: sadEmoji, alt: "Severe disease match" };
    }

    if (pct >= 50) {
      return { mood: "worry", src: worryEmoji, alt: "Moderate disease match" };
    }

    return { mood: "worry", src: worryEmoji, alt: "Mild disease match" };
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
