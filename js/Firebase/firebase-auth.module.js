import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail as firebaseSendPasswordResetEmail,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { getAnalytics, isSupported } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-analytics.js";

const firebaseConfig = window.TOMATO_INSIGHT_FIREBASE_CONFIG;

function authErrorMessage(error) {
  const code = error?.code || "";
  const map = {
    "auth/email-already-in-use": "This email is already registered. Try logging in.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/weak-password": "Password is too weak. Follow the requirements below.",
    "auth/user-not-found": "No account found for this email.",
    "auth/wrong-password": "Incorrect password.",
    "auth/invalid-credential": "Invalid email or password.",
    "auth/too-many-requests": "Too many attempts. Wait a moment and try again.",
    "auth/network-request-failed": "Network error. Check your connection.",
    "auth/missing-email": "Enter your email address.",
    "auth/unauthorized-continue-uri":
      "This app URL is not in Firebase Authorized domains. Add the host you use in the browser (e.g. 127.0.0.1 and localhost) under Authentication → Settings → Authorized domains.",
  };
  return map[code] || error?.message || "Authentication failed. Please try again.";
}

function initFirebase() {
  if (!firebaseConfig?.apiKey) {
    console.error("[TomatoInsight] Missing TOMATO_INSIGHT_FIREBASE_CONFIG in firebase-config.js");
    return null;
  }
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  const auth = getAuth(app);

  isSupported().then((supported) => {
    if (supported) getAnalytics(app);
  });

  return auth;
}

const auth = initFirebase();

window.TomatoInsightAuth = {
  async signInWithEmail({ email, password }) {
    if (!auth) return { ok: false, error: "Firebase is not configured." };
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      return { ok: true };
    } catch (err) {
      console.error("[TomatoInsight] signIn", err);
      return { ok: false, error: authErrorMessage(err) };
    }
  },

  async signUpWithEmail(payload) {
    if (!auth) return { ok: false, error: "Firebase is not configured." };
    const { email, password, displayName, firstName, middleInitial, lastName, farmName } = payload;
    try {
      const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      if (credential.user) {
        try {
          const key = "tomatoInsight.userProfiles";
          const map = JSON.parse(localStorage.getItem(key) || "{}");
          map[credential.user.uid] = {
            firstName: firstName || "",
            middleInitial: (middleInitial || "").toString().trim().toUpperCase().slice(0, 1),
            lastName: lastName || "",
            farmName: farmName || "",
            email: email.trim(),
            updatedAt: Date.now(),
          };
          localStorage.setItem(key, JSON.stringify(map));
        } catch {
          /* ignore */
        }
      }
      if (displayName && credential.user) {
        try {
          await updateProfile(credential.user, { displayName: displayName.trim() });
        } catch (err) {
          console.warn("[TomatoInsight] Could not update display name:", err);
        }
      }
      if (credential.user) {
        try {
          const { saveUserProfile } = await import("./user-profile.service.module.js");
          const profileResult = await saveUserProfile(
            credential.user.uid,
            {
              firstName: firstName || "",
              middleInitial: middleInitial || "",
              lastName: lastName || "",
              farmName: farmName || "",
              email: email.trim(),
            },
            { updateAuthDisplayName: false }
          );
          if (!profileResult.ok) {
            return { ok: false, error: profileResult.error || "Could not save profile." };
          }
        } catch (err) {
          console.warn("[TomatoInsight] Profile save failed after account creation:", err);
        }

        if (window.TomatoInsightUserData?.whenReady) {
          Promise.race([
            window.TomatoInsightUserData.whenReady(),
            new Promise((resolve) => window.setTimeout(resolve, 8000)),
          ]).catch((err) => {
            console.warn("[TomatoInsight] Account data sync wait failed:", err);
          });
        }

        return { ok: true, warning: undefined };
      }
      return { ok: true };
    } catch (err) {
      console.error("[TomatoInsight] signUp", err);
      return { ok: false, error: authErrorMessage(err) };
    }
  },

  async updateDisplayName(displayName) {
    if (!auth?.currentUser) return { ok: false, error: "You must be signed in." };
    const trimmed = String(displayName || "").trim();
    if (!trimmed) return { ok: false, error: "Name cannot be empty." };
    try {
      await updateProfile(auth.currentUser, { displayName: trimmed });
      return { ok: true };
    } catch (err) {
      console.error("[TomatoInsight] updateDisplayName", err);
      return { ok: false, error: authErrorMessage(err) };
    }
  },

  async sendPasswordResetEmail(email) {
    if (!auth) return { ok: false, error: "Firebase is not configured." };
    const trimmed = String(email || "").trim();
    if (!trimmed) return { ok: false, error: "Enter your email address." };
    try {
      const continueUrl = new URL("login.html", window.location.href).href;
      try {
        await firebaseSendPasswordResetEmail(auth, trimmed, { url: continueUrl });
      } catch (err) {
        if (err?.code === "auth/unauthorized-continue-uri") {
          console.warn(
            "[TomatoInsight] Password reset continue URL is not allowlisted:",
            continueUrl,
            "Sending email without custom redirect. Add this host in Firebase → Authentication → Authorized domains."
          );
          await firebaseSendPasswordResetEmail(auth, trimmed);
        } else {
          throw err;
        }
      }
      return { ok: true };
    } catch (err) {
      console.error("[TomatoInsight] sendPasswordResetEmail", err);
      return { ok: false, error: authErrorMessage(err) };
    }
  },

  async signOut() {
    if (!auth) return { ok: false, error: "Firebase is not configured." };
    try {
      const uid = auth.currentUser?.uid;
      if (uid) {
        // Best-effort flush of local farm data. Never block sign-out on it.
        import("./user-data-sync.module.js")
          .then(({ flushLocalFarmToRtdb }) =>
            flushLocalFarmToRtdb(uid).catch((flushErr) => {
              console.warn("[TomatoInsight] Could not flush farm data before sign out:", flushErr);
            })
          )
          .catch((importErr) => {
            console.warn("[TomatoInsight] Could not load farm sync before sign out:", importErr);
          });
      }
      await firebaseSignOut(auth);
      window.TomatoInsightAuthSession?.markSignedOut?.();
      return { ok: true };
    } catch (err) {
      console.error("[TomatoInsight] signOut", err);
      return { ok: false, error: authErrorMessage(err) };
    }
  },

  getAuthInstance() {
    return auth;
  },
};

window.__TOMATO_INSIGHT_FIREBASE_READY__ = Boolean(auth);
window.dispatchEvent(new Event("tomatoInsight:firebaseReady"));
