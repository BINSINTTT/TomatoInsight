import { getApps } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut as firebaseSignOut } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import {
  buildDisplayName,
  loadUserProfile,
  saveUserProfile,
} from "./Firebase/user-profile.service.module.js";

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
  let tileCount = 0;
  let scansSaved = 0;
  let farmWeek = null;

  try {
    const layoutRaw = localStorage.getItem("tomatoInsight.farmLayout");
    if (layoutRaw) {
      const layout = JSON.parse(layoutRaw);
      if (layout.rows >= 1 && layout.columns >= 1) {
        tileCount = layout.rows * layout.columns;
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

  return { tileCount, scansSaved, farmWeek };
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
      `<article class="profile-event profile-event--quiet"><strong>No farm layout yet</strong><p>Set rows and columns on Home to start tracking plants.</p></article>`;
    return;
  }
  const week = stats.farmWeek != null ? `Week ${stats.farmWeek}` : "No week selected";
  const scans =
    stats.scansSaved === 1 ? "1 saved scan" : `${stats.scansSaved} saved scans`;
  root.innerHTML =
    `<article class="profile-event"><strong>${week}</strong><p>${scans} on this farm. Open Monitoring to compare the latest result.</p></article>`;
}

function renderTasks(profile, stats) {
  const list = document.getElementById("profile-tasks");
  const progress = document.getElementById("profile-tasks-progress");
  if (!list) return;
  const tasks = [
    {
      done: Boolean(profile.firstName?.trim() && profile.lastName?.trim()),
      title: "Add your name",
      note: "First and last name on this profile",
    },
    {
      done: Boolean(profile.farmName?.trim()),
      title: "Name your farm",
      note: escapeHtml(profile.farmName?.trim() || "Shown on your profile"),
    },
    {
      done: stats.tileCount > 0,
      title: "Set the farm layout",
      note: stats.tileCount ? `${stats.tileCount} tiles` : "Choose rows and columns",
      href: "index.html",
      link: "Home",
    },
    {
      done: stats.scansSaved > 0,
      title: "Save a leaf scan",
      note: stats.scansSaved ? `${stats.scansSaved} saved` : "Scan a tile and tap Save Info",
      href: "index.html",
      link: "Scan",
    },
    {
      done: stats.farmWeek != null,
      title: "Choose a farm week",
      note: stats.farmWeek != null ? `Week ${stats.farmWeek}` : "Pick a week in History or Monitoring",
      href: "monitoring.html",
      link: "Monitoring",
    },
  ];
  const doneCount = tasks.filter((task) => task.done).length;
  if (progress) progress.textContent = `${doneCount}/${tasks.length} completed`;
  list.innerHTML = tasks
    .map(
      (task) =>
        `<li class="profile-task${task.done ? " profile-task--done" : ""}">` +
        `<span class="profile-task__check" aria-hidden="true"></span>` +
        `<div><p class="profile-task__title">${task.title}</p><p class="profile-task__note">${task.note}</p></div>` +
        (task.href ? `<a class="profile-task__link" href="${task.href}">${task.link}</a>` : `<span></span>`) +
        `</li>`
    )
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
    button.classList.toggle("profile-calendar__custom-btn--on", schedule.enabled);
    button.textContent = schedule.enabled ? "Custom dates on" : "Custom dates";
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
    title.textContent = calendarCursor
      .toLocaleString(undefined, { month: "long", year: "numeric" })
      .toUpperCase();
  }
  const labels = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
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
    clock.textContent = new Date().toLocaleString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
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

  async function refreshProfileView(user) {
    const profile = await loadUserProfile(user.uid, user);
    bindProfileHero(user, profile);
    fillProfileForm(form, profile);
  }

  onAuthStateChanged(auth, (user) => {
    if (!user) return;
    refreshProfileView(user);
  });

  window.addEventListener("tomatoInsight:userDataReady", () => {
    const user = auth.currentUser;
    if (user) refreshProfileView(user);
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
      showMessage(successEl, result.warning || "Your details were saved.");
      window.dispatchEvent(
        new CustomEvent("tomatoInsight:profileUpdated", {
          detail: { uid: user.uid, displayName: result.displayName || "" },
        })
      );
      window.TomatoInsightStorageSnapshot?.schedule?.();
    } finally {
      saveBtn.disabled = false;
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initProfilePage);
} else {
  initProfilePage();
}
