(function () {
  const KEY = "tomatoInsight.sidebarCollapsed";
  const root = document.documentElement;
  const button = document.getElementById("sidebar-toggle");

  document.querySelectorAll(".nav__link").forEach((link) => {
    const label = link.textContent.replace(/\s+/g, " ").trim();
    if (label) link.setAttribute("title", label);
  });

  function syncButton() {
    if (!button) return;
    const collapsed = root.classList.contains("sidebar-collapsed");
    button.setAttribute("aria-expanded", collapsed ? "false" : "true");
    button.setAttribute("aria-label", collapsed ? "Show sidebar labels" : "Hide sidebar labels");
  }

  button?.addEventListener("click", () => {
    const collapsed = !root.classList.contains("sidebar-collapsed");
    root.classList.toggle("sidebar-collapsed", collapsed);
    try {
      localStorage.setItem(KEY, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
    syncButton();
  });

  syncButton();

  function paintSidebarPhoto(photo) {
    const dot = document.querySelector(".sidebar__avatar-dot");
    if (!dot) return;
    const valid = typeof photo === "string" && photo.startsWith("data:image/jpeg;base64,");
    dot.style.backgroundImage = valid ? `url(${JSON.stringify(photo)})` : "";
  }

  function profileForUid(uid) {
    if (!uid) return null;
    try {
      const map = JSON.parse(localStorage.getItem("tomatoInsight.userProfiles") || "{}");
      return map[uid] || null;
    } catch {
      return null;
    }
  }

  function fullNameFromProfile(profile) {
    if (!profile) return "";
    const first = String(profile.firstName || "").trim();
    const middle = String(profile.middleInitial || "").trim().toUpperCase().slice(0, 1);
    const last = String(profile.lastName || "").trim();
    return [first, middle, last].filter(Boolean).join(" ");
  }

  function paintSidebarName(uid, fallbackName) {
    const nameEl = document.querySelector(".sidebar__avatar-name");
    const link = document.querySelector(".sidebar__avatar");
    if (!nameEl) return;
    const fromProfile = fullNameFromProfile(profileForUid(uid));
    const fromAccount = String(fallbackName || window.__tomatoInsightAccountName || "").trim();
    const name =
      fromAccount.split(/\s+/).filter(Boolean).length > fromProfile.split(/\s+/).filter(Boolean).length
        ? fromAccount
        : fromProfile || fromAccount;
    if (!name) return;
    nameEl.textContent = name;
    nameEl.hidden = false;
    if (link) link.setAttribute("aria-label", `Open profile for ${name}`);
  }

  function paintSidebarProfile(uid, fallbackName) {
    const profile = profileForUid(uid);
    if (profile?.photo) paintSidebarPhoto(profile.photo);
    paintSidebarName(uid, fallbackName);
  }

  window.addEventListener("tomatoInsight:userDataReady", (event) => {
    paintSidebarProfile(event.detail?.uid, event.detail?.displayName);
  });
  window.addEventListener("tomatoInsight:accountName", (event) => {
    paintSidebarProfile(event.detail?.uid, event.detail?.displayName);
  });
  window.addEventListener("tomatoInsight:profileUpdated", (event) => {
    paintSidebarProfile(event.detail?.uid, event.detail?.displayName);
  });
  window.addEventListener("tomatoInsight:profilePhoto", (event) => {
    paintSidebarPhoto(event.detail?.photo || "");
  });
  window.addEventListener("tomatoInsight:userDataCleared", () => {
    const nameEl = document.querySelector(".sidebar__avatar-name");
    paintSidebarPhoto("");
    if (nameEl) {
      nameEl.textContent = "";
      nameEl.hidden = true;
    }
  });
})();
