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

function formatWhen(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return String(iso);
  }
}

async function paintPaymentHistory() {
  const list = document.getElementById("plans-payment-list");
  const empty = document.getElementById("plans-payment-empty");
  if (!list) return;
  const api = window.TomatoInsightPayments;
  if (!api?.listPaymentsForCurrentUser) return;

  try {
    const rows = await api.listPaymentsForCurrentUser();
    list.replaceChildren();
    if (!rows.length) {
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    rows.slice(0, 12).forEach((row) => {
      const item = document.createElement("li");
      item.className = "plans-payment";
      const title = document.createElement("b");
      title.textContent = `${row.packName || "Credits"} · +${row.credits || 0}`;
      const meta = document.createElement("span");
      const charged =
        api.formatPhp?.(row.amountChargedPhp ?? row.amountChargedUsd ?? 0) ||
        api.formatUsd?.(row.amountChargedPhp ?? row.amountChargedUsd ?? 0) ||
        "₱0";
      meta.textContent = `${charged} demo · ${formatWhen(row.createdAt)}`;
      item.append(title, meta);
      list.appendChild(item);
    });
  } catch (err) {
    console.warn("[TomatoInsight] Could not load payment history.", err);
    if (empty) {
      empty.hidden = false;
      empty.textContent = "Could not load purchases. Check Firestore rules for the payments collection.";
    }
  }
}

function initPlansPage() {
  paintPlansBalance();
  paintPaymentHistory();
  window.addEventListener("tomatoInsight:creditsChanged", paintPlansBalance);
  window.addEventListener("tomatoInsight:userDataReady", () => {
    paintPlansBalance();
    paintPaymentHistory();
  });
  window.addEventListener("tomatoInsight:paymentCompleted", paintPaymentHistory);
}

function startPlansPage() {
  const boot = window.TomatoInsightAppPageLoad?.boot;
  const run = boot ? boot({ message: "Loading credit plans…" }) : Promise.resolve();
  run.then(() => initPlansPage());
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startPlansPage);
} else {
  startPlansPage();
}
