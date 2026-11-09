import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  signOut as firebaseSignOut,
  sendEmailVerification,
  sendPasswordResetEmail as firebaseSendPasswordResetEmail,
  fetchSignInMethodsForEmail,
  verifyPasswordResetCode as firebaseVerifyPasswordResetCode,
  confirmPasswordReset as firebaseConfirmPasswordReset,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { getAnalytics, isSupported } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-analytics.js";

const firebaseConfig = window.TOMATO_INSIGHT_FIREBASE_CONFIG;

function isAllowedGmail(email) {
  return /^[^\s@]+@gmail\.com$/i.test(String(email || "").trim());
}

function gmailOnlyError() {
  return "Email must end with @gmail.com.";
}

function verificationActionSettings() {
  // After the Gmail link is confirmed, land on login so we can open the dashboard.
  return {
    url: new URL("login.html?verified=1", window.location.href).href,
    handleCodeInApp: false,
  };
}

function authErrorMessage(error) {
  const code = error?.code || "";
  const map = {
    "auth/email-already-in-use": "This email is already registered. Try logging in.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/weak-password": "Password is too weak. Follow the requirements below.",
    "auth/password-does-not-meet-requirements":
      "Password must be at least 8 characters and include uppercase, lowercase, and a special character.",
    "auth/user-not-found": "This email is not registered.",
    "auth/wrong-password": "Incorrect password.",
    "auth/invalid-credential": "Invalid email or password.",
    "auth/too-many-requests": "Too many attempts. Wait a moment and try again.",
    "auth/network-request-failed": "Network error. Check your connection.",
    "auth/missing-email": "Enter your email address.",
    "auth/popup-closed-by-user": "Google sign-in was cancelled.",
    "auth/popup-blocked": "Allow pop-ups for this site to continue with Google.",
    "auth/cancelled-popup-request": "Google sign-in was cancelled.",
    "auth/account-exists-with-different-credential":
      "An account already exists with this email using a different sign-in method.",
    "auth/operation-not-allowed":
      "Google sign-in is not enabled yet. Turn on Google in Firebase Authentication → Sign-in method.",
    "auth/unauthorized-continue-uri":
      "This app URL is not in Firebase Authorized domains. Add the host you use in the browser (e.g. 127.0.0.1 and localhost) under Authentication → Settings → Authorized domains.",
    "auth/expired-action-code": "This reset link has expired. Request a new reset email.",
    "auth/invalid-action-code": "This reset link is invalid or already used. Request a new reset email.",
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

function readRememberPreference() {
  return window.TomatoInsightAuthSession?.readRememberPreference?.() ?? true;
}

/** Keep Firebase persistence aligned with the Remember me preference on every load. */
async function applyRememberPersistence(remember = readRememberPreference()) {
  if (!auth) return { ok: false, error: "Firebase is not configured." };
  try {
    await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
    return { ok: true };
  } catch (err) {
    console.warn("[TomatoInsight] setPersistence", err);
    return { ok: false, error: authErrorMessage(err) };
  }
}

if (auth) {
  applyRememberPersistence().catch((err) => {
    console.warn("[TomatoInsight] Could not apply Remember me persistence on boot:", err);
  });
}

window.TomatoInsightAuth = {
  async setRememberSession(remember) {
    const prefer = Boolean(remember);
    window.TomatoInsightAuthSession?.writeRememberPreference?.(prefer);
    return applyRememberPersistence(prefer);
  },

  async signInWithEmail({ email, password }) {
    if (!auth) return { ok: false, error: "Firebase is not configured." };
    const trimmed = String(email || "").trim();
    if (!isAllowedGmail(trimmed)) return { ok: false, error: gmailOnlyError() };
    try {
      const credential = await signInWithEmailAndPassword(auth, trimmed, password);
      if (credential.user && !credential.user.emailVerified) {
        try {
          await sendEmailVerification(credential.user, verificationActionSettings());
        } catch (err) {
          console.warn("[TomatoInsight] Could not resend verification on sign-in:", err);
        }
        await firebaseSignOut(auth);
        window.TomatoInsightAuthSession?.markSignedOut?.();
        return {
          ok: false,
          needsVerification: true,
          email: trimmed,
          error: "Verify your email before signing in. We sent a new link to your inbox.",
        };
      }
      return { ok: true };
    } catch (err) {
      console.error("[TomatoInsight] signIn", err);
      return { ok: false, error: authErrorMessage(err) };
    }
  },

  async signInWithGoogle() {
    if (!auth) return { ok: false, error: "Firebase is not configured." };
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await signInWithPopup(auth, provider);
      const signedEmail = result?.user?.email || "";
      if (!isAllowedGmail(signedEmail)) {
        await firebaseSignOut(auth);
        return { ok: false, error: gmailOnlyError() };
      }
      if (result.user && !result.user.emailVerified) {
        await firebaseSignOut(auth);
        window.TomatoInsightAuthSession?.markSignedOut?.();
        return {
          ok: false,
          needsVerification: true,
          email: signedEmail,
          error: "Verify your Google email before signing in.",
        };
      }
      return { ok: true };
    } catch (err) {
      console.error("[TomatoInsight] signInWithGoogle", err);
      return { ok: false, error: authErrorMessage(err) };
    }
  },

  async signUpWithEmail(payload) {
    if (!auth) return { ok: false, error: "Firebase is not configured." };
    const { email, password, displayName, firstName, middleInitial, lastName, farmName } = payload;
    const trimmedEmail = String(email || "").trim();
    if (!isAllowedGmail(trimmedEmail)) return { ok: false, error: gmailOnlyError() };
    try {
      const credential = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
      if (credential.user) {
        // Drop any previous account's shared farm cache before this uid writes profile/farm data.
        // (Farm keys are not uid-scoped; without this, a second signup could inherit the first farm.)
        try {
          const { clearLocalUserFarmData } = await import("./user-data-sync.module.js");
          clearLocalUserFarmData({ keepActiveUid: true });
        } catch (err) {
          console.warn("[TomatoInsight] Could not reset local farm cache after sign-up:", err);
        }
        try {
          const key = "tomatoInsight.userProfiles";
          const map = JSON.parse(localStorage.getItem(key) || "{}");
          map[credential.user.uid] = {
            firstName: firstName || "",
            middleInitial: (middleInitial || "").toString().trim().toUpperCase().slice(0, 1),
            lastName: lastName || "",
            farmName: farmName || "",
            email: trimmedEmail,
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
              email: trimmedEmail,
            },
            { updateAuthDisplayName: false }
          );
          if (!profileResult.ok) {
            return { ok: false, error: profileResult.error || "Could not save profile." };
          }
        } catch (err) {
          console.warn("[TomatoInsight] Profile save failed after account creation:", err);
        }

        try {
          await sendEmailVerification(credential.user, verificationActionSettings());
        } catch (err) {
          console.error("[TomatoInsight] sendEmailVerification", err);
          await firebaseSignOut(auth);
          window.TomatoInsightAuthSession?.markSignedOut?.();
          return {
            ok: false,
            error:
              authErrorMessage(err) ||
              "Account was created, but the verification email could not be sent. Try signing in to resend it.",
          };
        }

        // Stay signed out of the app until the Gmail address is verified.
        await firebaseSignOut(auth);
        window.TomatoInsightAuthSession?.markSignedOut?.();

        return { ok: true, needsVerification: true, email: trimmedEmail };
      }
      return { ok: true };
    } catch (err) {
      console.error("[TomatoInsight] signUp", err);
      return { ok: false, error: authErrorMessage(err) };
    }
  },

  async resendVerificationEmail({ email, password }) {
    if (!auth) return { ok: false, error: "Firebase is not configured." };
    const trimmed = String(email || "").trim();
    if (!isAllowedGmail(trimmed)) return { ok: false, error: gmailOnlyError() };
    if (!password) return { ok: false, error: "Enter your password to resend the verification email." };
    try {
      const credential = await signInWithEmailAndPassword(auth, trimmed, password);
      await credential.user?.reload?.();
      if (credential.user?.emailVerified) {
        // Keep the session so the guest auth page can open the dashboard.
        window.TomatoInsightAuthSession?.markSignedIn?.();
        return { ok: true, alreadyVerified: true, email: trimmed };
      }
      await sendEmailVerification(credential.user, verificationActionSettings());
      // Stay signed in on the verify page so polling can reload() without sign-in/out races.
      return { ok: true, email: trimmed };
    } catch (err) {
      console.error("[TomatoInsight] resendVerificationEmail", err);
      return { ok: false, error: authErrorMessage(err) };
    }
  },

  /**
   * Ensure a session for this Gmail and report verification.
   * Keeps the unverified session alive for reload-only polling (no sign-out),
   * which prevents dashboard ↔ login bounce loops.
   */
  async checkEmailVerified({ email, password }) {
    if (!auth) return { ok: false, error: "Firebase is not configured." };
    if (window.__tomatoInsightVerifyRedirecting) {
      return { ok: true, verified: true, email: String(email || "").trim() };
    }
    const trimmed = String(email || "").trim();
    if (!isAllowedGmail(trimmed)) return { ok: false, error: gmailOnlyError() };
    if (!password) return { ok: false, error: "Enter your password." };
    try {
      const current = auth.currentUser;
      if (current && String(current.email || "").toLowerCase() === trimmed.toLowerCase()) {
        await current.reload();
        if (current.emailVerified) {
          window.TomatoInsightAuthSession?.markSignedIn?.();
          return { ok: true, verified: true, email: trimmed };
        }
        return { ok: true, verified: false, email: trimmed };
      }

      const credential = await signInWithEmailAndPassword(auth, trimmed, password);
      await credential.user?.reload?.();
      if (credential.user?.emailVerified) {
        window.TomatoInsightAuthSession?.markSignedIn?.();
        return { ok: true, verified: true, email: trimmed };
      }
      // Do not sign out — later polls only reload this same session.
      return { ok: true, verified: false, email: trimmed };
    } catch (err) {
      console.error("[TomatoInsight] checkEmailVerified", err);
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
    if (!isAllowedGmail(trimmed)) return { ok: false, error: gmailOnlyError() };
    try {
      const methods = await fetchSignInMethodsForEmail(auth, trimmed);
      if (!methods.length) {
        return { ok: false, error: "This email is not registered." };
      }
      const resetPageUrl = new URL("reset-password.html", window.location.href).href;
      const actionCodeSettings = {
        url: resetPageUrl,
        handleCodeInApp: true,
      };
      try {
        await firebaseSendPasswordResetEmail(auth, trimmed, actionCodeSettings);
      } catch (err) {
        if (err?.code === "auth/unauthorized-continue-uri") {
          console.warn(
            "[TomatoInsight] Password reset URL is not allowlisted:",
            resetPageUrl,
            "Sending email without custom handler. Add this host in Firebase → Authentication → Authorized domains."
          );
          await firebaseSendPasswordResetEmail(auth, trimmed);
        } else {
          throw err;
        }
      }
      return { ok: true };
    } catch (err) {
      console.error("[TomatoInsight] sendPasswordResetEmail", err);
      if (err?.code === "auth/user-not-found") {
        return { ok: false, error: "This email is not registered." };
      }
      return { ok: false, error: authErrorMessage(err) };
    }
  },

  async verifyPasswordResetCode(oobCode) {
    if (!auth) return { ok: false, error: "Firebase is not configured." };
    const code = String(oobCode || "").trim();
    if (!code) return { ok: false, error: "Missing reset code." };
    try {
      const email = await firebaseVerifyPasswordResetCode(auth, code);
      return { ok: true, email };
    } catch (err) {
      console.error("[TomatoInsight] verifyPasswordResetCode", err);
      return { ok: false, error: authErrorMessage(err) };
    }
  },

  async confirmPasswordReset(oobCode, newPassword) {
    if (!auth) return { ok: false, error: "Firebase is not configured." };
    const code = String(oobCode || "").trim();
    if (!code) return { ok: false, error: "Missing reset code." };
    try {
      await firebaseConfirmPasswordReset(auth, code, newPassword);
      return { ok: true };
    } catch (err) {
      console.error("[TomatoInsight] confirmPasswordReset", err);
      return { ok: false, error: authErrorMessage(err) };
    }
  },

  async signOut() {
    if (!auth) return { ok: false, error: "Firebase is not configured." };
    try {
      // Snapshot + flush happen in bindUserDataSync onAuthStateChanged(null).
      // Do not flush again here after localStorage is cleared — that wiped cloud tiles/layout.
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
