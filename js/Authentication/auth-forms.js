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

  function initLoginForm() {
    const form = document.getElementById("login-form");
    if (!form) return;

    const errorEl = document.getElementById("login-form-error");
    const submitBtn = form.querySelector('button[type="submit"]');

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
        showFormError(errorEl, "Enter your Gmail address.");
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
})();
