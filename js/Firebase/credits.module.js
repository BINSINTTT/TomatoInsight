/**
 * Scan credits on the signed-in user's Firestore document:
 *   users/{uid}.credits  { balance, signupGranted, profileBonusGranted, updatedAt }
 *
 * New accounts receive 10 credits. Existing accounts receive those 10 the next
 * time they sign in. Completing all six farm setup steps and clicking Update
 * profile adds 5 once. Saving a successful scan (Save Info) spends 1. Failed
 * scans do not.
 */
import { getApps } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { isFarmSetupComplete } from "../farm-setup-status.module.js";
import {
  getAuth,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  runTransaction,
  onSnapshot,
  setDoc,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

export const SIGNUP_CREDITS = 10;
export const PROFILE_BONUS_CREDITS = 5;
export const SCAN_CREDIT_COST = 1;

const LOCAL_KEY = "tomatoInsight.credits";
const PROFILE_BONUS_NOTICE_KEY = "tomatoInsight.profileBonusNotice";
const SIGNUP_TOAST_SHOWN_PREFIX = "tomatoInsight.creditToast.signup10.";
const PROFILE_TOAST_SHOWN_PREFIX = "tomatoInsight.creditToast.profile5.";
const creditToastHandled = new Set();

let cachedUid = null;
let cachedBalance = null;
let cachedProfileBonusGranted = false;
let creditsLoaded = false;
let stopCreditsWatch = null;
/** Resolves when Firestore credits are synced (or local cache is applied). */
let creditsHydratePromise = null;

function creditsAreReady() {
  return creditsLoaded && cachedBalance != null;
}

function whenCreditsReady() {
  if (creditsAreReady()) return Promise.resolve();
  if (creditsHydratePromise) return creditsHydratePromise;
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.removeEventListener("tomatoInsight:creditsChanged", onCreditsChanged);
      resolve();
    };
    const onCreditsChanged = () => {
      if (creditsAreReady()) finish();
    };
    window.addEventListener("tomatoInsight:creditsChanged", onCreditsChanged);
    window.setTimeout(finish, 15000);
  });
}

function applyCreditsFromLocalCache(uid) {
  if (!uid) return false;
  if (creditsAreReady() && cachedUid === uid) return true;
  const cached = readCache(uid);
  if (!cached || !Number.isFinite(Number(cached.balance))) return false;
  publish(
    uid,
    {
      signupGranted: Boolean(cached.signupGranted),
      profileBonusGranted: Boolean(cached.profileBonusGranted),
      balance: Math.max(0, Math.floor(Number(cached.balance))),
      updatedAt: cached.updatedAt || null,
    },
    { fromCache: true }
  );
  return true;
}

function startCreditsHydrate(uid, profile) {
  if (!uid) {
    creditsHydratePromise = Promise.resolve();
    return creditsHydratePromise;
  }

  const fromCache = applyCreditsFromLocalCache(uid);

  const syncPromise = ensureAccountCredits(uid, profile).catch((err) => {
    console.warn("[TomatoInsight] Credit sync failed.", err);
    return null;
  });

  if (fromCache || creditsAreReady()) {
    creditsHydratePromise = Promise.resolve();
    void syncPromise;
    return creditsHydratePromise;
  }

  creditsHydratePromise = syncPromise;
  return creditsHydratePromise;
}

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

export function applyCreditGrants(current, profile, options = {}) {
  const node = normalizeNode(current);
  let profileBonusJustGranted = false;
  if (!node.signupGranted) {
    node.balance += SIGNUP_CREDITS;
    node.signupGranted = true;
  }
  if (options.grantProfileBonus && isFarmSetupComplete(profile) && !node.profileBonusGranted) {
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
        text: "Finish all six farm setup steps, then click Update profile to add 5 extra scan credits.",
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
    hintEl.textContent = showHint ? "Update profile after farm setup for 5 more" : "";
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
    publish(uid, normalizeNode(value), { fromWatch: true });
  });
}

export function stopWatchingCredits() {
  if (stopCreditsWatch) stopCreditsWatch();
  stopCreditsWatch = null;
  cachedUid = null;
  cachedBalance = null;
  cachedProfileBonusGranted = false;
  creditsLoaded = false;
  creditsHydratePromise = null;
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

export async function ensureAccountCredits(uid, profile, options = {}) {
  const db = firestoreDb();
  if (!db || !uid) {
    const err = new Error("Firestore is not available.");
    err.code = "ti/no-database";
    throw err;
  }
  const profileRecord = { ...readLocalProfile(uid), ...(profile || {}) };
  const userRef = doc(db, "users", uid);
  const initialSnap = await getDoc(userRef);
  const current = initialSnap.exists() ? initialSnap.data()?.credits : null;
  const previous = normalizeNode(current);
  const next = applyCreditGrants(current, profileRecord, options);
  const hadSignupGranted = Boolean(previous.signupGranted);

  if (initialSnap.exists() && sameCreditNode(previous, next.node)) {
    publish(uid, previous);
    maybeShowCreditWelcomeToasts(uid, {
      balance: previous.balance,
      profileBonusGranted: previous.profileBonusGranted,
      profileBonusJustGranted: false,
      signupCreditsJustGranted: false,
    });
    watchCredits(uid);
    return {
      balance: previous.balance,
      profileBonusGranted: previous.profileBonusGranted,
      profileBonusJustGranted: false,
      signupCreditsJustGranted: false,
    };
  }

  let grantedProfileBonusInTx = false;
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(userRef);
    const txCurrent = snap.exists() ? snap.data()?.credits : null;
    const txNext = applyCreditGrants(txCurrent, profileRecord, options);
    const txPrevious = normalizeNode(txCurrent);
    grantedProfileBonusInTx = Boolean(options.grantProfileBonus && txNext.profileBonusJustGranted);
    if (snap.exists() && sameCreditNode(txPrevious, txNext.node)) return;
    tx.set(
      userRef,
      {
        credits: {
          ...txNext.node,
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
  const profileBonusJustGranted = grantedProfileBonusInTx;
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

function isFirestorePermissionDenied(err) {
  const code = String(err?.code || "");
  return code === "permission-denied" || code.includes("permission");
}

function demoCheckoutErrorMessage(err) {
  if (isFirestorePermissionDenied(err)) {
    return (
      "Firestore blocked saving the payment row. In Firebase Console → Firestore → Rules, " +
      "add the payments block from firestore.payments.rules.txt in this project, publish, then try again."
    );
  }
  return "Could not complete the demo payment. Try again.";
}

/**
 * Adds credits after a completed checkout. Updates `users/{uid}.credits`, then
 * writes a row to the top-level `payments` collection for purchase history.
 */
export async function addTopUpCredits(amount, pack = {}) {
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
  const paymentRef = doc(collection(db, "payments"));
  const authUser = getApps().length ? getAuth(getApps()[0]).currentUser : null;
  let storedAfterTopUp = null;
  let balanceBefore = 0;
  const now = new Date();
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef);
      const node = normalizeNode(snap.data()?.credits);
      if (!node.signupGranted) {
        const err = new Error("credits-missing");
        err.code = "ti/credits-missing";
        throw err;
      }
      balanceBefore = node.balance;
      storedAfterTopUp = {
        ...node,
        balance: node.balance + credits,
        updatedAt: now.toISOString(),
      };
      tx.set(userRef, { credits: storedAfterTopUp }, { merge: true });
    });
  } catch (err) {
    console.warn("[TomatoInsight] Demo checkout failed.", err);
    return {
      ok: false,
      code: "credits-unavailable",
      error: demoCheckoutErrorMessage(err),
    };
  }

  const paymentRecord = {
    uid,
    email: authUser?.email || "",
    packId: String(pack.packId || pack.id || "custom"),
    packName: String(pack.packName || pack.name || `${credits} credits`),
    credits,
    listPricePhp: Number(pack.listPricePhp ?? pack.listPriceUsd) || 0,
    amountChargedPhp: 0,
    currency: "PHP",
    status: "paid",
    method: "demo",
    isDemo: true,
    createdAt: now.toISOString(),
    createdAtMs: now.getTime(),
    balanceBefore,
    balanceAfter: storedAfterTopUp.balance,
  };

  let paymentSaved = true;
  let paymentSaveError = null;
  try {
    await setDoc(paymentRef, paymentRecord);
  } catch (err) {
    paymentSaved = false;
    paymentSaveError = err;
    console.warn("[TomatoInsight] Demo payment row not saved.", err);
  }

  const stored = normalizeNode(storedAfterTopUp);
  publish(uid, stored);
  const paymentRulesHint = paymentSaveError && isFirestorePermissionDenied(paymentSaveError);
  mountCreditToast({
    variant: "grant",
    title: `+${credits} credits added`,
    text: "",
    icon: "check",
    autoHideMs: 6500,
  });
  return {
    ok: true,
    balance: stored.balance,
    added: credits,
    paymentId: paymentSaved ? paymentRef.id : null,
    payment: paymentSaved ? { id: paymentRef.id, ...paymentRecord } : null,
    paymentSaved,
    paymentRulesHint,
  };
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
  applyCreditsFromLocalCache(currentUid());
}

function bindCreditsToAuth() {
  const apps = getApps();
  if (!apps.length) return;
  onAuthStateChanged(getAuth(apps[0]), (user) => {
    if (user?.uid) applyCreditsFromLocalCache(user.uid);
  });
}

let outOfCreditModalBound = false;
let creditTopUpClickBound = false;

function bindCreditTopUpButtons() {
  if (creditTopUpClickBound) return;
  creditTopUpClickBound = true;

  document.addEventListener("click", (event) => {
    const btn = event.target instanceof Element ? event.target.closest("[data-credit-pack], [data-credit-topup]") : null;
    if (!btn || !(btn instanceof HTMLButtonElement) || btn.disabled) return;
    event.preventDefault();
    const packId = btn.getAttribute("data-credit-pack");
    const amount = Number.parseInt(btn.getAttribute("data-credit-topup") || "", 10);
    if (window.TomatoInsightPayments?.openCheckout) {
      window.TomatoInsightPayments.openCheckout(packId || amount);
      return;
    }
    if (Number.isFinite(amount) && amount > 0) {
      addTopUpCredits(amount).then((result) => {
        if (result.ok) hideOutOfCreditModal();
        else showCreditToast(result.error || "Could not add credits.", "info");
      });
    }
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
  whenReady: whenCreditsReady,
  isReady: creditsAreReady,
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

bindCreditsToAuth();
restoreCachedBalance();
bindCreditTopUpButtons();
window.addEventListener("tomatoInsight:userDataReady", () => {
  const uid = currentUid();
  if (!uid) {
    creditsHydratePromise = Promise.resolve();
    return;
  }
  startCreditsHydrate(uid, readLocalProfile(uid));
});
window.addEventListener("tomatoInsight:userDataCleared", () => {
  stopWatchingCredits();
});
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", paintCredits);
} else {
  paintCredits();
}
