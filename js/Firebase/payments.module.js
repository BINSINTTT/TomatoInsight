/**
 * Demo checkout and the top-level Firestore `payments` collection.
 *
 *   payments/{paymentId}
 *     uid, email, packId, packName, credits,
 *     listPricePhp, amountChargedPhp, currency ("PHP"),
 *     status, method, isDemo,
 *     createdAt, createdAtMs, balanceBefore, balanceAfter
 *
 * Query by uid: collection("payments").where("uid", "==", uid)
 */
import { getApps } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

/** Affordable PHP packs for local farmers (demo checkout still charges ₱0). */
export const CREDIT_PACKS = {
  starter: { packId: "starter", packName: "Starter", credits: 10, listPricePhp: 49 },
  grower: { packId: "grower", packName: "Grower", credits: 25, listPricePhp: 99 },
  season: { packId: "season", packName: "Season", credits: 50, listPricePhp: 149 },
};

const PACK_BY_CREDITS = {
  10: CREDIT_PACKS.starter,
  25: CREDIT_PACKS.grower,
  50: CREDIT_PACKS.season,
};

function firestoreDb() {
  if (!window.TOMATO_INSIGHT_FIREBASE_CONFIG?.projectId || !getApps().length) return null;
  return getFirestore(getApps()[0]);
}

function currentUid() {
  const apps = getApps();
  if (!apps.length) return null;
  return getAuth(apps[0]).currentUser?.uid || null;
}

export function packFor(packIdOrCredits) {
  if (packIdOrCredits && CREDIT_PACKS[packIdOrCredits]) return CREDIT_PACKS[packIdOrCredits];
  const credits = Number.parseInt(packIdOrCredits, 10);
  if (Number.isFinite(credits) && PACK_BY_CREDITS[credits]) return PACK_BY_CREDITS[credits];
  return null;
}

export function formatPhp(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "₱0";
  const rounded = Math.round(n * 100) / 100;
  if (Number.isInteger(rounded)) return `₱${rounded}`;
  return `₱${rounded.toFixed(2)}`;
}

/** @deprecated Prefer formatPhp — kept for older callers. */
export function formatUsd(amount) {
  return formatPhp(amount);
}

export async function listPaymentsForCurrentUser() {
  const uid = currentUid();
  const db = firestoreDb();
  if (!uid || !db) return [];
  const snap = await getDocs(query(collection(db, "payments"), where("uid", "==", uid)));
  const rows = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
  rows.sort((a, b) => Number(b.createdAtMs || 0) - Number(a.createdAtMs || 0));
  return rows;
}

function ensureCheckoutModal() {
  let modal = document.getElementById("demo-checkout-modal");
  if (modal) return modal;
  modal = document.createElement("div");
  modal.id = "demo-checkout-modal";
  modal.className = "modal demo-checkout";
  modal.hidden = true;
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "demo-checkout-title");
  modal.innerHTML = `
    <div class="modal__backdrop" data-close-demo-checkout tabindex="-1" aria-hidden="true"></div>
    <div class="modal__panel demo-checkout__panel">
      <header class="modal__header">
        <div>
          <p class="demo-checkout__eyebrow">Demo checkout</p>
          <h2 class="modal__title" id="demo-checkout-title">Pay ₱0 to add credits</h2>
        </div>
        <button type="button" class="modal__close" data-close-demo-checkout aria-label="Close">×</button>
      </header>
      <div class="modal__body">
        <p class="demo-checkout__pack" id="demo-checkout-pack"></p>
        <dl class="demo-checkout__summary">
          <div><dt>Listed price</dt><dd id="demo-checkout-list-price">₱0</dd></div>
          <div><dt>You pay today</dt><dd id="demo-checkout-pay">₱0</dd></div>
        </dl>
        <p class="demo-checkout__note">
          This is a free demo. No card is charged. A paid row is still saved in Firestore so you can query purchases.
        </p>
        <p class="demo-checkout__error" id="demo-checkout-error" hidden></p>
      </div>
      <footer class="modal__footer">
        <button type="button" class="btn btn--ghost" data-close-demo-checkout>Cancel</button>
        <button type="button" class="btn btn--primary" id="demo-checkout-pay-btn">Pay ₱0 (demo)</button>
      </footer>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelectorAll("[data-close-demo-checkout]").forEach((el) => {
    el.addEventListener("click", closeCheckout);
  });
  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const open = document.getElementById("demo-checkout-modal");
    if (open && !open.hidden) closeCheckout();
  });
  modal.querySelector("#demo-checkout-pay-btn")?.addEventListener("click", payDemoCheckout);
  return modal;
}

let selectedPack = null;
let paying = false;

function setCheckoutError(message) {
  const el = document.getElementById("demo-checkout-error");
  if (!el) return;
  if (!message) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = message;
}

export function openCheckout(packIdOrCredits) {
  const pack = packFor(packIdOrCredits);
  if (!pack) return;
  selectedPack = pack;
  const modal = ensureCheckoutModal();
  const packEl = document.getElementById("demo-checkout-pack");
  const listEl = document.getElementById("demo-checkout-list-price");
  const payEl = document.getElementById("demo-checkout-pay");
  if (packEl) packEl.textContent = `${pack.packName} · ${pack.credits} credits`;
  if (listEl) listEl.textContent = formatPhp(pack.listPricePhp);
  if (payEl) payEl.textContent = "₱0";
  setCheckoutError("");
  const payBtn = document.getElementById("demo-checkout-pay-btn");
  if (payBtn) {
    payBtn.disabled = false;
    payBtn.textContent = "Pay ₱0 (demo)";
  }
  modal.hidden = false;
  document.body.classList.add("modal-open");
  payBtn?.focus();
}

export function closeCheckout() {
  const modal = document.getElementById("demo-checkout-modal");
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  selectedPack = null;
  paying = false;
  if (
    document.getElementById("layout-modal")?.hidden !== false &&
    document.getElementById("tile-delete-confirm")?.hidden !== false &&
    document.getElementById("out-of-credit-modal")?.hidden !== false
  ) {
    document.body.classList.remove("modal-open");
  }
}

async function payDemoCheckout() {
  if (paying || !selectedPack) return;
  const pack = selectedPack;
  const payBtn = document.getElementById("demo-checkout-pay-btn");
  paying = true;
  if (payBtn) {
    payBtn.disabled = true;
    payBtn.textContent = "Processing…";
  }
  setCheckoutError("");

  await new Promise((resolve) => window.setTimeout(resolve, 900));

  try {
    const addCredits = window.TomatoInsightCredits?.addTopUpCredits;
    if (!addCredits) {
      setCheckoutError("Credits are still loading. Try again in a moment.");
      paying = false;
      if (payBtn) {
        payBtn.disabled = false;
        payBtn.textContent = "Pay ₱0 (demo)";
      }
      return;
    }
    const result = await addCredits(pack.credits, pack);
    if (!result?.ok) {
      setCheckoutError(result?.error || "Could not complete the demo payment.");
      paying = false;
      if (payBtn) {
        payBtn.disabled = false;
        payBtn.textContent = "Pay ₱0 (demo)";
      }
      return;
    }
    window.TomatoInsightCredits?.hideOutOfCreditModal?.();
    closeCheckout();
    window.dispatchEvent(
      new CustomEvent("tomatoInsight:paymentCompleted", {
        detail: { payment: result.payment, balance: result.balance },
      })
    );
  } catch (err) {
    console.warn("[TomatoInsight] Demo checkout failed.", err);
    setCheckoutError("Could not reach Firestore. Try again.");
    paying = false;
    if (payBtn) {
      payBtn.disabled = false;
      payBtn.textContent = "Pay ₱0 (demo)";
    }
  }
}

window.TomatoInsightPayments = {
  CREDIT_PACKS,
  packFor,
  formatPhp,
  formatUsd,
  openCheckout,
  closeCheckout,
  listPaymentsForCurrentUser,
};
