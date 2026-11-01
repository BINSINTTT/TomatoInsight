import { getApps } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut as firebaseSignOut } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import {
  buildDisplayName,
  loadUserProfile,
  loadUserProfileFromCache,
  profileHasDisplayableData,
  saveUserProfile,
} from "./Firebase/user-profile.service.module.js";
import { ensureAccountCredits, takeProfileBonusNotice } from "./Firebase/credits.module.js";
import {
  hasProfilePhoto,
  readFarmSetupStats,
} from "./farm-setup-status.module.js";

function initialsFromProfile(profile, user) {
  const first = profile?.firstName?.trim();
  const last = profile?.lastName?.trim();
  if (first && last) return (first[0] + last[0]).toUpperCase();
  const name = user?.displayName?.trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  const email = user?.email || "";
  return email.slice(0, 2).toUpperCase() || "?";
}

function readFarmStats() {
  return readFarmSetupStats();
}

function bindProfileHero(user, profile) {
  const nameEl = document.getElementById("profile-display-name");
  const farmEl = document.getElementById("profile-display-farm");
  const emailEl = document.getElementById("profile-display-email");
  const avatarEl = document.getElementById("profile-avatar-initials");
  const displayName = buildDisplayName(profile) || user.displayName?.trim() || "Tomato Insight user";
  const farmLabel = profile.farmName?.trim() || "Your farm";

  if (nameEl) nameEl.textContent = displayName;
  if (farmEl) farmEl.textContent = farmLabel;
  if (emailEl) emailEl.textContent = user.email || "";
  if (avatarEl) avatarEl.textContent = initialsFromProfile(profile, user);
  showProfilePhoto(profile.photo);

  const emailReadonly = document.getElementById("profile-email-readonly");
  if (emailReadonly) emailReadonly.value = user.email || profile.email || "";

  const stats = readFarmStats();
  const statTiles = document.getElementById("profile-stat-tiles");
  const statScans = document.getElementById("profile-stat-scans");
  const statWeek = document.getElementById("profile-stat-week");
  if (statTiles) statTiles.textContent = String(stats.tileCount);
  if (statScans) statScans.textContent = String(stats.scansSaved);
  if (statWeek) statWeek.textContent = stats.farmWeek != null ? String(stats.farmWeek) : "—";

  const chipTiles = document.getElementById("profile-chip-tiles");
  const chipScans = document.getElementById("profile-chip-scans");
  const chipWeek = document.getElementById("profile-chip-week");
  if (chipTiles) chipTiles.textContent = `${stats.tileCount} tiles`;
  if (chipScans) chipScans.textContent = `${stats.scansSaved} scans`;
  if (chipWeek) chipWeek.textContent = stats.farmWeek != null ? `Week ${stats.farmWeek}` : "Week —";

  renderEvents(stats);
  renderTasks(profile, stats);
  syncProfileCreditReminders();
}

function syncProfileCreditReminders() {
  const show = Boolean(window.TomatoInsightCredits?.shouldShowProfileCreditReminder?.());
  const setupReminder = document.getElementById("profile-credits-reminder");
  const detailsReminder = document.getElementById("profile-details-credits-reminder");
  if (setupReminder) setupReminder.hidden = !show;
  if (detailsReminder) detailsReminder.hidden = !show;
}

function showProfilePhoto(photo) {
  const photoEl = document.getElementById("profile-avatar-photo");
  const removeBtn = document.getElementById("profile-photo-remove");
  const valid = typeof photo === "string" && photo.startsWith("data:image/jpeg;base64,");
  if (photoEl) {
    if (valid) {
      photoEl.src = photo;
      photoEl.hidden = false;
    } else {
      photoEl.removeAttribute("src");
      photoEl.hidden = true;
    }
  }
  if (removeBtn) removeBtn.hidden = !valid;
  window.dispatchEvent(
    new CustomEvent("tomatoInsight:profilePhoto", { detail: { photo: valid ? photo : "" } })
  );
}

let initialProfileLoad = true;
let profileLoadToken = 0;

function setProfileLoading(active) {
  const wrap = document.getElementById("profile-wrap");
  if (!wrap) return;
  wrap.classList.toggle("profile-wrap--loading", active);
  const load = document.getElementById("profile-load");
  if (load) load.setAttribute("aria-busy", active ? "true" : "false");
}

function setPhotoStatus(message, ok) {
  const status = document.getElementById("profile-photo-status");
  if (!status) return;
  status.textContent = message || "";
  status.hidden = !message;
  status.classList.toggle("profile-photo-status--ok", Boolean(ok));
}

function fileToProfilePhoto(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith("image/")) {
      reject(new Error("Choose an image file."));
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      reject(new Error("Choose an image that is 8 MB or smaller."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that image."));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = 320;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Could not prepare that image."));
          return;
        }
        const scale = Math.max(size / img.width, size / img.height);
        const width = img.width * scale;
        const height = img.height * scale;
        ctx.drawImage(img, (size - width) / 2, (size - height) / 2, width, height);
        let quality = 0.82;
        let dataUrl = canvas.toDataURL("image/jpeg", quality);
        while (dataUrl.length > 170000 && quality > 0.5) {
          quality -= 0.08;
          dataUrl = canvas.toDataURL("image/jpeg", Number(quality.toFixed(2)));
        }
        if (dataUrl.length > 180000) {
          reject(new Error("That image is too detailed. Try another photo."));
          return;
        }
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error("Could not read that image."));
      img.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });
}
function showMessage(el, message) {
  if (!el) return;
  if (!message) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.textContent = message;
  el.hidden = false;
}


function fillProfileForm(form, profile) {
  if (!form) return;
  form.firstName.value = profile.firstName || "";
  form.middleInitial.value = profile.middleInitial || "";
  form.lastName.value = profile.lastName || "";
  form.farmName.value = profile.farmName || "";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderEvents(stats) {
  const root = document.getElementById("profile-events");
  if (!root) return;
  if (!stats.tileCount) {
    root.innerHTML =
      `<p class="profile-act-empty">Set rows and columns on Home to start tracking plants.</p>`;
    return;
  }
  const week = stats.farmWeek != null ? `Week ${stats.farmWeek}` : "No week selected";
  const scans =
    stats.scansSaved === 1 ? "1 saved scan" : `${stats.scansSaved} saved scans`;
  const empty =
    stats.scansSaved === 0
      ? `<p class="profile-act-empty">Your next scan will appear here.</p>`
      : "";
  root.innerHTML =
    `<article class="profile-act"><b>${week}</b><span>${scans} on this farm. Open Monitoring to compare the latest result.</span></article>${empty}`;
}

function renderTasks(profile, stats) {
  const list = document.getElementById("profile-tasks");
  const progress = document.getElementById("profile-tasks-progress");
  const sub = document.getElementById("profile-tasks-sub");
  const bar = document.getElementById("profile-tasks-bar");
  const meter = document.getElementById("profile-tasks-meter");
  if (!list) return;
  const displayName = buildDisplayName(profile);
  const layoutNote = stats.tileCount
    ? `${stats.tileCount} tiles${stats.rows && stats.columns ? `, ${stats.rows} × ${stats.columns}` : ""}`
    : "Choose rows and columns";
  const tasks = [
    {
      done: Boolean(profile.firstName?.trim() && profile.lastName?.trim()),
      title: "Add your name",
      note: escapeHtml(displayName || "First and last name on this profile"),
    },
    {
      done: Boolean(profile.farmName?.trim()),
      title: "Name your farm",
      note: escapeHtml(profile.farmName?.trim() || "Shown on your profile"),
    },
    {
      done: hasProfilePhoto(profile),
      title: "Add a profile photo",
      note: hasProfilePhoto(profile) ? "Your photo is on this profile" : "Use the avatar above to upload a photo.",
      setupAction: "photo",
      link: "Upload photo",
    },
    {
      done: stats.tileCount > 0,
      title: "Set the farm layout",
      note: escapeHtml(layoutNote),
      href: "index.html",
      link: "Edit",
    },
    {
      done: stats.scansSaved > 0,
      title: "Save your first leaf scan",
      note: stats.scansSaved ? `${stats.scansSaved} saved` : "Scan a tile, then tap Save info.",
      href: "index.html",
      link: "Scan a leaf",
    },
    {
      done: stats.farmWeek != null,
      title: "Choose a farm week",
      note: stats.farmWeek != null ? `Week ${stats.farmWeek}` : "Pick a week in History or Monitoring",
      href: "monitoring.html",
      link: "Change",
    },
  ];
  const doneCount = tasks.filter((task) => task.done).length;
  const left = tasks.length - doneCount;
  const pct = Math.round((doneCount / tasks.length) * 100);
  const nextIndex = tasks.findIndex((task) => !task.done);
  if (progress) progress.textContent = `${doneCount} of ${tasks.length} done`;
  if (sub) {
    sub.textContent =
      left === 0
        ? "Farm setup is complete."
        : left === 1
          ? "One step left to start tracking plant health."
          : `${left} steps left to start tracking plant health.`;
  }
  if (bar) bar.style.width = `${pct}%`;
  if (meter) {
    meter.setAttribute("aria-valuenow", String(pct));
    meter.setAttribute("aria-valuetext", `${doneCount} of ${tasks.length} done`);
  }
  const ring = document.getElementById("profile-setup-ring");
  if (ring) {
    ring.style.setProperty("--setup-pct", `${pct}%`);
    ring.setAttribute("aria-valuenow", String(pct));
    ring.setAttribute("aria-valuetext", `${doneCount} of ${tasks.length} done`);
  }
  const check =
    `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" d="M5 12.5l4.5 4.5L19 7"/></svg>`;
  list.innerHTML = tasks
    .map((task, index) => {
      const next = index === nextIndex;
      const classes = ["profile-step"];
      if (task.done) classes.push("profile-step--done");
      if (next) classes.push("profile-step--next");
      let action = "";
      if (task.href) {
        action = `<a class="${next ? "profile-step__btn" : "profile-step__link"}" href="${task.href}">${task.link}</a>`;
      } else if (task.setupAction === "photo" && task.link) {
        action = `<button type="button" class="${next ? "profile-step__btn" : "profile-step__link"}" data-setup-upload-photo="1">${task.link}</button>`;
      }
      return (
        `<li class="${classes.join(" ")}">` +
        `<span class="profile-step__dot">${task.done ? check : ""}</span>` +
        `<div><b>${task.title}</b><small>${task.note}</small></div>` +
        action +
        `</li>`
      );
    })
    .join("");
}

let calendarCursor = new Date();

function calendarApi() {
  return window.TomatoInsightScanCalendar;
}

function setCalendarNote(message) {
  const note = document.getElementById("profile-calendar-note");
  if (note && message) note.textContent = message;
}

  function calendarNoteFor(schedule) {
  const api = calendarApi();
  if (!schedule?.enabled) return "Turn this on to pick the first scan day and the next week.";
  if (schedule.nextDue) {
    const week = api.weekNumberForIso(schedule.nextDue);
    return `Week ${week} is scheduled for ${api.formatIso(schedule.nextDue)}. Saved plants show that reminder on Home. Save Info updates that week.`;
  }
  if (schedule.anchor) {
    return `Week 4 starts ${api.formatIso(schedule.anchor)}. Scan once, then pick a date 7 days later.`;
  }
  return "Click the first scan date. Scanning that day saves Week 4 without a second Save Info.";
}

function syncCalendarButton(schedule) {
  const button = document.getElementById("profile-calendar-custom");
  const reset = document.getElementById("profile-calendar-reset");
  if (button) {
    button.setAttribute("aria-pressed", schedule.enabled ? "true" : "false");
    button.setAttribute("aria-checked", schedule.enabled ? "true" : "false");
    button.classList.toggle("profile-calendar__custom-btn--on", schedule.enabled);
  }
  if (reset) reset.hidden = !schedule.enabled;
}

function renderCalendar() {
  const root = document.getElementById("profile-calendar");
  const title = document.getElementById("profile-calendar-title");
  const api = calendarApi();
  if (!root || !api) return;
  const schedule = api.read();
  syncCalendarButton(schedule);
  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  const today = new Date();
  const todayIso = api.isoFromDate(today);
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  if (title) {
    title.textContent = calendarCursor.toLocaleString(undefined, { month: "long", year: "numeric" });
  }
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const cells = labels.map((label) => `<span class="profile-calendar__dow">${label}</span>`);
  for (let i = 0; i < firstWeekday; i += 1) {
    cells.push(`<span class="profile-calendar__day profile-calendar__day--empty"></span>`);
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const iso = api.isoFromDate(new Date(year, month, day));
    const classes = ["profile-calendar__day"];
    if (iso === todayIso) classes.push("profile-calendar__day--today");
    if (schedule.enabled && iso === schedule.anchor) classes.push("profile-calendar__day--anchor");
    if (schedule.enabled && iso === schedule.nextDue) classes.push("profile-calendar__day--due");
    if (schedule.enabled && iso === schedule.selected) classes.push("profile-calendar__day--selected");
    if (schedule.enabled) {
      cells.push(
        `<button type="button" class="${classes.join(" ")}" data-calendar-date="${iso}" aria-label="${api.formatIso(iso)}">${day}</button>`
      );
    } else {
      cells.push(`<span class="${classes.join(" ")}">${day}</span>`);
    }
  }
  root.innerHTML = cells.join("");
}

function startProfileClock() {
  const clock = document.getElementById("profile-clock");
  if (!clock) return;
  const tick = () => {
    const now = new Date();
    const date = now.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    const time = now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    clock.textContent = `${date} · ${time}`;
  };
  tick();
  setInterval(tick, 30000);
}

function goToLandingPage() {
  window.TomatoInsightAuthSession?.markSignedOut?.();
  window.location.replace(new URL("landing.html", window.location.href).href);
}

function clearStoredFirebaseUser() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith("firebase:")) keys.push(key);
    }
    keys.forEach((key) => localStorage.removeItem(key));
  } catch {
    /* ignore */
  }
  try {
    indexedDB.deleteDatabase("firebaseLocalStorageDb");
  } catch {
    /* ignore */
  }
}

async function signOutAndLeave(button) {
  if (button) button.disabled = true;
  let finished = false;
  const attempt = (async () => {
    const apps = getApps();
    const authInstance = apps.length ? getAuth(apps[0]) : null;
    if (authInstance) {
      await firebaseSignOut(authInstance);
      return;
    }
    const result = await window.TomatoInsightAuth?.signOut?.();
    if (result && result.ok === false) {
      throw new Error(result.error || "Could not sign out.");
    }
  })();

  try {
    await Promise.race([
      attempt.then(() => {
        finished = true;
      }),
      new Promise((resolve) => {
        window.setTimeout(resolve, 2500);
      }),
    ]);
  } catch (err) {
    console.error("[TomatoInsight] Profile sign-out failed:", err);
  }

  if (!finished) clearStoredFirebaseUser();
  goToLandingPage();
}

document.addEventListener("click", (event) => {
  const target = event.target;
  const button = target instanceof Element ? target.closest("#profile-sign-out") : null;
  if (!button || button.dataset.signingOut === "1") return;
  event.preventDefault();
  button.dataset.signingOut = "1";
  signOutAndLeave(button);
});

function initProfilePage() {
  const apps = getApps();
  if (!apps.length) return;
  const auth = getAuth(apps[0]);

  const form = document.getElementById("profile-details-form");
  const errorEl = document.getElementById("profile-form-error");
  const successEl = document.getElementById("profile-form-success");
  const saveBtn = document.getElementById("profile-save-btn");
  let profileSaveInFlight = false;

  function showProfileBonusNotice(message) {
    showMessage(
      successEl,
      message || "5 credits were added because farm setup is complete."
    );
  }

  if (takeProfileBonusNotice()) showProfileBonusNotice();
  window.addEventListener("tomatoInsight:creditsChanged", (event) => {
    syncProfileCreditReminders();
    if (event.detail?.profileBonusJustGranted) return;
    if (profileSaveInFlight || !takeProfileBonusNotice()) return;
    showProfileBonusNotice();
  });

  document.getElementById("profile-tasks")?.addEventListener("click", (event) => {
    const button =
      event.target instanceof Element ? event.target.closest("[data-setup-upload-photo]") : null;
    if (!button) return;
    event.preventDefault();
    document.getElementById("profile-photo-input")?.click();
    document.getElementById("profile-setup-ring")?.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  startProfileClock();
  renderCalendar();
  setCalendarNote(calendarNoteFor(calendarApi()?.read?.()));
  document.getElementById("profile-calendar-custom")?.addEventListener("click", () => {
    const api = calendarApi();
    if (!api) return;
    const current = api.read();
    const next = api.write({ ...current, enabled: !current.enabled });
    setCalendarNote(calendarNoteFor(next));
    renderCalendar();
  });
  document.getElementById("profile-calendar-reset")?.addEventListener("click", () => {
    const api = calendarApi();
    if (!api) return;
    const next = api.write({ enabled: true, anchor: "", nextDue: "", selected: "" });
    setCalendarNote("Dates cleared. Click a new first scan day to start Week 4 again.");
    renderCalendar();
    if (next) syncCalendarButton(next);
  });
  document.getElementById("profile-calendar")?.addEventListener("click", (event) => {
    const api = calendarApi();
    const button = event.target instanceof Element ? event.target.closest("[data-calendar-date]") : null;
    if (!api || !button) return;
    const result = api.chooseDate(button.getAttribute("data-calendar-date"));
    setCalendarNote(result.message || calendarNoteFor(result.schedule));
    renderCalendar();
  });
  document.getElementById("profile-cal-prev")?.addEventListener("click", () => {
    calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() - 1, 1);
    renderCalendar();
  });
  document.getElementById("profile-cal-next")?.addEventListener("click", () => {
    calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 1);
    renderCalendar();
  });

  const photoInput = document.getElementById("profile-photo-input");
  const avatarBtn = document.getElementById("profile-avatar-btn");
  const uploadLabel = document.querySelector(".profile-avatar-picker__upload");
  const removePhotoBtn = document.getElementById("profile-photo-remove");

  async function persistPhoto(photo) {
    const user = auth.currentUser;
    if (!user) {
      setPhotoStatus("Sign in to change your photo.");
      return;
    }
    const current = await loadUserProfile(user.uid, user);
    const result = await saveUserProfile(user.uid, {
      firstName: form?.firstName.value.trim() ? form.firstName.value : current.firstName,
      middleInitial: form?.middleInitial.value.trim() ? form.middleInitial.value : current.middleInitial,
      lastName: form?.lastName.value.trim() ? form.lastName.value : current.lastName,
      farmName: form ? form.farmName.value : current.farmName,
      email: current.email,
      photo,
    });
    if (!result.ok) {
      setPhotoStatus(result.error || "Could not save your photo.");
      return;
    }
    bindProfileHero(user, result.profile);
    fillProfileForm(form, result.profile);
    setPhotoStatus(photo ? "Photo saved." : "Photo removed.", true);
    try {
      const credits = await ensureAccountCredits(user.uid, result.profile);
      if (credits.profileBonusJustGranted) {
        showProfileBonusNotice("Farm setup is complete. 5 credits were added to your account.");
      }
    } catch (err) {
      console.warn("[TomatoInsight] Could not sync credits after photo save.", err);
    }
  }

  photoInput?.addEventListener("change", async () => {
    const file = photoInput.files?.[0];
    photoInput.value = "";
    if (!file) return;
    if (avatarBtn) avatarBtn.style.pointerEvents = "none";
    if (uploadLabel) uploadLabel.style.pointerEvents = "none";
    setPhotoStatus("Saving photo…");
    try {
      const photo = await fileToProfilePhoto(file);
      await persistPhoto(photo);
    } catch (err) {
      setPhotoStatus(err?.message || "Could not use that image.");
    } finally {
      if (avatarBtn) avatarBtn.style.pointerEvents = "";
      if (uploadLabel) uploadLabel.style.pointerEvents = "";
    }
  });
  removePhotoBtn?.addEventListener("click", async () => {
    removePhotoBtn.disabled = true;
    try {
      await persistPhoto("");
    } finally {
      removePhotoBtn.disabled = false;
    }
  });

  async function refreshProfileView(user, options = {}) {
    const background = options.background === true;
    const token = (profileLoadToken += 1);

    if (!background) {
      const cached = loadUserProfileFromCache(user.uid, user);
      if (profileHasDisplayableData(cached)) {
        bindProfileHero(user, cached);
        fillProfileForm(form, cached);
        setProfileLoading(false);
        initialProfileLoad = false;
      } else if (initialProfileLoad) {
        setProfileLoading(true);
      }
    }

    await window.TomatoInsightUserData?.whenReady?.();
    if (token !== profileLoadToken) return;

    const profile = await loadUserProfile(user.uid, user, { skipWhenReady: true });
    if (token !== profileLoadToken) return;

    bindProfileHero(user, profile);
    fillProfileForm(form, profile);

    if (!background) {
      setProfileLoading(false);
      initialProfileLoad = false;
    }
  }

  onAuthStateChanged(auth, (user) => {
    if (!user) return;
    refreshProfileView(user);
  });

  window.addEventListener("tomatoInsight:userDataReady", (event) => {
    const user = auth.currentUser;
    if (!user) return;
    const shouldRefresh = window.TomatoInsightUserData?.shouldRefreshUiForUserDataEvent?.(
      event.detail
    );
    if (shouldRefresh === false) return;
    refreshProfileView(user, { background: Boolean(event.detail?.background) });
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    showMessage(errorEl, null);
    showMessage(successEl, null);

    const user = auth.currentUser;
    if (!user) {
      showMessage(errorEl, "You must be signed in to save changes.");
      return;
    }

    const middleInitial = form.middleInitial.value.trim().toUpperCase();
    if (middleInitial && !/^[A-Z]$/.test(middleInitial)) {
      showMessage(errorEl, "Middle initial must be a single letter.");
      form.middleInitial.setAttribute("aria-invalid", "true");
      return;
    }
    form.middleInitial.removeAttribute("aria-invalid");

    saveBtn.disabled = true;
    profileSaveInFlight = true;
    const balanceBeforeSave = window.TomatoInsightCredits?.getBalance?.();
    try {
      const result = await saveUserProfile(user.uid, {
        firstName: form.firstName.value,
        middleInitial,
        lastName: form.lastName.value,
        farmName: form.farmName.value,
      });

      if (!result.ok) {
        showMessage(errorEl, result.error || "Could not save profile.");
        return;
      }

      bindProfileHero(user, result.profile);
      fillProfileForm(form, result.profile);
      let bonusJustGranted = false;
      let showBonusToast = false;
      let balanceAfterSave = null;
      try {
        const credits = await ensureAccountCredits(user.uid, result.profile);
        balanceAfterSave = Number(credits.balance);
        const gainedProfileBonus =
          Number.isFinite(balanceBeforeSave) &&
          Number.isFinite(balanceAfterSave) &&
          balanceAfterSave - balanceBeforeSave >= 5 &&
          credits.profileBonusGranted;
        showBonusToast = Boolean(credits.profileBonusJustGranted) || gainedProfileBonus;
        bonusJustGranted = showBonusToast;
      } catch (err) {
        console.warn("[TomatoInsight] Could not add profile credits.", err);
      }
      // A sign-in sync can grant the bonus while this save is in flight (inline message only).
      bonusJustGranted =
        showBonusToast || bonusJustGranted || takeProfileBonusNotice();
      showMessage(
        successEl,
        bonusJustGranted
          ? "Your details were saved. 5 credits were added because farm setup is complete."
          : result.warning || "Your details were saved."
      );
      window.dispatchEvent(
        new CustomEvent("tomatoInsight:profileUpdated", {
          detail: { uid: user.uid, displayName: result.displayName || "" },
        })
      );
      window.TomatoInsightStorageSnapshot?.schedule?.();
    } finally {
      profileSaveInFlight = false;
      saveBtn.disabled = false;
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initProfilePage);
} else {
  initProfilePage();
}
