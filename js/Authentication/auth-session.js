(function () {
  const SESSION_KEY = "tomatoInsight.authSession";
  const REMEMBER_KEY = "tomatoInsight.authRemember";

  function readRememberPreference() {
    try {
      const stored = localStorage.getItem(REMEMBER_KEY);
      if (stored === "0") return false;
      if (stored === "1") return true;
    } catch {
      /* ignore */
    }
    return true;
  }

  function writeRememberPreference(remember) {
    try {
      localStorage.setItem(REMEMBER_KEY, remember ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  function readSignedIn() {
    try {
      if (sessionStorage.getItem(SESSION_KEY) === "1") return true;
      // Remember me keeps a durable flag so protected pages paint after a browser restart
      // while Firebase restores the LOCAL auth session.
      if (readRememberPreference() && localStorage.getItem(SESSION_KEY) === "1") return true;
    } catch {
      /* ignore */
    }
    return false;
  }

  function clearSessionFlags() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
  }

  const root = document.documentElement;
  if (root.getAttribute("data-auth") === "required") {
    const coverIfStillChecking = () => {
      if (root.classList.contains("auth-confirmed")) return;
      root.classList.remove("auth-ready");
      root.classList.add("auth-pending");
    };

    if (readSignedIn()) {
      /* Paint the page immediately. The full-screen check only appears if Firebase is actually slow. */
      root.classList.add("auth-ready");
      const lagMs = navigator.onLine === false ? 800 : 2500;
      window.setTimeout(coverIfStillChecking, lagMs);
      window.addEventListener("offline", coverIfStillChecking, { once: true });
    } else {
      root.classList.add("auth-pending");
    }
  }

  window.TomatoInsightAuthSession = {
    REMEMBER_KEY,
    SESSION_KEY,
    readRememberPreference,
    writeRememberPreference,
    markSignedIn(rememberOverride) {
      const remember =
        typeof rememberOverride === "boolean" ? rememberOverride : readRememberPreference();
      writeRememberPreference(remember);
      try {
        sessionStorage.setItem(SESSION_KEY, "1");
      } catch {
        /* ignore */
      }
      try {
        if (remember) localStorage.setItem(SESSION_KEY, "1");
        else localStorage.removeItem(SESSION_KEY);
      } catch {
        /* ignore */
      }
    },
    markSignedOut() {
      clearSessionFlags();
    },
    isSignedInCached() {
      return readSignedIn();
    },
  };
})();
