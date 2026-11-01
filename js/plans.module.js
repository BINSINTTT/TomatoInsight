function paintPlansBalance() {
  const el = document.getElementById("plans-balance-value");
  if (!el) return;
  const balance = window.TomatoInsightCredits?.getBalance?.();
  if (balance == null) {
    el.textContent = "—";
    el.classList.remove("plans-balance__value--low");
    return;
  }
  el.textContent = String(balance);
  el.classList.toggle("plans-balance__value--low", balance <= 0);
}

function initPlansPage() {
  paintPlansBalance();
  window.addEventListener("tomatoInsight:creditsChanged", paintPlansBalance);
  window.addEventListener("tomatoInsight:userDataReady", paintPlansBalance);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPlansPage);
} else {
  initPlansPage();
}
