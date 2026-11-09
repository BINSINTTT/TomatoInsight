import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  signOut as firebaseSignOut,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { bindUserDataSync } from "../Firebase/user-data-sync.module.js";
import "../Firebase/credits.module.js";
import "../Firebase/payments.module.js";

const config = window.TOMATO_INSIGHT_FIREBASE_CONFIG;
const authMode = document.documentElement.getAttribute("data-auth");

function showSignedInApp() {
  const root = document.documentElement;
  root.classList.add("auth-ready", "auth-confirmed");
  root.classList.remove("auth-pending");
}

if (authMode === "required" && !config?.apiKey) {
  window.location.replace("login.html");
}

function safeAppPath(raw) {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "";
  const pathOnly = raw.split(/[?#]/)[0];
  if (pathOnly === "/" || pathOnly === "/landing.html") return "";
  if (/^\/(login|signup|forgot-password|reset-password)\.html$/.test(pathOnly)) return "";
  if (!/^\/[A-Za-z0-9._/-]+\.html$/.test(pathOnly)) return "";
  return raw;
}

function rememberPreferred() {
  return window.TomatoInsightAuthSession?.readRememberPreference?.() ?? true;
}

if (authMode && config?.apiKey) {
  const app = getApps().length ? getApps()[0] : initializeApp(config);
  const auth = getAuth(app);
  bindUserDataSync(auth);

  setPersistence(
    auth,
    rememberPreferred() ? browserLocalPersistence : browserSessionPersistence
  ).catch((err) => {
    console.warn("[TomatoInsight] Remember me persistence on guard:", err);
  });

  onAuthStateChanged(auth, async (user) => {
    window.__tomatoInsightAccountName = user?.displayName || "";

    // Email/password accounts must verify Gmail before entering the app.
    if (user && !user.emailVerified) {
      window.TomatoInsightAuthSession?.markSignedOut?.();
      if (authMode === "required") {
        const email = encodeURIComponent(user.email || "");
        try {
          await firebaseSignOut(auth);
        } catch (err) {
          console.warn("[TomatoInsight] Could not sign out unverified user:", err);
        }
        window.location.replace(`login.html?verify=1${email ? `&email=${email}` : ""}`);
        return;
      }
      // Guest auth pages: stay here so the verify panel can show. Do not enter the app.
      return;
    }

    if (user) {
      showSignedInApp();
      // Keep the durable session flag in sync with the stored Remember me preference.
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
      const nextPath = safeAppPath(window.location.pathname + window.location.search);
      const loginUrl = nextPath
        ? `login.html?next=${encodeURIComponent(nextPath)}`
        : "login.html";
      window.location.replace(loginUrl);
      return;
    }
    if (authMode === "guest" && user) {
      // Verified users leave auth pages for the farm dashboard (index).
      const params = new URLSearchParams(window.location.search);
      const next = safeAppPath(params.get("next")) || "/index.html";
      window.location.replace(next);
    }
  });

  if (authMode === "required") {
    window.setTimeout(() => {
      if (!document.documentElement.classList.contains("auth-confirmed")) {
        window.location.replace("login.html");
      }
    }, 12000);
  }
}
