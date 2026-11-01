(function () {
  const HINT =
    "At least 8 characters, including uppercase, lowercase, and one special character (e.g. !@#$%)";

  const RULES = [
    {
      id: "length",
      label: "At least 8 characters",
      test: (p) => p.length >= 8,
    },
    {
      id: "lower",
      label: "One lowercase letter (a–z)",
      test: (p) => /[a-z]/.test(p),
    },
    {
      id: "upper",
      label: "One uppercase letter (A–Z)",
      test: (p) => /[A-Z]/.test(p),
    },
    {
      id: "special",
      label: "One special character (e.g. !@#$%)",
      test: (p) => /[^a-zA-Z0-9]/.test(p),
    },
  ];

  function passwordValidationError(password) {
    if (password.length < 8) return "Password must be at least 8 characters";
    if (!/[a-z]/.test(password)) return "Password must include at least one lowercase letter";
    if (!/[A-Z]/.test(password)) return "Password must include at least one uppercase letter";
    if (!/[^a-zA-Z0-9]/.test(password)) {
      return "Password must include at least one special character";
    }
    return null;
  }

  function isPasswordValid(password) {
    return passwordValidationError(password) === null;
  }

  function updatePasswordRulesUI(password, listEl, forceShow) {
    if (!listEl) return;
    listEl.querySelectorAll("[data-rule]").forEach((item) => {
      const id = item.getAttribute("data-rule");
      const rule = RULES.find((r) => r.id === id);
      const ok = rule?.test(password) ?? false;
      item.classList.toggle("auth-password-rules__item--ok", ok);
    });
    const failed = !isPasswordValid(password);
    listEl.hidden = !(failed && (forceShow || password.length > 0));
  }

  function bindPasswordRules(passwordInput, listEl) {
    if (!passwordInput || !listEl) return;
    const refresh = () => updatePasswordRulesUI(passwordInput.value, listEl);
    passwordInput.addEventListener("input", refresh);
    refresh();
  }

  function bindPasswordVisibilityToggles(root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll("[data-password-toggle]").forEach((btn) => {
      if (btn.dataset.passwordToggleBound === "true") return;
      const wrap = btn.closest(".auth-field__input-wrap");
      const input = wrap?.querySelector("input");
      if (!input) return;

      btn.dataset.passwordToggleBound = "true";
      btn.addEventListener("click", () => {
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
        btn.setAttribute("aria-pressed", show ? "true" : "false");
        btn.classList.toggle("auth-password-toggle--visible", show);
      });
    });
  }

  function initPasswordVisibilityToggles() {
    bindPasswordVisibilityToggles(document);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPasswordVisibilityToggles);
  } else {
    initPasswordVisibilityToggles();
  }

  window.TomatoInsightAuthPassword = {
    HINT,
    RULES,
    passwordValidationError,
    isPasswordValid,
    updatePasswordRulesUI,
    bindPasswordRules,
    bindPasswordVisibilityToggles,
  };
})();
