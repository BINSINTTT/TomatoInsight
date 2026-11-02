(function () {
  const KEY = "tomatoInsight.scanCalendar";
  const WEEK_DAYS = 7;

  function emptySchedule() {
    return { enabled: false, anchor: "", nextDue: "", selected: "" };
  }

  function read() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "null");
      if (!raw || typeof raw !== "object") return emptySchedule();
      return {
        enabled: Boolean(raw.enabled),
        anchor: typeof raw.anchor === "string" ? raw.anchor : "",
        nextDue: typeof raw.nextDue === "string" ? raw.nextDue : "",
        selected: typeof raw.selected === "string" ? raw.selected : "",
      };
    } catch {
      return emptySchedule();
    }
  }

  function write(next) {
    const schedule = {
      enabled: Boolean(next.enabled),
      anchor: next.anchor || "",
      nextDue: next.nextDue || "",
      selected: next.selected || "",
    };
    localStorage.setItem(KEY, JSON.stringify(schedule));
    window.TomatoInsightUserData?.syncScanCalendar?.();
    window.TomatoInsightUserData?.notifyLocalChange?.("scan-calendar");
    window.dispatchEvent(new CustomEvent("tomatoInsight:scanCalendar"));
    return schedule;
  }

  function isoFromDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function dateFromIso(iso) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!match) return null;
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  function daysBetween(startIso, endIso) {
    const start = dateFromIso(startIso);
    const end = dateFromIso(endIso);
    if (!start || !end) return null;
    return Math.round((end.getTime() - start.getTime()) / 86400000);
  }

  function formatIso(iso) {
    const date = dateFromIso(iso);
    if (!date) return "";
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function weekNumberForIso(iso) {
    const schedule = read();
    const firstWeek = 4;
    const lastWeek = 12;
    if (!schedule.anchor || !iso) return firstWeek;
    const days = daysBetween(schedule.anchor, iso);
    if (days == null || days < 0) return firstWeek;
    return Math.min(lastWeek, firstWeek + Math.floor(days / WEEK_DAYS));
  }

  function weekForScan() {
    const schedule = read();
    if (!schedule.enabled) return null;
    const iso = schedule.selected || schedule.anchor || isoFromDate(new Date());
    return weekNumberForIso(iso);
  }

  function savedAtForScan() {
    const schedule = read();
    if (!schedule.enabled) return "";
    const iso = schedule.selected || schedule.anchor || isoFromDate(new Date());
    const date = dateFromIso(iso);
    if (!date) return "";
    date.setHours(12, 0, 0, 0);
    return date.toISOString();
  }

  function noteScanDate(iso) {
    const schedule = read();
    if (!schedule.enabled || !iso) return schedule;
    if (!schedule.anchor) {
      return write({ ...schedule, anchor: iso, selected: iso, nextDue: "" });
    }
    return write({ ...schedule, selected: iso });
  }

  function isoFromInstant(iso) {
    const date = new Date(iso || "");
    if (Number.isNaN(date.getTime())) return "";
    return isoFromDate(date);
  }

  function scanDayForReminder(savedAtIso, scanDayIso) {
    if (typeof scanDayIso === "string" && dateFromIso(scanDayIso)) return scanDayIso;
    return isoFromInstant(savedAtIso);
  }

  /** Next week for one plant. Uses that tile's scan day, not the farm anchor shared by all tiles. */
  function reminderWeekForPlant(savedAtIso, latestWeek, scanDayIso) {
    const schedule = read();
    if (!schedule.enabled || !schedule.anchor) return null;
    const week = Number(latestWeek);
    if (!Number.isFinite(week)) return null;
    const nextWeek = week + 1;
    if (nextWeek > 12) return null;
    const scanIso = scanDayForReminder(savedAtIso, scanDayIso);
    if (!scanIso) return null;
    const todayIso = isoFromDate(new Date());
    const waited = daysBetween(scanIso, todayIso);
    if (waited != null && waited >= WEEK_DAYS) return nextWeek;
    if (schedule.nextDue && weekNumberForIso(schedule.nextDue) === nextWeek) {
      const gap = daysBetween(scanIso, schedule.nextDue);
      if (gap != null && gap >= WEEK_DAYS) return nextWeek;
    }
    return null;
  }

  function chooseDate(iso) {
    const schedule = read();
    if (!schedule.enabled) return { schedule, message: "" };
    if (!schedule.anchor || daysBetween(schedule.anchor, iso) < 0) {
      const next = write({ ...schedule, anchor: iso, selected: iso, nextDue: "" });
      return {
        schedule: next,
        message: `Week 4 starts ${formatIso(iso)}. Scan each plant once, then choose a date 7 days later for Week 5.`,
      };
    }
    if (daysBetween(schedule.anchor, iso) >= WEEK_DAYS) {
      const next = write({ ...schedule, selected: iso, nextDue: iso });
      const week = weekNumberForIso(iso);
      return {
        schedule: next,
        message: `Week ${week} needs a scan on ${formatIso(iso)}. Saving a plant updates that week instead of starting another one.`,
      };
    }
    const next = write({ ...schedule, selected: iso });
    return {
      schedule: next,
      message: `Choose a date at least 7 days after ${formatIso(schedule.anchor)} to schedule Week 5.`,
    };
  }

  window.TomatoInsightScanCalendar = {
    KEY,
    read,
    write,
    isoFromDate,
    formatIso,
    daysBetween,
    savedAtForScan,
    noteScanDate,
    chooseDate,
    weekNumberForIso,
    weekForScan,
    scanDayForReminder,
    reminderWeekForPlant,
  };
})();
