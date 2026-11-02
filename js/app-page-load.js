(function () {
  const PAGE_OVERLAY_ID = "app-page-load";
  const AUTH_OVERLAY_ID = "auth-check-load";

  function waitForModule(getter, maxAttempts = 240) {
    return new Promise((resolve) => {
      let attempts = 0;
      const tick = () => {
        const api = getter();
        if (api?.whenReady) {
          api.whenReady().then(resolve, resolve);
          return;
        }
        attempts += 1;
        if (attempts > maxAttempts) {
          resolve();
          return;
        }
        window.setTimeout(tick, 25);
      };
      tick();
    });
  }

  function waitForUserDataReady() {
    return waitForModule(() => window.TomatoInsightUserData);
  }

  function waitForCreditsReady() {
    return waitForModule(() => window.TomatoInsightCredits);
  }

  function overlayMarkup(message) {
    return (
      `<div class="app-page-load__panel">` +
      `<div class="app-page-load__ring" aria-hidden="true"></div>` +
      `<p class="app-page-load__text">${message}</p>` +
      `</div>`
    );
  }

  function getPageOverlay() {
    return document.getElementById(PAGE_OVERLAY_ID);
  }

  function applyMessage(overlay, message) {
    if (!overlay) return;
    const textEl = overlay.querySelector(".app-page-load__text");
    const msg = message || overlay.getAttribute("data-app-load-message") || "Loading…";
    if (textEl) textEl.textContent = msg;
  }

  function setPageLoading(show, overlay) {
    const el = overlay || getPageOverlay();
    if (!el) return;
    el.classList.toggle("app-page-load--hidden", !show);
    el.setAttribute("aria-busy", show ? "true" : "false");
  }

  function boot(options = {}) {
    const overlay = options.overlay || getPageOverlay();
    if (!overlay) return Promise.resolve();
    applyMessage(overlay, options.message);
    const waitUser = options.waitUser !== false;
    const waitCredits = options.waitCredits !== false;
    setPageLoading(true, overlay);
    const tasks = [];
    if (waitUser) tasks.push(waitForUserDataReady());
    if (waitCredits) tasks.push(waitForCreditsReady());
    return Promise.all(tasks).finally(() => {
      window.requestAnimationFrame(() => setPageLoading(false, overlay));
    });
  }

  function syncAuthCheckOverlay(overlay) {
    const root = document.documentElement;
    const pending =
      root.getAttribute("data-auth") === "required" &&
      root.classList.contains("auth-pending") &&
      !root.classList.contains("auth-ready");
    overlay.classList.toggle("app-page-load--hidden", !pending);
    overlay.setAttribute("aria-busy", pending ? "true" : "false");
  }

  function mountAuthCheckOverlay() {
    if (document.documentElement.getAttribute("data-auth") !== "required") return;
    let overlay = document.getElementById(AUTH_OVERLAY_ID);
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = AUTH_OVERLAY_ID;
      overlay.className = "app-page-load app-page-load--viewport";
      overlay.setAttribute("role", "status");
      overlay.setAttribute("aria-live", "polite");
      overlay.innerHTML = overlayMarkup("Checking your account…");
      document.body.appendChild(overlay);
    }
    syncAuthCheckOverlay(overlay);
    new MutationObserver(() => syncAuthCheckOverlay(overlay)).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
  }

  window.TomatoInsightAppPageLoad = {
    boot,
    setPageLoading,
    waitForUserDataReady,
    waitForCreditsReady,
  };

  function onDomReady() {
    mountAuthCheckOverlay();
    const overlay = getPageOverlay();
    if (overlay?.hasAttribute("data-app-load-auto")) {
      boot();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onDomReady);
  } else {
    onDomReady();
  }
})();
