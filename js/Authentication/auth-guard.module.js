import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { bindUserDataSync } from "../Firebase/user-data-sync.module.js";
import "../Firebase/credits.module.js";

const config = window.TOMATO_INSIGHT_FIREBASE_CONFIG;
const authMode = document.documentElement.getAttribute("data-auth");

function showSignedInApp() {
  const root = document.documentElement;
  root.classList.add("auth-ready", "auth-confirmed");
  root.classList.remove("auth-pending");
}

if (authMode === "required" && !config?.apiKey) {
  window.location.replace("landing.html");
}

function safeAppPath(raw) {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "";
  const pathOnly = raw.split(/[?#]/)[0];
  if (pathOnly === "/" || pathOnly === "/landing.html") return "";
  if (/^\/(login|signup|forgot-password|reset-password)\.html$/.test(pathOnly)) return "";
  if (!/^\/[A-Za-z0-9._/-]+\.html$/.test(pathOnly)) return "";
  return raw;
}

if (authMode && config?.apiKey) {
  const app = getApps().length ? getApps()[0] : initializeApp(config);
  const auth = getAuth(app);
  bindUserDataSync(auth);

  onAuthStateChanged(auth, (user) => {
    window.__tomatoInsightAccountName = user?.displayName || "";
    if (user) {
      showSignedInApp();
      window.TomatoInsightAuthSession?.markSignedIn?.();
      window.dispatchEvent(
        new CustomEvent("tomatoInsight:accountName", {
          detail: { uid: user.uid, displayName: user.displayName || "" },
        })
      );
    } else {
      window.TomatoInsightAuthSession?.markSignedOut?.();
    }

    if (authMode === "required" && !user) {
      window.location.replace("landing.html");
      return;
    }
    if (authMode === "guest" && user) {
      const next = safeAppPath(new URLSearchParams(window.location.search).get("next"));
      if (next) window.location.replace(next);
    }
  });

  if (authMode === "required") {
    window.setTimeout(() => {
      if (!document.documentElement.classList.contains("auth-confirmed")) {
        window.location.replace("landing.html");
      }
    }, 12000);
  }
}
