(function () {
  function showFormError(el, message) {
    if (!el) return;
    if (!message) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.textContent = message;
    el.hidden = false;
  }

  function isValidEmail(value) {
    const email = String(value || "").trim();
    // Only Gmail addresses are accepted for TomatoInsight accounts.
    return /^[^\s@]+@gmail\.com$/i.test(email);
  }

  function emailValidationError(value) {
    const email = String(value || "").trim();
    if (!email) return "Enter your email address.";
    if (!isValidEmail(email)) return "Email must end with @gmail.com.";
    return "";
  }

  function getPasswordResetActionFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get("mode");
    const oobCode = params.get("oobCode");
    if (mode === "resetPassword" && oobCode) {
      return { oobCode };
    }
    return null;
  }

  function loginRedirectTarget() {
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next");
    const pathOnly = (next || "").split(/[?#]/)[0];
    return next &&
      next.startsWith("/") &&
      !next.startsWith("//") &&
      pathOnly !== "/" &&
      pathOnly !== "/landing.html" &&
      pathOnly.endsWith(".html")
      ? next
      : "index.html";
  }

  function readRememberPreference() {
    return window.TomatoInsightAuthSession?.readRememberPreference?.() ?? true;
  }

  function writeRememberPreference(remember) {
    window.TomatoInsightAuthSession?.writeRememberPreference?.(remember);
  }

  async function finishSuccessfulLogin(remember) {
    window.TomatoInsightAuthSession?.markSignedIn?.(remember);
    window.location.href = loginRedirectTarget();
  }

  function initLoginForm() {
    const form = document.getElementById("login-form");
    if (!form) return;

    const errorEl = document.getElementById("login-form-error");
    const successEl = document.getElementById("login-form-success");
    const submitBtn = form.querySelector('button[type="submit"]');
    const rememberEl = document.getElementById("login-remember");
    const googleBtn = document.getElementById("login-google-btn");

    if (rememberEl) rememberEl.checked = readRememberPreference();

    const params = new URLSearchParams(window.location.search);
    if (params.get("reset") === "success") {
      showFormSuccess(successEl, "Your password was updated. Log in with your new password.");
    }
    if (params.get("verified") === "1") {
      showFormSuccess(successEl, "Email verified. Opening your farm dashboard…");
      const pendingEmail =
        form.email.value.trim() ||
        (() => {
          try {
            return sessionStorage.getItem("tomatoInsight.pendingVerifyEmail") || "";
          } catch {
            return "";
          }
        })();
      const pendingPassword = readPendingVerifyPassword();
      if (pendingEmail && pendingPassword && !emailValidationError(pendingEmail)) {
        form.email.value = pendingEmail;
        submitBtn.disabled = true;
        if (googleBtn) googleBtn.disabled = true;
        (async () => {
          try {
            const remember = Boolean(rememberEl?.checked ?? true);
            writeRememberPreference(remember);
            await window.TomatoInsightAuth?.setRememberSession?.(remember);
            const result = await window.TomatoInsightAuth.signInWithEmail({
              email: pendingEmail,
              password: pendingPassword,
            });
            if (result.ok) {
              await openDashboardAfterVerified(remember);
              return;
            }
            showFormSuccess(
              successEl,
              "Email verified. Sign in below to open your farm dashboard."
            );
            if (result.needsVerification) {
              openVerifyPanel({
                email: result.email || pendingEmail,
                password: pendingPassword,
                message: result.error,
              });
            } else if (result.error) {
              showFormError(errorEl, result.error);
            }
          } finally {
            submitBtn.disabled = false;
            if (googleBtn) googleBtn.disabled = false;
          }
        })();
      } else {
        showFormSuccess(
          successEl,
          "Email verified. Sign in below to open your farm dashboard."
        );
      }
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      showFormError(errorEl, null);
      showFormSuccess(successEl, null);

      const email = form.email.value.trim();
      const password = form.password.value;
      const remember = Boolean(rememberEl?.checked);
      writeRememberPreference(remember);

      if (!email || !password) {
        showFormError(errorEl, "Enter your email and password.");
        return;
      }
      const emailError = emailValidationError(email);
      if (emailError) {
        showFormError(errorEl, emailError);
        form.email.setAttribute("aria-invalid", "true");
        return;
      }
      form.email.removeAttribute("aria-invalid");

      submitBtn.disabled = true;
      if (googleBtn) googleBtn.disabled = true;
      try {
        const persist = await window.TomatoInsightAuth?.setRememberSession?.(remember);
        if (persist && persist.ok === false) {
          showFormError(errorEl, persist.error || "Could not apply Remember me. Try again.");
          return;
        }
        const result = await window.TomatoInsightAuth.signInWithEmail({ email, password });
        if (result.ok) {
          await finishSuccessfulLogin(remember);
          return;
        }
        if (result.needsVerification) {
          writePendingSignup({
            status: "awaiting_verification",
            email: result.email || email,
            password,
          });
          openVerifyPanel({
            email: result.email || email,
            password,
            status: "awaiting_verification",
            message: result.error,
          });
          return;
        }
        showFormError(errorEl, result.error || "Sign in failed.");
      } finally {
        submitBtn.disabled = false;
        if (googleBtn) googleBtn.disabled = false;
      }
    });

    googleBtn?.addEventListener("click", async () => {
      showFormError(errorEl, null);
      showFormSuccess(successEl, null);
      const remember = Boolean(rememberEl?.checked);
      writeRememberPreference(remember);
      googleBtn.disabled = true;
      if (submitBtn) submitBtn.disabled = true;
      try {
        if (!window.TomatoInsightAuth?.signInWithGoogle) {
          showFormError(errorEl, "Google sign-in is not available yet.");
          return;
        }
        const persist = await window.TomatoInsightAuth?.setRememberSession?.(remember);
        if (persist && persist.ok === false) {
          showFormError(errorEl, persist.error || "Could not apply Remember me. Try again.");
          return;
        }
        const result = await window.TomatoInsightAuth.signInWithGoogle();
        if (result.ok) {
          await finishSuccessfulLogin(remember);
          return;
        }
        if (result.needsVerification) {
          openVerifyPanel({
            email: result.email || "",
            status: "awaiting_verification",
            message: result.error,
          });
          return;
        }
        showFormError(errorEl, result.error || "Google sign-in failed.");
      } finally {
        googleBtn.disabled = false;
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  let pendingVerifyPassword = "";
  /** Seconds before the user can resend a verification email. */
  const VERIFY_RESEND_COOLDOWN_SEC = 60;
  const VERIFY_RESEND_UNTIL_KEY = "tomatoInsight.verifyResendUntil";
  const VERIFY_PENDING_PASSWORD_KEY = "tomatoInsight.pendingVerifyPassword";
  /** Survives refresh + leave-to-home until Gmail verification succeeds. */
  const PENDING_SIGNUP_KEY = "tomatoInsight.pendingSignup";
  let verifyResendTimer = null;
  let verifyPollTimer = null;
  let verifyPollInFlight = false;
  let verifyRedirecting = false;
  let signupLeaveGuardBound = false;

  function storePendingVerifyPassword(password) {
    const value = String(password || "");
    pendingVerifyPassword = value;
    try {
      if (value) sessionStorage.setItem(VERIFY_PENDING_PASSWORD_KEY, value);
      else sessionStorage.removeItem(VERIFY_PENDING_PASSWORD_KEY);
    } catch {
      /* ignore */
    }
  }

  function readPendingVerifyPassword() {
    if (pendingVerifyPassword) return pendingVerifyPassword;
    try {
      const fromSession = sessionStorage.getItem(VERIFY_PENDING_PASSWORD_KEY) || "";
      if (fromSession) return fromSession;
    } catch {
      /* ignore */
    }
    return String(readPendingSignup()?.password || "");
  }

  function readPendingSignup() {
    try {
      const raw = localStorage.getItem(PENDING_SIGNUP_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data?.email || !data?.password) return null;
      if (data.status !== "creating" && data.status !== "awaiting_verification") return null;
      const ageMs = Date.now() - Number(data.startedAt || 0);
      if (Number.isFinite(ageMs) && ageMs > 7 * 24 * 60 * 60 * 1000) {
        clearPendingVerifySecrets();
        return null;
      }
      return data;
    } catch {
      return null;
    }
  }

  function writePendingSignup(patch) {
    const prev = readPendingSignup() || {};
    const next = {
      ...prev,
      ...patch,
      updatedAt: Date.now(),
      startedAt: prev.startedAt || Date.now(),
    };
    try {
      localStorage.setItem(PENDING_SIGNUP_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    if (next.email) {
      try {
        sessionStorage.setItem("tomatoInsight.pendingVerifyEmail", next.email);
      } catch {
        /* ignore */
      }
    }
    if (next.password) storePendingVerifyPassword(next.password);
  }

  function clearPendingVerifySecrets() {
    pendingVerifyPassword = "";
    try {
      sessionStorage.removeItem(VERIFY_PENDING_PASSWORD_KEY);
      sessionStorage.removeItem("tomatoInsight.pendingVerifyEmail");
      sessionStorage.removeItem(VERIFY_RESEND_UNTIL_KEY);
      localStorage.removeItem(PENDING_SIGNUP_KEY);
    } catch {
      /* ignore */
    }
  }

  function signupLeaveGuard(event) {
    event.preventDefault();
    event.returnValue = "";
  }

  function setSignupLeaveGuard(enabled) {
    if (enabled && !signupLeaveGuardBound) {
      window.addEventListener("beforeunload", signupLeaveGuard);
      signupLeaveGuardBound = true;
    } else if (!enabled && signupLeaveGuardBound) {
      window.removeEventListener("beforeunload", signupLeaveGuard);
      signupLeaveGuardBound = false;
    }
  }

  function setSignupLock(visible, message) {
    let lock = document.getElementById("auth-signup-lock");
    if (!lock) {
      lock = document.createElement("div");
      lock.id = "auth-signup-lock";
      lock.className = "auth-signup-lock";
      lock.hidden = true;
      lock.innerHTML =
        '<div class="auth-signup-lock__card" role="status" aria-live="polite">' +
        '<div class="auth-verify__spinner" aria-hidden="true"></div>' +
        '<p class="auth-signup-lock__title">Setting up your account</p>' +
        '<p class="auth-signup-lock__text" id="auth-signup-lock-text"></p>' +
        "</div>";
      document.body.appendChild(lock);
    }
    const textEl = document.getElementById("auth-signup-lock-text");
    if (textEl && message) textEl.textContent = message;
    lock.hidden = !visible;
    document.documentElement.classList.toggle("auth-signup-locked", Boolean(visible));
  }

  async function openDashboardAfterVerified(remember = true) {
    if (verifyRedirecting) return;
    verifyRedirecting = true;
    window.__tomatoInsightVerifyRedirecting = true;
    stopVerifyStatusPolling();
    setSignupLeaveGuard(false);
    setSignupLock(true, "Email verified. Opening your farm dashboard…");
    clearPendingVerifySecrets();
    writeRememberPreference(remember);
    try {
      await window.TomatoInsightAuth?.setRememberSession?.(remember);
    } catch {
      /* ignore */
    }
    window.TomatoInsightAuthSession?.markSignedIn?.(remember);
    // Replace so Back does not return to the verify/signup loop.
    window.location.replace("index.html");
  }

  function readVerifyResendUntil() {
    try {
      const raw = Number(sessionStorage.getItem(VERIFY_RESEND_UNTIL_KEY) || 0);
      return Number.isFinite(raw) ? raw : 0;
    } catch {
      return 0;
    }
  }

  function writeVerifyResendUntil(untilMs) {
    try {
      sessionStorage.setItem(VERIFY_RESEND_UNTIL_KEY, String(untilMs));
    } catch {
      /* ignore */
    }
  }

  function startVerifyResendCooldown(seconds = VERIFY_RESEND_COOLDOWN_SEC) {
    writeVerifyResendUntil(Date.now() + Math.max(1, Number(seconds) || VERIFY_RESEND_COOLDOWN_SEC) * 1000);
    syncVerifyResendButton();
  }

  function syncVerifyResendButton() {
    const resendBtn = document.getElementById("verify-resend-btn");
    if (!resendBtn) return;
    if (verifyResendTimer) {
      clearInterval(verifyResendTimer);
      verifyResendTimer = null;
    }

    const tick = () => {
      const remainingMs = readVerifyResendUntil() - Date.now();
      const remainingSec = Math.ceil(remainingMs / 1000);
      if (remainingSec > 0) {
        resendBtn.disabled = true;
        resendBtn.textContent = `Resend in ${remainingSec}s`;
        return true;
      }
      resendBtn.disabled = false;
      resendBtn.textContent = "Resend verification email";
      if (verifyResendTimer) {
        clearInterval(verifyResendTimer);
        verifyResendTimer = null;
      }
      return false;
    };

    if (tick()) {
      verifyResendTimer = window.setInterval(tick, 250);
    }
  }

  function openVerifyPanel({ email, password, message, startCooldown = true, status = "awaiting_verification" }) {
    const emailEl = document.getElementById("verify-email-address");
    const successEl = document.getElementById("verify-form-success");
    const errorEl = document.getElementById("verify-form-error");
    const passwordWrap = document.getElementById("verify-password-wrap");
    const passwordInput = document.getElementById("verify-password");

    if (emailEl) emailEl.textContent = email || "your Gmail";
    storePendingVerifyPassword(password || "");
    if (email || password) {
      writePendingSignup({
        email: email || readPendingSignup()?.email || "",
        password: password || readPendingVerifyPassword(),
        status,
      });
    }
    if (passwordWrap) passwordWrap.hidden = Boolean(readPendingVerifyPassword());
    if (passwordInput && !readPendingVerifyPassword()) passwordInput.value = "";
    showFormError(errorEl, null);
    showFormSuccess(successEl, message || "Account created. Confirm the link in your inbox to finish.");
    if (email) {
      try {
        sessionStorage.setItem("tomatoInsight.pendingVerifyEmail", email);
      } catch {
        /* ignore */
      }
    }
    if (startCooldown) startVerifyResendCooldown();
    else syncVerifyResendButton();
    startVerifyStatusPolling();
    window.TomatoInsightAuthUi?.showPanel?.("verify");
    window.requestAnimationFrame(() => window.TomatoInsightAuthUi?.fitStage?.("verify"));
  }

  async function resumePendingSignup() {
    const pending = readPendingSignup();
    if (!pending) return;

    storePendingVerifyPassword(pending.password);
    try {
      sessionStorage.setItem("tomatoInsight.pendingVerifyEmail", pending.email);
    } catch {
      /* ignore */
    }

    const creating = pending.status === "creating";
    openVerifyPanel({
      email: pending.email,
      password: pending.password,
      startCooldown: !creating,
      status: pending.status,
      message: creating
        ? "Finishing account setup… Keep this tab open until verification is ready."
        : "Waiting for email verification. Open the Gmail link we sent, then this page will continue automatically.",
    });

    if (!creating) {
      setSignupLock(false);
      startVerifyStatusPolling();
      return;
    }

    setSignupLeaveGuard(true);
    setSignupLock(true, "Creating your account… Please wait until verification is ready.");
    try {
      const check = await window.TomatoInsightAuth?.checkEmailVerified?.({
        email: pending.email,
        password: pending.password,
      });
      if (check?.ok && check.verified) {
        await openDashboardAfterVerified(true);
        return;
      }
      if (check?.ok && !check.verified) {
        writePendingSignup({ status: "awaiting_verification" });
        setSignupLeaveGuard(false);
        const resent = await window.TomatoInsightAuth?.resendVerificationEmail?.({
          email: pending.email,
          password: pending.password,
        });
        if (resent?.ok && resent.alreadyVerified) {
          await openDashboardAfterVerified(true);
          return;
        }
        openVerifyPanel({
          email: pending.email,
          password: pending.password,
          status: "awaiting_verification",
          message:
            "Account is ready. Check your Gmail and open the verification link — we will open your dashboard when it is confirmed.",
        });
        setSignupLock(false);
        startVerifyStatusPolling();
        return;
      }

      // Create never finished (or credentials unavailable) — clear and let them retry.
      setSignupLeaveGuard(false);
      setSignupLock(false);
      clearPendingVerifySecrets();
      window.TomatoInsightAuthUi?.showPanel?.("signup");
      showFormError(
        document.getElementById("signup-form-error"),
        check?.error || "Account setup was interrupted. Create your account again."
      );
    } catch (err) {
      setSignupLeaveGuard(false);
      setSignupLock(false);
      writePendingSignup({ status: "awaiting_verification" });
      openVerifyPanel({
        email: pending.email,
        password: pending.password,
        status: "awaiting_verification",
        message:
          "Still waiting for email verification. Stay on this page or return here after opening the Gmail link.",
      });
      startVerifyStatusPolling();
      console.warn("[TomatoInsight] resumePendingSignup", err);
    }
  }

  function stopVerifyStatusPolling() {
    if (verifyPollTimer) {
      clearInterval(verifyPollTimer);
      verifyPollTimer = null;
    }
  }

  async function cancelEmailVerification({ goHome = false } = {}) {
    if (verifyRedirecting) return;
    stopVerifyStatusPolling();
    setSignupLeaveGuard(false);
    setSignupLock(false);
    clearPendingVerifySecrets();
    try {
      await window.TomatoInsightAuth?.signOut?.();
    } catch {
      /* ignore */
    }
    window.TomatoInsightAuthSession?.markSignedOut?.();
    if (goHome) {
      window.location.href = "landing.html";
      return;
    }
    showFormError(document.getElementById("verify-form-error"), null);
    showFormSuccess(
      document.getElementById("login-form-success"),
      "Verification cancelled. Sign in after you confirm your Gmail, or create a different account."
    );
    window.TomatoInsightAuthUi?.showPanel?.("login");
    window.requestAnimationFrame(() => window.TomatoInsightAuthUi?.fitStage?.("login"));
  }

  function startVerifyStatusPolling() {
    stopVerifyStatusPolling();
    if (verifyRedirecting) return;
    const poll = async () => {
      if (verifyRedirecting || verifyPollInFlight) return;
      const emailEl = document.getElementById("verify-email-address");
      const email = String(emailEl?.textContent || "").trim();
      const password = readPendingVerifyPassword();
      if (!email || !password || emailValidationError(email)) return;
      const stage = document.getElementById("auth-panel-stage");
      if (!stage?.classList.contains("is-verify")) return;
      verifyPollInFlight = true;
      try {
        const result = await window.TomatoInsightAuth?.checkEmailVerified?.({ email, password });
        if (result?.ok && result.verified) {
          stopVerifyStatusPolling();
          showFormSuccess(
            document.getElementById("verify-form-success"),
            "Email verified. Opening your farm dashboard…"
          );
          await openDashboardAfterVerified(true);
        }
      } finally {
        verifyPollInFlight = false;
      }
    };
    verifyPollTimer = window.setInterval(poll, 4000);
    poll();
  }

  function initVerifyPanel() {
    const resendBtn = document.getElementById("verify-resend-btn");
    if (!resendBtn) return;

    const errorEl = document.getElementById("verify-form-error");
    const successEl = document.getElementById("verify-form-success");
    const emailEl = document.getElementById("verify-email-address");
    const passwordInput = document.getElementById("verify-password");
    const passwordWrap = document.getElementById("verify-password-wrap");

    const params = new URLSearchParams(window.location.search);
    const pending = readPendingSignup();
    if (params.get("verify") === "1" && !pending) {
      let email = params.get("email") || "";
      if (!email) {
        try {
          email = sessionStorage.getItem("tomatoInsight.pendingVerifyEmail") || "";
        } catch {
          email = "";
        }
      }
      if (emailEl && email) emailEl.textContent = email;
      if (passwordWrap) passwordWrap.hidden = false;
      showFormSuccess(
        successEl,
        "Verify your Gmail before signing in. Open the link we sent, or resend it below."
      );
    }
    syncVerifyResendButton();
    if (
      !pending &&
      (params.get("verify") === "1" ||
        document.getElementById("auth-panel-stage")?.classList.contains("is-verify"))
    ) {
      startVerifyStatusPolling();
    }

    document.getElementById("verify-cancel-btn")?.addEventListener("click", () => {
      cancelEmailVerification({ goHome: false });
    });
    document.getElementById("verify-back-login-btn")?.addEventListener("click", (event) => {
      event.preventDefault();
      cancelEmailVerification({ goHome: false });
    });
    document.querySelector(".auth-signin__home a[href='landing.html']")?.addEventListener("click", (event) => {
      if (!readPendingSignup() && !document.getElementById("auth-panel-stage")?.classList.contains("is-verify")) {
        return;
      }
      event.preventDefault();
      cancelEmailVerification({ goHome: true });
    });

    resendBtn.addEventListener("click", async () => {
      showFormError(errorEl, null);
      if (readVerifyResendUntil() > Date.now()) {
        syncVerifyResendButton();
        showFormError(errorEl, "Please wait before requesting another verification email.");
        return;
      }
      const email = String(emailEl?.textContent || "").trim();
      const password = readPendingVerifyPassword() || String(passwordInput?.value || "");
      const emailError = emailValidationError(email);
      if (emailError) {
        showFormError(errorEl, emailError);
        return;
      }
      if (!password) {
        if (passwordWrap) passwordWrap.hidden = false;
        showFormError(errorEl, "Enter your password to resend the verification email.");
        passwordInput?.focus();
        return;
      }

      resendBtn.disabled = true;
      resendBtn.textContent = "Sending…";
      try {
        const result = await window.TomatoInsightAuth.resendVerificationEmail({ email, password });
        if (result.ok && result.alreadyVerified) {
          setSignupLock(true, "Email verified. Opening your farm dashboard…");
          showFormSuccess(successEl, "Email verified. Opening your farm dashboard…");
          await openDashboardAfterVerified(true);
          return;
        }
        if (result.ok) {
          storePendingVerifyPassword(password);
          if (passwordWrap) passwordWrap.hidden = true;
          showFormSuccess(successEl, "Verification email sent again. Check your inbox and spam folder.");
          startVerifyResendCooldown();
          startVerifyStatusPolling();
          return;
        }
        showFormError(errorEl, result.error || "Could not resend verification email.");
        syncVerifyResendButton();
      } catch (err) {
        showFormError(errorEl, err?.message || "Could not resend verification email.");
        syncVerifyResendButton();
      }
    });
  }

  function showFormSuccess(el, message) {
    if (!el) return;
    if (!message) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.textContent = message;
    el.hidden = false;
  }

  function initAuthPanels() {
    const stage = document.getElementById("auth-panel-stage");
    if (!stage || stage.dataset.panelsReady === "true") return;
    stage.dataset.panelsReady = "true";

    const card = stage.closest(".auth-split-card") || document.getElementById("auth-split-card");
    const loginPanel = document.getElementById("login-panel");
    const forgotPanel = document.getElementById("forgot-panel");
    const signupPanel = document.getElementById("signup-panel");
    const verifyPanel = document.getElementById("verify-panel");
    const loginEmail = document.getElementById("login-email");
    const forgotEmail = document.getElementById("forgot-password-email");
    const signupFirst = document.getElementById("signup-first-name");
    const titles = {
      login: "TomatoInsight — Sign in",
      forgot: "TomatoInsight — Reset password",
      signup: "TomatoInsight — Sign up",
      verify: "TomatoInsight — Verify email",
    };

    function panelFor(name) {
      if (name === "signup") return signupPanel;
      if (name === "forgot") return forgotPanel;
      if (name === "verify") return verifyPanel;
      return loginPanel;
    }

    function fitStage(name) {
      const panel = panelFor(name);
      if (!panel) return;
      stage.style.height = panel.offsetHeight + "px";
    }

    function rootCaptionsForMode(mode) {
      const slideshow = document.getElementById("auth-slideshow");
      if (!slideshow) return;
      const isSignup = mode === "signup" || mode === "verify";
      slideshow.classList.toggle("is-signup-mode", isSignup);
      slideshow.querySelectorAll(".auth-slideshow__caption--login").forEach((el) => {
        el.setAttribute("aria-hidden", isSignup ? "true" : "false");
      });
      slideshow.querySelectorAll(".auth-slideshow__caption--signup").forEach((el) => {
        el.setAttribute("aria-hidden", isSignup ? "false" : "true");
      });
    }

    let fitting = false;
    let switchTimer = 0;

    function showPanel(name) {
      const animate = stage.classList.contains("is-ready");
      if (name === "forgot" && forgotEmail && loginEmail && !forgotEmail.value.trim()) {
        forgotEmail.value = loginEmail.value.trim();
      }
      if (animate) {
        fitting = true;
        stage.style.height = stage.getBoundingClientRect().height + "px";
      }

      stage.classList.toggle("is-forgot", name === "forgot");
      stage.classList.toggle("is-signup", name === "signup");
      stage.classList.toggle("is-verify", name === "verify");
      card?.classList.toggle("is-signup", name === "signup" || name === "verify");
      card?.classList.toggle("is-forgot", name === "forgot");
      card?.classList.toggle("is-verify", name === "verify");
      card?.classList.toggle("is-switching", animate);
      if (name === "verify") startVerifyStatusPolling();
      else stopVerifyStatusPolling();
      document.documentElement.classList.remove(
        "auth-start-signup",
        "auth-start-forgot",
        "auth-start-verify"
      );
      if (loginPanel) loginPanel.inert = name !== "login";
      if (forgotPanel) forgotPanel.inert = name !== "forgot";
      if (signupPanel) signupPanel.inert = name !== "signup";
      if (verifyPanel) verifyPanel.inert = name !== "verify";
      rootCaptionsForMode(name === "signup" || name === "verify" ? "signup" : "login");
      if (titles[name]) document.title = titles[name];
      if (animate) {
        window.clearTimeout(switchTimer);
        switchTimer = window.setTimeout(() => card?.classList.remove("is-switching"), 520);
      }

      const params = new URLSearchParams(window.location.search);
      params.delete("forgot");
      params.delete("signup");
      params.delete("verify");
      if (name === "forgot") params.set("forgot", "1");
      if (name === "signup") params.set("signup", "1");
      if (name === "verify") params.set("verify", "1");
      const next = params.toString();
      window.history.replaceState(
        null,
        "",
        window.location.pathname + (next ? "?" + next : "") + window.location.hash
      );

      if (animate) {
        window.requestAnimationFrame(() => {
          fitStage(name);
          window.requestAnimationFrame(() => {
            fitting = false;
          });
        });
        const focusTarget =
          name === "signup"
            ? signupFirst
            : name === "forgot"
              ? forgotEmail
              : name === "verify"
                ? document.getElementById("verify-resend-btn")
                : loginEmail;
        window.setTimeout(() => focusTarget?.focus(), 420);
      }
    }

    window.TomatoInsightAuthUi = {
      showPanel,
      fitStage,
    };

    stage.querySelectorAll("[data-auth-panel]").forEach((el) => {
      el.addEventListener("click", (event) => {
        event.preventDefault();
        const name = el.getAttribute("data-auth-panel");
        if (name !== "signup" && name !== "forgot" && name !== "login" && name !== "verify") return;
        // Leaving verify via Login/Signup cancels the pending verification gate.
        if (readPendingSignup() && name !== "verify") {
          cancelEmailVerification({ goHome: false }).then(() => {
            if (name === "signup") window.TomatoInsightAuthUi?.showPanel?.("signup");
          });
          return;
        }
        showPanel(name);
      });
    });

    const params = new URLSearchParams(window.location.search);
    let pendingVerify = false;
    try {
      const pending = JSON.parse(localStorage.getItem(PENDING_SIGNUP_KEY) || "null");
      pendingVerify =
        Boolean(pending?.email) &&
        (pending.status === "creating" || pending.status === "awaiting_verification");
    } catch {
      pendingVerify = false;
    }
    const initial =
      params.get("verify") === "1" || pendingVerify
        ? "verify"
        : params.get("signup") === "1"
          ? "signup"
          : params.get("forgot") === "1"
            ? "forgot"
            : "login";
    showPanel(initial);

    if (window.ResizeObserver) {
      const observer = new ResizeObserver(() => {
        if (!stage.classList.contains("is-ready") || fitting) return;
        const name = stage.classList.contains("is-verify")
          ? "verify"
          : stage.classList.contains("is-signup")
            ? "signup"
            : stage.classList.contains("is-forgot")
              ? "forgot"
              : "login";
        fitStage(name);
      });
      [loginPanel, forgotPanel, signupPanel, verifyPanel].forEach((panel) => {
        if (panel) observer.observe(panel);
      });
    }

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        fitStage(initial);
        stage.classList.add("is-ready");
        card?.classList.add("is-ready");
      });
    });
  }

  function initForgotPasswordForm() {
    const form = document.getElementById("forgot-password-form");
    if (!form) return;

    const errorEl = document.getElementById("forgot-password-form-error");
    const successEl = document.getElementById("forgot-password-form-success");
    const submitBtn = form.querySelector('button[type="submit"]');
    const loginEmail = new URLSearchParams(window.location.search).get("email");

    if (loginEmail && form.email) {
      form.email.value = loginEmail;
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      showFormError(errorEl, null);
      showFormSuccess(successEl, null);

      const email = form.email.value.trim();

      const forgotEmailError = emailValidationError(email);
      if (forgotEmailError) {
        showFormError(errorEl, forgotEmailError);
        form.email.setAttribute("aria-invalid", "true");
        return;
      }
      form.email.removeAttribute("aria-invalid");

      submitBtn.disabled = true;
      try {
        const result = await window.TomatoInsightAuth.sendPasswordResetEmail(email);
        if (result.ok) {
          showFormSuccess(
            successEl,
            "Password reset link sent. Check your inbox and spam folder."
          );
          form.email.value = "";
          return;
        }
        showFormError(errorEl, result.error || "Could not send reset email.");
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  function initResetPasswordForm() {
    const form = document.getElementById("reset-password-form");
    if (!form) return;

    const errorEl = document.getElementById("reset-password-form-error");
    const subtitleEl = document.getElementById("reset-password-subtitle");
    const submitBtn = form.querySelector('button[type="submit"]');
    const passwordInput = form.password;
    const rulesList = document.getElementById("reset-password-rules");
    const resetAction = getPasswordResetActionFromUrl();

    window.TomatoInsightAuthPassword?.bindPasswordRules?.(passwordInput, rulesList);

    function setFormDisabled(disabled) {
      submitBtn.disabled = disabled;
      passwordInput.disabled = disabled;
      form.confirmPassword.disabled = disabled;
    }

    if (!resetAction) {
      setFormDisabled(true);
      showFormError(
        errorEl,
        "This reset link is invalid. Request a new email from the forgot password page."
      );
      return;
    }

    setFormDisabled(true);
    window.TomatoInsightAuth.verifyPasswordResetCode(resetAction.oobCode).then((verified) => {
      if (!verified.ok) {
        showFormError(errorEl, verified.error || "This reset link is invalid or expired.");
        return;
      }
      setFormDisabled(false);
      if (subtitleEl && verified.email) {
        subtitleEl.textContent = `Set a new password for ${verified.email}. It must meet the same requirements as when you signed up.`;
      }
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      showFormError(errorEl, null);

      const password = form.password.value;
      const confirmPassword = form.confirmPassword.value;

      const passwordError = window.TomatoInsightAuthPassword?.passwordValidationError?.(password);
      if (passwordError) {
        showFormError(errorEl, passwordError);
        passwordInput.setAttribute("aria-invalid", "true");
        window.TomatoInsightAuthPassword?.updatePasswordRulesUI?.(password, rulesList, true);
        return;
      }
      passwordInput.removeAttribute("aria-invalid");

      if (password !== confirmPassword) {
        showFormError(errorEl, "Passwords do not match.");
        form.confirmPassword.setAttribute("aria-invalid", "true");
        return;
      }
      form.confirmPassword.removeAttribute("aria-invalid");

      setFormDisabled(true);
      try {
        const result = await window.TomatoInsightAuth.confirmPasswordReset(resetAction.oobCode, password);
        if (result.ok) {
          window.location.href = "login.html?reset=success";
          return;
        }
        showFormError(errorEl, result.error || "Could not update password.");
      } finally {
        setFormDisabled(false);
      }
    });
  }

  function initSignupForm() {
    const form = document.getElementById("signup-form");
    if (!form) return;

    const errorEl = document.getElementById("signup-form-error");
    const submitBtn = form.querySelector('button[type="submit"]');
    const passwordInput = form.password;
    const rulesList = document.getElementById("password-rules");

    window.TomatoInsightAuthPassword?.bindPasswordRules?.(passwordInput, rulesList);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      showFormError(errorEl, null);

      const firstName = form.firstName.value.trim();
      const middleInitial = form.middleInitial.value.trim().toUpperCase();
      const lastName = form.lastName.value.trim();
      const email = form.email.value.trim();
      const password = form.password.value;
      const confirmPassword = form.confirmPassword.value;

      if (!firstName || !lastName) {
        showFormError(errorEl, "First name and last name are required.");
        return;
      }
      if (middleInitial && !/^[A-Z]$/.test(middleInitial)) {
        showFormError(errorEl, "Middle initial must be a single letter.");
        form.middleInitial.setAttribute("aria-invalid", "true");
        return;
      }
      form.middleInitial.removeAttribute("aria-invalid");

      const signupEmailError = emailValidationError(email);
      if (signupEmailError) {
        showFormError(errorEl, signupEmailError);
        form.email.setAttribute("aria-invalid", "true");
        return;
      }
      form.email.removeAttribute("aria-invalid");

      const passwordError = window.TomatoInsightAuthPassword?.passwordValidationError?.(password);
      if (passwordError) {
        showFormError(errorEl, passwordError);
        passwordInput.setAttribute("aria-invalid", "true");
        window.TomatoInsightAuthPassword?.updatePasswordRulesUI?.(password, rulesList, true);
        return;
      }
      passwordInput.removeAttribute("aria-invalid");

      if (password !== confirmPassword) {
        showFormError(errorEl, "Passwords do not match.");
        form.confirmPassword.setAttribute("aria-invalid", "true");
        return;
      }
      form.confirmPassword.removeAttribute("aria-invalid");

      submitBtn.disabled = true;
      const originalLabel = submitBtn.textContent;
      submitBtn.textContent = "Creating account…";
      writePendingSignup({
        status: "creating",
        email,
        password,
        firstName,
        middleInitial: middleInitial || "",
        lastName,
      });
      setSignupLeaveGuard(true);
      setSignupLock(true, "Creating your account… Stay on this page until verification is ready.");
      try {
        const result = await window.TomatoInsightAuth.signUpWithEmail({
          firstName,
          middleInitial: middleInitial || null,
          lastName,
          email,
          password,
          farmName: "",
          displayName: [firstName, middleInitial, lastName].filter(Boolean).join(" "),
        });
        if (result.ok && result.needsVerification) {
          writePendingSignup({ status: "awaiting_verification", email: result.email || email, password });
          setSignupLeaveGuard(false);
          setSignupLock(false);
          openVerifyPanel({
            email: result.email || email,
            password,
            status: "awaiting_verification",
            message: "Account created. Check your Gmail and open the verification link before signing in.",
          });
          form.reset();
          return;
        }
        if (result.ok) {
          writePendingSignup({ status: "awaiting_verification", email, password });
          setSignupLeaveGuard(false);
          setSignupLock(false);
          openVerifyPanel({
            email,
            password,
            status: "awaiting_verification",
            message: "Account created. Verify your email before signing in.",
          });
          return;
        }
        const alreadyRegistered =
          result.code === "auth/email-already-in-use" ||
          /already registered|already in use|email-already-in-use/i.test(result.error || "");
        if (alreadyRegistered) {
          setSignupLeaveGuard(false);
          setSignupLock(false);
          clearPendingVerifySecrets();
          form.email.setAttribute("aria-invalid", "true");
          showFormError(
            errorEl,
            "This email is already registered. Sign in instead, or use Forgot password if you cannot access it."
          );
          form.email.focus();
          return;
        }
        setSignupLeaveGuard(false);
        setSignupLock(false);
        clearPendingVerifySecrets();
        showFormError(errorEl, result.error || "Sign up failed.");
      } catch (err) {
        // Keep pending state so refresh/resume can finish verification if Firebase already created the user.
        writePendingSignup({ status: "awaiting_verification", email, password });
        setSignupLeaveGuard(false);
        setSignupLock(false);
        openVerifyPanel({
          email,
          password,
          status: "awaiting_verification",
          message:
            err?.message ||
            "Connection interrupted while creating the account. If a verification email arrived, open it — we will keep waiting here.",
        });
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel;
      }
    });
  }

  function bootAuthForms() {
    initLoginForm();
    initForgotPasswordForm();
    initResetPasswordForm();
    initSignupForm();
    initVerifyPanel();
    resumePendingSignup();
  }

  let authFormsBooted = false;

  function tryBootAuthForms() {
    if (authFormsBooted || !window.TomatoInsightAuth) return;
    authFormsBooted = true;
    bootAuthForms();
  }

  document.addEventListener("DOMContentLoaded", tryBootAuthForms);
  window.addEventListener("tomatoInsight:firebaseReady", tryBootAuthForms);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAuthPanels);
  } else {
    initAuthPanels();
  }
})();
