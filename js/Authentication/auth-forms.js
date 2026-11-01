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
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
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

  function initLoginForm() {
    const form = document.getElementById("login-form");
    if (!form) return;

    const errorEl = document.getElementById("login-form-error");
    const successEl = document.getElementById("login-form-success");
    const submitBtn = form.querySelector('button[type="submit"]');

    if (new URLSearchParams(window.location.search).get("reset") === "success") {
      showFormSuccess(successEl, "Your password was updated. Log in with your new password.");
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      showFormError(errorEl, null);

      const email = form.email.value.trim();
      const password = form.password.value;

      if (!email || !password) {
        showFormError(errorEl, "Enter your email and password.");
        return;
      }
      if (!isValidEmail(email)) {
        showFormError(errorEl, "Enter a valid email address.");
        form.email.setAttribute("aria-invalid", "true");
        return;
      }
      form.email.removeAttribute("aria-invalid");

      submitBtn.disabled = true;
      try {
        const result = await window.TomatoInsightAuth.signInWithEmail({ email, password });
        if (result.ok) {
          window.TomatoInsightAuthSession?.markSignedIn?.();
          const params = new URLSearchParams(window.location.search);
          const next = params.get("next");
          const pathOnly = (next || "").split(/[?#]/)[0];
          const target =
            next &&
            next.startsWith("/") &&
            !next.startsWith("//") &&
            pathOnly !== "/" &&
            pathOnly !== "/landing.html" &&
            pathOnly.endsWith(".html")
              ? next
              : "index.html";
          window.location.href = target;
          return;
        }
        showFormError(errorEl, result.error || "Sign in failed.");
      } finally {
        submitBtn.disabled = false;
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

    const card = stage.closest(".auth-split-card");
    const loginPanel = document.getElementById("login-panel");
    const forgotPanel = document.getElementById("forgot-panel");
    const signupPanel = document.getElementById("signup-panel");
    const loginEmail = document.getElementById("login-email");
    const forgotEmail = document.getElementById("forgot-password-email");
    const signupFirst = document.getElementById("signup-first-name");
    const heroLogin = document.getElementById("auth-hero-login");
    const heroSignup = document.getElementById("auth-hero-signup");
    const titles = {
      login: "Tomato Insight — Log in",
      forgot: "Tomato Insight — Reset password",
      signup: "Tomato Insight — Sign up",
    };

    function panelFor(name) {
      if (name === "signup") return signupPanel;
      if (name === "forgot") return forgotPanel;
      return loginPanel;
    }

    function fitStage(name) {
      const panel = panelFor(name);
      if (!panel) return;
      stage.style.height = panel.offsetHeight + "px";
    }

    let fitting = false;

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
      card?.classList.toggle("is-signup", name === "signup");
      document.documentElement.classList.remove("auth-start-signup", "auth-start-forgot");
      if (loginPanel) loginPanel.inert = name !== "login";
      if (forgotPanel) forgotPanel.inert = name !== "forgot";
      if (signupPanel) signupPanel.inert = name !== "signup";
      heroLogin?.setAttribute("aria-hidden", name === "signup" ? "true" : "false");
      heroSignup?.setAttribute("aria-hidden", name === "signup" ? "false" : "true");
      if (titles[name]) document.title = titles[name];

      const params = new URLSearchParams(window.location.search);
      params.delete("forgot");
      params.delete("signup");
      if (name === "forgot") params.set("forgot", "1");
      if (name === "signup") params.set("signup", "1");
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
        const focusTarget = name === "signup" ? signupFirst : name === "forgot" ? forgotEmail : loginEmail;
        window.setTimeout(() => focusTarget?.focus(), 420);
      }
    }

    stage.querySelectorAll("[data-auth-panel]").forEach((el) => {
      el.addEventListener("click", (event) => {
        event.preventDefault();
        const name = el.getAttribute("data-auth-panel");
        if (name === "signup" || name === "forgot" || name === "login") showPanel(name);
      });
    });

    const params = new URLSearchParams(window.location.search);
    const initial = params.get("signup") === "1" ? "signup" : params.get("forgot") === "1" ? "forgot" : "login";
    showPanel(initial);

    if (window.ResizeObserver) {
      const observer = new ResizeObserver(() => {
        if (!stage.classList.contains("is-ready") || fitting) return;
        const name = stage.classList.contains("is-signup")
          ? "signup"
          : stage.classList.contains("is-forgot")
            ? "forgot"
            : "login";
        fitStage(name);
      });
      [loginPanel, forgotPanel, signupPanel].forEach((panel) => {
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

      if (!email) {
        showFormError(errorEl, "Enter your email address.");
        return;
      }
      if (!isValidEmail(email)) {
        showFormError(errorEl, "Enter a valid email address.");
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
            "If an account exists for that email, we sent a link to reset your password. Check your inbox and spam folder."
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

      if (!email) {
        showFormError(errorEl, "Enter your email address.");
        return;
      }
      if (!isValidEmail(email)) {
        showFormError(errorEl, "Enter a valid email address.");
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
        if (result.ok) {
          if (result.warning) {
            window.alert("Account created successfully, but your farm profile could not be fully saved: " + result.warning);
          } else {
            window.alert("Account created successfully! You will now be redirected.");
          }
          window.location.href = "index.html";
          return;
        }
        showFormError(errorEl, result.error || "Sign up failed.");
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  function bootAuthForms() {
    initLoginForm();
    initForgotPasswordForm();
    initResetPasswordForm();
    initSignupForm();
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
