/**
 * Scan credits on the signed-in user's Firestore document:
 *   users/{uid}.credits  { balance, signupGranted, profileBonusGranted, updatedAt }
 *
 * New accounts receive 10 credits. Existing accounts receive those 10 the next
 * time they sign in. Completing all six farm setup steps adds 5 once. Saving a
 * successful scan (Save Info) spends 1. Failed scans do not.
 */
import { getApps } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { isFarmSetupComplete } from "../farm-setup-status.module.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { getFirestore, doc, getDoc, runTransaction, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

export const SIGNUP_CREDITS = 10;
export const PROFILE_BONUS_CREDITS = 5;
export const SCAN_CREDIT_COST = 1;

const LOCAL_KEY = "tomatoInsight.credits";
const PROFILE_BONUS_NOTICE_KEY = "tomatoInsight.profileBonusNotice";
const SIGNUP_TOAST_SHOWN_PREFIX = "tomatoInsight.creditToast.signup10.";
const PROFILE_TOAST_SHOWN_PREFIX = "tomatoInsight.creditToast.profile5.";
const PROFILE_BONUS_GRANT_TOAST_PREFIX = "tomatoInsight.creditToast.profileBonusGrant.";
const creditToastHandled = new Set();

let cachedUid = null;
let cachedBalance = null;
let cachedProfileBonusGranted = false;
let creditsLoaded = false;
let stopCreditsWatch = null;

/** @deprecated Use isFarmSetupComplete from farm-setup-status.module.js */
export function isProfileComplete(profile) {
  return isFarmSetupComplete(profile);
}

function firestoreDb() {
  if (!window.TOMATO_INSIGHT_FIREBASE_CONFIG?.projectId || !getApps().length) return null;
  return getFirestore(getApps()[0]);
}

function currentUid() {
  const apps = getApps();
  if (!apps.length) return null;
  return getAuth(apps[0]).currentUser?.uid || cachedUid || null;
}

function readLocalProfile(uid) {
  try {
    const map = JSON.parse(localStorage.getItem("tomatoInsight.userProfiles") || "{}");
    return map[uid] || null;
  } catch {
    return null;
  }
}

function readCache(uid) {
  try {
    const map = JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}");
    return map[uid] || null;
  } catch {
    return null;
  }
}

function writeCache(uid, record) {
  let map = {};
  try {
    map = JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}");
  } catch {
    map = {};
  }
  map[uid] = {
    balance: record.balance,
    signupGranted: Boolean(record.signupGranted),
    profileBonusGranted: Boolean(record.profileBonusGranted),
    updatedAt: record.updatedAt || null,
  };
  localStorage.setItem(LOCAL_KEY, JSON.stringify(map));
}

function normalizeNode(current) {
  const node = current && typeof current === "object" ? { ...current } : {};
  const balance = Number(node.balance);
  node.balance = Number.isFinite(balance) && balance > 0 ? Math.floor(balance) : 0;
  node.signupGranted = Boolean(node.signupGranted);
  node.profileBonusGranted = Boolean(node.profileBonusGranted);
  return node;
}

export function applyCreditGrants(current, profile) {
  const node = normalizeNode(current);
  let profileBonusJustGranted = false;
  if (!node.signupGranted) {
    node.balance += SIGNUP_CREDITS;
    node.signupGranted = true;
  }
  if (isFarmSetupComplete(profile) && !node.profileBonusGranted) {
    node.balance += PROFILE_BONUS_CREDITS;
    node.profileBonusGranted = true;
    profileBonusJustGranted = true;
  }
  return { node, profileBonusJustGranted };
}

function sameCreditNode(left, right) {
  return (
    left.balance === right.balance &&
    left.signupGranted === right.signupGranted &&
    left.profileBonusGranted === right.profileBonusGranted
  );
}

function rememberProfileBonusNotice() {
  try {
    sessionStorage.setItem(PROFILE_BONUS_NOTICE_KEY, "1");
  } catch {
    /* ignore */
  }
}

function profileBonusGrantToastAlreadyShown(uid) {
  return creditToastWasShown(PROFILE_BONUS_GRANT_TOAST_PREFIX, uid);
}

export function takeProfileBonusNotice() {
  try {
    if (sessionStorage.getItem(PROFILE_BONUS_NOTICE_KEY) !== "1") return false;
    sessionStorage.removeItem(PROFILE_BONUS_NOTICE_KEY);
    return true;
  } catch {
    return false;
  }
}

function publish(uid, record, extra = {}) {
  cachedUid = uid;
  cachedBalance = Number(record.balance) || 0;
  cachedProfileBonusGranted = Boolean(record.profileBonusGranted);
  creditsLoaded = true;
  writeCache(uid, record);
  paintCredits();
  const profileBonusJustGranted = Boolean(extra.profileBonusJustGranted);
  if (profileBonusJustGranted && !profileBonusGrantToastAlreadyShown(uid)) {
    rememberCreditToastShown(PROFILE_BONUS_GRANT_TOAST_PREFIX, uid);
    rememberProfileBonusNotice();
    const balanceAfter = Number(record.balance) || 0;
    window.setTimeout(
      () => showProfileBonusAddedToast(PROFILE_BONUS_CREDITS, balanceAfter),
      80
    );
  } else if (record.profileBonusGranted && !profileBonusGrantToastAlreadyShown(uid)) {
    rememberCreditToastShown(PROFILE_BONUS_GRANT_TOAST_PREFIX, uid);
  }
  window.dispatchEvent(
    new CustomEvent("tomatoInsight:creditsChanged", {
      detail: {
        uid,
        balance: cachedBalance,
        profileBonusGranted: cachedProfileBonusGranted,
        profileBonusJustGranted,
      },
    })
  );
}

function toastStorageKey(prefix, uid) {
  return `${prefix}${uid}`;
}

function ensureCreditToastStack() {
  let stack = document.getElementById("credit-toast-stack");
  if (stack) return stack;
  stack = document.createElement("div");
  stack.id = "credit-toast-stack";
  stack.className = "credit-toast-stack";
  stack.setAttribute("aria-live", "polite");
  stack.setAttribute("aria-relevant", "additions");
  document.body.appendChild(stack);
  return stack;
}

function creditToastIconSvg(kind) {
  if (kind === "deduct") {
    return (
      '<svg class="credit-toast__glyph" viewBox="0 0 24 24" aria-hidden="true">' +
      '<path fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" d="M6 12h12"/>' +
      "</svg>"
    );
  }
  return (
    '<svg class="credit-toast__glyph" viewBox="0 0 24 24" aria-hidden="true">' +
    '<path fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" d="M5 12.5l4.5 4.5L19 7"/>' +
    "</svg>"
  );
}

function remainingCreditsLine(balanceAfter) {
  if (balanceAfter == null || !Number.isFinite(Number(balanceAfter))) return "";
  const left = Math.max(0, Math.floor(Number(balanceAfter)));
  return left === 1 ? "You have 1 credit remaining." : `You have ${left} credits remaining.`;
}

function mountCreditToast({ variant = "success", title, text, icon = "check", autoHideMs = 7000 }) {
  if (!title && !text) return;
  const stack = ensureCreditToastStack();
  const toast = document.createElement("div");
  toast.className = `credit-toast credit-toast--${variant}`;
  toast.setAttribute("role", "status");

  const iconWrap = document.createElement("div");
  iconWrap.className = "credit-toast__icon";
  iconWrap.innerHTML =
    `<span class="credit-toast__icon-mark credit-toast__icon-mark--${icon}">` +
    creditToastIconSvg(icon) +
    "</span>";

  const content = document.createElement("div");
  content.className = "credit-toast__content";
  if (title) {
    const titleEl = document.createElement("p");
    titleEl.className = "credit-toast__title";
    titleEl.textContent = title;
    content.appendChild(titleEl);
  }
  if (text) {
    const textEl = document.createElement("p");
    textEl.className = "credit-toast__text";
    textEl.textContent = text;
    content.appendChild(textEl);
  }

  const close = document.createElement("button");
  close.type = "button";
  close.className = "credit-toast__close";
  close.setAttribute("aria-label", "Dismiss");
  close.textContent = "×";

  toast.append(iconWrap, content, close);
  stack.appendChild(toast);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add("is-visible"));
  });

  let removed = false;
  const remove = () => {
    if (removed) return;
    removed = true;
    toast.classList.remove("is-visible");
    toast.classList.add("is-leaving");
    window.setTimeout(() => toast.remove(), 340);
  };

  close.addEventListener("click", remove);
  window.setTimeout(remove, autoHideMs);
}

function showCreditToast(message, variant = "success") {
  const titles = {
    success: "Credits added",
    accent: "Complete your profile",
    info: "Credits",
  };
  mountCreditToast({
    variant: variant === "info" ? "success" : variant,
    title: titles[variant] || titles.success,
    text: message,
    icon: "check",
    autoHideMs: 9000,
  });
}

function showCreditDeductionToast(amount = SCAN_CREDIT_COST, balanceAfter = null) {
  const deducted = Math.max(1, Math.floor(Number(amount) || SCAN_CREDIT_COST));
  const unit = deducted === 1 ? "credit" : "credits";
  const remaining = remainingCreditsLine(balanceAfter);
  mountCreditToast({
    variant: "deduct",
    title: `${deducted} ${unit} deducted`,
    text: remaining || "Your scan was saved and your balance was updated.",
    icon: "deduct",
    autoHideMs: 6500,
  });
}

let profileBonusGrantToastAt = 0;

function showProfileBonusAddedToast(amount = PROFILE_BONUS_CREDITS, balanceAfter = null) {
  const now = Date.now();
  if (now - profileBonusGrantToastAt < 2000) return;
  profileBonusGrantToastAt = now;

  const added = Math.max(1, Math.floor(Number(amount) || PROFILE_BONUS_CREDITS));
  const unit = added === 1 ? "credit" : "credits";
  const remaining = remainingCreditsLine(balanceAfter);
  mountCreditToast({
    variant: "grant",
    title: `+${added} ${unit} added`,
    text:
      remaining ||
      "Farm setup is complete. Thank you for finishing every setup step.",
    icon: "check",
    autoHideMs: 7000,
  });
}

function creditToastMemoryKey(prefix, uid) {
  return `${prefix}${uid}`;
}

function creditToastWasShown(prefix, uid) {
  const memKey = creditToastMemoryKey(prefix, uid);
  if (creditToastHandled.has(memKey)) return true;
  try {
    if (localStorage.getItem(toastStorageKey(prefix, uid)) === "1") {
      creditToastHandled.add(memKey);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

function rememberCreditToastShown(prefix, uid) {
  creditToastHandled.add(creditToastMemoryKey(prefix, uid));
  try {
    localStorage.setItem(toastStorageKey(prefix, uid), "1");
  } catch {
    /* ignore */
  }
}

function maybeShowCreditWelcomeToasts(uid, result) {
  if (!uid || !result) return;

  let signupQueued = false;
  if (result.signupCreditsJustGranted && !creditToastWasShown(SIGNUP_TOAST_SHOWN_PREFIX, uid)) {
    rememberCreditToastShown(SIGNUP_TOAST_SHOWN_PREFIX, uid);
    signupQueued = true;
    window.setTimeout(
      () =>
        mountCreditToast({
          variant: "success",
          title: "Welcome credits added",
          text: "You received 10 free scan credits to start scanning your farm.",
          icon: "check",
          autoHideMs: 9000,
        }),
      120
    );
  }

  const localProfile = readLocalProfile(uid) || {};
  if (
    result.profileBonusGranted ||
    isFarmSetupComplete(localProfile) ||
    creditToastWasShown(PROFILE_TOAST_SHOWN_PREFIX, uid)
  ) {
    return;
  }

  rememberCreditToastShown(PROFILE_TOAST_SHOWN_PREFIX, uid);
  const delay = signupQueued ? 520 : 180;
  window.setTimeout(
    () =>
      mountCreditToast({
        variant: "accent",
        title: "Earn 5 more credits",
        text: "Finish all six farm setup steps on your profile to unlock 5 additional scan credits.",
        icon: "check",
        autoHideMs: 9000,
      }),
    delay
  );
}

function paintCredits() {
  const valueEl = document.getElementById("metric-credits");
  const hintEl = document.getElementById("metric-credits-hint");
  if (!valueEl) return;
  if (!creditsLoaded || cachedBalance == null) {
    valueEl.textContent = "—";
    valueEl.classList.remove("metric-card__value--alert");
    if (hintEl) hintEl.hidden = true;
    return;
  }
  valueEl.textContent = String(cachedBalance);
  valueEl.classList.toggle("metric-card__value--alert", cachedBalance <= 0);
  if (hintEl) {
    const showHint = !cachedProfileBonusGranted;
    hintEl.hidden = !showHint;
    hintEl.textContent = showHint ? "Complete farm setup for 5 more" : "";
  }
}

function watchCredits(uid) {
  const db = firestoreDb();
  if (!db || !uid) return;
  if (stopCreditsWatch) stopCreditsWatch();
  stopCreditsWatch = onSnapshot(doc(db, "users", uid), (snap) => {
    if (currentUid() !== uid) return;
    const value = snap.data()?.credits;
    if (!value || typeof value !== "object") return;
    publish(uid, normalizeNode(value));
  });
}

export function stopWatchingCredits() {
  if (stopCreditsWatch) stopCreditsWatch();
  stopCreditsWatch = null;
  cachedUid = null;
  cachedBalance = null;
  cachedProfileBonusGranted = false;
  creditsLoaded = false;
  paintCredits();
}

export function trySyncFarmSetupCredits() {
  const uid = currentUid();
  if (!uid) return Promise.resolve(null);
  return ensureAccountCredits(uid, readLocalProfile(uid)).catch((err) => {
    console.warn("[TomatoInsight] Farm setup credit sync failed.", err);
    return null;
  });
}

export async function ensureAccountCredits(uid, profile) {
  const db = firestoreDb();
  if (!db || !uid) {
    const err = new Error("Firestore is not available.");
    err.code = "ti/no-database";
    throw err;
  }
  const profileRecord = { ...readLocalProfile(uid), ...(profile || {}) };
  const userRef = doc(db, "users", uid);
  const beforeSnap = await getDoc(userRef);
  const hadProfileBonus = Boolean(beforeSnap.data()?.credits?.profileBonusGranted);
  const hadSignupGranted = Boolean(beforeSnap.data()?.credits?.signupGranted);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(userRef);
    const current = snap.exists() ? snap.data()?.credits : null;
    const next = applyCreditGrants(current, profileRecord);
    const previous = normalizeNode(current);
    if (snap.exists() && sameCreditNode(previous, next.node)) return;
    tx.set(
      userRef,
      {
        credits: {
          ...next.node,
          updatedAt: new Date().toISOString(),
        },
      },
      { merge: true }
    );
  });

  const afterSnap = await getDoc(userRef);
  const stored = normalizeNode(afterSnap.data()?.credits);
  if (!afterSnap.exists() || !stored.signupGranted) {
    const err = new Error("Credit balance was not saved.");
    err.code = "ti/credits-missing";
    throw err;
  }
  const profileBonusJustGranted = !hadProfileBonus && stored.profileBonusGranted;
  const signupCreditsJustGranted = !hadSignupGranted && stored.signupGranted;
  publish(uid, stored, { profileBonusJustGranted, signupCreditsJustGranted });
  maybeShowCreditWelcomeToasts(uid, {
    balance: stored.balance,
    profileBonusGranted: stored.profileBonusGranted,
    profileBonusJustGranted,
    signupCreditsJustGranted,
  });
  watchCredits(uid);
  return {
    balance: stored.balance,
    profileBonusGranted: stored.profileBonusGranted,
    profileBonusJustGranted,
    signupCreditsJustGranted,
  };
}

export async function ensureReadyForScan() {
  const uid = currentUid();
  if (!uid) return { ok: false, code: "signed-out", error: "Sign in to use scan credits." };
  try {
    const result = await ensureAccountCredits(uid, readLocalProfile(uid));
    if (result.balance < SCAN_CREDIT_COST) {
      return {
        ok: false,
        code: "insufficient-credits",
        balance: result.balance,
        error: "A successful scan uses 1 credit. You have none left.",
      };
    }
    return { ok: true, balance: result.balance };
  } catch (err) {
    console.warn("[TomatoInsight] Could not read credits before scan.", err);
    return { ok: false, code: "credits-unavailable", error: "Could not reach your credit balance. Try again." };
  }
}

export async function spendForSuccessfulScan() {
  const uid = currentUid();
  if (!uid) return { ok: false, code: "signed-out", error: "Sign in to use scan credits." };
  const db = firestoreDb();
  if (!db) {
    return {
      ok: false,
      code: "credits-unavailable",
      error: "Credits are stored on the server. Firestore is not configured.",
    };
  }

  try {
    await ensureAccountCredits(uid, readLocalProfile(uid));
  } catch (err) {
    console.warn("[TomatoInsight] Could not refresh credits before scan.", err);
    return { ok: false, code: "credits-unavailable", error: "Could not reach your credit balance. Try again." };
  }

  const userRef = doc(db, "users", uid);
  let storedAfterSpend = null;
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef);
      const node = normalizeNode(snap.data()?.credits);
      if (!node.signupGranted || node.balance < SCAN_CREDIT_COST) {
        const err = new Error("insufficient-credits");
        err.code = "insufficient-credits";
        throw err;
      }
      storedAfterSpend = {
        ...node,
        balance: node.balance - SCAN_CREDIT_COST,
        updatedAt: new Date().toISOString(),
      };
      tx.set(
        userRef,
        {
          credits: storedAfterSpend,
        },
        { merge: true }
      );
    });
  } catch (err) {
    const message = String(err?.code || err?.message || "");
    if (message.includes("insufficient-credits")) {
      const snap = await getDoc(userRef);
      const stored = normalizeNode(snap.data()?.credits);
      if (stored.signupGranted) publish(uid, stored);
      const noneLeft = stored.balance < SCAN_CREDIT_COST;
      return {
        ok: false,
        code: noneLeft ? "insufficient-credits" : "credits-unavailable",
        balance: stored.balance,
        error: noneLeft
          ? "A successful scan uses 1 credit. You have none left."
          : "Could not update your credit balance. The scan was not charged. Try again.",
      };
    }
    throw err;
  }

  const stored = normalizeNode(storedAfterSpend);
  publish(uid, stored);
  return { ok: true, balance: stored.balance };
}

/** Test top-up — adds credits in Firestore without payment (replace with checkout later). */
export async function addTopUpCredits(amount) {
  const uid = currentUid();
  if (!uid) {
    return { ok: false, code: "signed-out", error: "Sign in to add credits." };
  }
  const db = firestoreDb();
  if (!db) {
    return {
      ok: false,
      code: "credits-unavailable",
      error: "Credits are stored on the server. Firestore is not configured.",
    };
  }

  const credits = Math.floor(Number(amount));
  if (!Number.isFinite(credits) || credits < 1) {
    return { ok: false, code: "invalid-amount", error: "Choose a valid credit pack." };
  }

  try {
    await ensureAccountCredits(uid, readLocalProfile(uid));
  } catch (err) {
    console.warn("[TomatoInsight] Could not sync credits before top-up.", err);
    return { ok: false, code: "credits-unavailable", error: "Could not reach your credit balance. Try again." };
  }

  const userRef = doc(db, "users", uid);
  let storedAfterTopUp = null;
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef);
      const node = normalizeNode(snap.data()?.credits);
      if (!node.signupGranted) {
        const err = new Error("credits-missing");
        err.code = "ti/credits-missing";
        throw err;
      }
      storedAfterTopUp = {
        ...node,
        balance: node.balance + credits,
        updatedAt: new Date().toISOString(),
      };
      tx.set(userRef, { credits: storedAfterTopUp }, { merge: true });
    });
  } catch (err) {
    console.warn("[TomatoInsight] Test top-up failed.", err);
    return { ok: false, code: "credits-unavailable", error: "Could not add credits. Try again." };
  }

  const stored = normalizeNode(storedAfterTopUp);
  publish(uid, stored);
  mountCreditToast({
    variant: "grant",
    title: `+${credits} credits added`,
    text: remainingCreditsLine(stored.balance) || "Test top-up applied to your account.",
    icon: "check",
    autoHideMs: 6500,
  });
  return { ok: true, balance: stored.balance, added: credits };
}

export async function refundScanCredit() {
  const uid = currentUid();
  const db = firestoreDb();
  if (!uid || !db) return { ok: false };
  const userRef = doc(db, "users", uid);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef);
      const node = normalizeNode(snap.data()?.credits);
      if (!node.signupGranted) return;
      tx.set(
        userRef,
        {
          credits: {
            ...node,
            balance: node.balance + SCAN_CREDIT_COST,
            updatedAt: new Date().toISOString(),
          },
        },
        { merge: true }
      );
    });
  } catch (err) {
    console.warn("[TomatoInsight] Could not return a scan credit.", err);
    return { ok: false };
  }
  const snap = await getDoc(userRef);
  const stored = normalizeNode(snap.data()?.credits);
  if (stored.signupGranted) publish(uid, stored);
  return { ok: true, balance: stored.balance };
}

export function canAttemptScan() {
  if (!creditsLoaded || cachedBalance == null) {
    return { ok: false, code: "credits-pending", error: "Checking your credits…" };
  }
  if (cachedBalance >= SCAN_CREDIT_COST) return { ok: true, balance: cachedBalance };
  return {
    ok: false,
    code: "insufficient-credits",
    balance: cachedBalance,
    error: "A successful scan uses 1 credit. You have none left.",
  };
}

function restoreCachedBalance() {
  const uid = currentUid();
  if (!uid) return;
  const cached = readCache(uid);
  if (!cached || !Number.isFinite(Number(cached.balance))) return;
  cachedUid = uid;
  cachedBalance = Math.max(0, Math.floor(Number(cached.balance)));
  cachedProfileBonusGranted = Boolean(cached.profileBonusGranted);
  creditsLoaded = true;
  paintCredits();
}

let outOfCreditModalBound = false;
let creditTopUpClickBound = false;

function bindCreditTopUpButtons() {
  if (creditTopUpClickBound) return;
  creditTopUpClickBound = true;

  document.addEventListener("click", async (event) => {
    const btn = event.target instanceof Element ? event.target.closest("[data-credit-topup]") : null;
    if (!btn || !(btn instanceof HTMLButtonElement) || btn.disabled) return;

    const amount = Number.parseInt(btn.getAttribute("data-credit-topup") || "", 10);
    if (!Number.isFinite(amount) || amount < 1) return;

    event.preventDefault();
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Adding…";

    try {
      const result = await addTopUpCredits(amount);
      if (result.ok) {
        btn.textContent = "Added!";
        hideOutOfCreditModal();
        window.setTimeout(() => {
          btn.textContent = original;
          btn.disabled = false;
        }, 1200);
        return;
      }
      showCreditToast(result.error || "Could not add credits.", "info");
    } catch (err) {
      console.warn("[TomatoInsight] Top-up button failed.", err);
      showCreditToast("Could not add credits. Try again.", "info");
    }

    btn.textContent = original;
    btn.disabled = false;
  });
}

function bindOutOfCreditModal() {
  if (outOfCreditModalBound) return;
  const modal = document.getElementById("out-of-credit-modal");
  if (!modal) return;
  outOfCreditModalBound = true;

  modal.querySelectorAll("[data-close-out-of-credit]").forEach((el) => {
    el.addEventListener("click", () => hideOutOfCreditModal());
  });

  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const open = document.getElementById("out-of-credit-modal");
    if (open && !open.hidden) hideOutOfCreditModal();
  });
}

export function showOutOfCreditModal() {
  const modal = document.getElementById("out-of-credit-modal");
  if (!modal) return;
  bindOutOfCreditModal();
  modal.hidden = false;
  document.body.classList.add("modal-open");
  const closeBtn = modal.querySelector("[data-close-out-of-credit].modal__close");
  closeBtn?.focus();
}

export function hideOutOfCreditModal() {
  const modal = document.getElementById("out-of-credit-modal");
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  if (
    document.getElementById("layout-modal")?.hidden !== false &&
    document.getElementById("tile-delete-confirm")?.hidden !== false
  ) {
    document.body.classList.remove("modal-open");
  }
}

window.TomatoInsightCredits = {
  SIGNUP_CREDITS,
  PROFILE_BONUS_CREDITS,
  SCAN_CREDIT_COST,
  isProfileComplete,
  ensureAccountCredits,
  trySyncFarmSetupCredits,
  ensureReadyForScan,
  spendForSuccessfulScan,
  refundScanCredit,
  addTopUpCredits,
  canAttemptScan,
  takeProfileBonusNotice,
  stopWatchingCredits,
  getBalance() {
    return creditsLoaded ? cachedBalance : null;
  },
  shouldShowProfileCreditReminder() {
    if (!creditsLoaded) return false;
    return !cachedProfileBonusGranted;
  },
  showCreditToast,
  showCreditDeductionToast,
  showProfileBonusAddedToast,
  showOutOfCreditModal,
  hideOutOfCreditModal,
};

restoreCachedBalance();
bindCreditTopUpButtons();
window.addEventListener("tomatoInsight:userDataReady", () => {
  const uid = currentUid();
  if (!uid) return;
  ensureAccountCredits(uid, readLocalProfile(uid)).catch((err) => {
    console.warn("[TomatoInsight] Credit sync failed.", err);
  });
});
window.addEventListener("tomatoInsight:userDataCleared", () => {
  stopWatchingCredits();
});
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", paintCredits);
} else {
  paintCredits();
}
