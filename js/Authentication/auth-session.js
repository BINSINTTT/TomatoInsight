(function () {
  const KEY = "tomatoInsight.authSession";

  function readSignedIn() {
    try {
      return sessionStorage.getItem(KEY) === "1";
    } catch {
      return false;
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
    markSignedIn() {
      try {
        sessionStorage.setItem(KEY, "1");
      } catch {
        /* ignore */
      }
    },
    markSignedOut() {
      try {
        sessionStorage.removeItem(KEY);
      } catch {
        /* ignore */
      }
    },
    isSignedInCached() {
      return readSignedIn();
    },
  };
})();
