(function () {
  const KEY = "tomatoInsight.authSession";

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
      try {
        return sessionStorage.getItem(KEY) === "1";
      } catch {
        return false;
      }
    },
  };
})();
