/**
 * GCash checkout and the top-level Firestore `payments` collection.
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

/** Affordable PHP packs for local farmers — charged via GCash. */
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

/** Shared GCash QR destination for plan payments. */
export const GCASH_PAY_URL = "https://qr.gcash.com/281002003111241151621217";
const GCASH_QR_SRC = new URL("../img/gcash-qr.png", window.location.href).href;

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
  modal.className = "modal demo-checkout gcash-checkout";
  modal.hidden = true;
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "demo-checkout-title");
  modal.innerHTML = `
    <div class="modal__backdrop" data-close-demo-checkout tabindex="-1" aria-hidden="true"></div>
    <div class="modal__panel demo-checkout__panel gcash-checkout__panel">
      <header class="modal__header">
        <div>
          <p class="demo-checkout__eyebrow gcash-checkout__eyebrow">GCash payment</p>
          <h2 class="modal__title" id="demo-checkout-title">Pay for your plan</h2>
        </div>
        <button type="button" class="modal__close" data-close-demo-checkout aria-label="Close">×</button>
      </header>
      <div class="modal__body">
        <p class="demo-checkout__pack" id="demo-checkout-pack"></p>
        <dl class="demo-checkout__summary">
          <div><dt>Plan</dt><dd id="demo-checkout-plan-name">—</dd></div>
          <div><dt>Credits</dt><dd id="demo-checkout-credits">—</dd></div>
          <div><dt>Amount to pay</dt><dd id="demo-checkout-pay">₱0</dd></div>
        </dl>

        <div class="gcash-checkout__paybox">
          <p class="gcash-checkout__secure">Securely complete the payment with your GCash app</p>
          <button type="button" class="gcash-checkout__open-btn" id="gcash-open-btn">Open in GCash</button>
          <p class="gcash-checkout__or">or Log in to GCash and scan this QR with the QR Scanner.</p>
          <img
            class="gcash-checkout__qr"
            id="gcash-qr-image"
            src="${GCASH_QR_SRC}"
            alt="GCash payment QR code"
            width="220"
            height="220"
          />
        </div>

        <p class="demo-checkout__note">
          Pay the plan amount above in GCash, then confirm here so we can add your credits.
        </p>
        <p class="demo-checkout__error" id="demo-checkout-error" hidden></p>
      </div>
      <footer class="modal__footer">
        <button type="button" class="btn btn--ghost" data-close-demo-checkout>Cancel</button>
        <button type="button" class="btn btn--primary" id="demo-checkout-pay-btn">I've paid — add credits</button>
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
  modal.querySelector("#gcash-open-btn")?.addEventListener("click", openInGCash);
  modal.querySelector("#demo-checkout-pay-btn")?.addEventListener("click", confirmGCashPayment);
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

function openInGCash() {
  if (!selectedPack) return;
  window.open(GCASH_PAY_URL, "_blank", "noopener,noreferrer");
}

export function openCheckout(packIdOrCredits) {
  const pack = packFor(packIdOrCredits);
  if (!pack) return;
  selectedPack = pack;
  const modal = ensureCheckoutModal();
  const packEl = document.getElementById("demo-checkout-pack");
  const planEl = document.getElementById("demo-checkout-plan-name");
  const creditsEl = document.getElementById("demo-checkout-credits");
  const payEl = document.getElementById("demo-checkout-pay");
  const titleEl = document.getElementById("demo-checkout-title");
  if (packEl) packEl.textContent = `${pack.packName} · ${pack.credits} credits`;
  if (planEl) planEl.textContent = pack.packName;
  if (creditsEl) creditsEl.textContent = String(pack.credits);
  if (payEl) payEl.textContent = formatPhp(pack.listPricePhp);
  if (titleEl) titleEl.textContent = `Pay ${formatPhp(pack.listPricePhp)} for ${pack.packName}`;
  setCheckoutError("");
  const payBtn = document.getElementById("demo-checkout-pay-btn");
  if (payBtn) {
    payBtn.disabled = false;
    payBtn.textContent = `I've paid ${formatPhp(pack.listPricePhp)} — add credits`;
  }
  const qr = document.getElementById("gcash-qr-image");
  if (qr) qr.src = GCASH_QR_SRC;
  modal.hidden = false;
  document.body.classList.add("modal-open");
  document.getElementById("gcash-open-btn")?.focus();
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

async function confirmGCashPayment() {
  if (paying || !selectedPack) return;
  const pack = selectedPack;
  const payBtn = document.getElementById("demo-checkout-pay-btn");
  paying = true;
  if (payBtn) {
    payBtn.disabled = true;
    payBtn.textContent = "Confirming payment…";
  }
  setCheckoutError("");

  try {
    const addCredits = window.TomatoInsightCredits?.addTopUpCredits;
    if (!addCredits) {
      setCheckoutError("Credits are still loading. Try again in a moment.");
      paying = false;
      if (payBtn) {
        payBtn.disabled = false;
        payBtn.textContent = `I've paid ${formatPhp(pack.listPricePhp)} — add credits`;
      }
      return;
    }
    const result = await addCredits(pack.credits, {
      ...pack,
      amountChargedPhp: pack.listPricePhp,
      method: "gcash",
      isDemo: false,
    });
    if (!result?.ok) {
      setCheckoutError(result?.error || "Could not confirm the GCash payment.");
      paying = false;
      if (payBtn) {
        payBtn.disabled = false;
        payBtn.textContent = `I've paid ${formatPhp(pack.listPricePhp)} — add credits`;
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
    console.warn("[TomatoInsight] GCash checkout failed.", err);
    setCheckoutError("Could not reach Firestore. Try again.");
    paying = false;
    if (payBtn) {
      payBtn.disabled = false;
      payBtn.textContent = `I've paid ${formatPhp(pack.listPricePhp)} — add credits`;
    }
  }
}

window.TomatoInsightPayments = {
  CREDIT_PACKS,
  GCASH_PAY_URL,
  packFor,
  formatPhp,
  formatUsd,
  openCheckout,
  closeCheckout,
  listPaymentsForCurrentUser,
};
