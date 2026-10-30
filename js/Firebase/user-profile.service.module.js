import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { getApps } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { syncProfileToRtdb } from "./user-data-sync.module.js";

const LOCAL_KEY = "tomatoInsight.userProfiles";

export function buildDisplayName({ firstName, middleInitial, lastName }) {
  const mi = middleInitial?.trim().toUpperCase();
  return [firstName?.trim(), mi || null, lastName?.trim()].filter(Boolean).join(" ");
}

export function parseDisplayName(displayName) {
  if (!displayName?.trim()) {
    return { firstName: "", middleInitial: "", lastName: "" };
  }
  const parts = displayName.trim().split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], middleInitial: "", lastName: "" };
  }
  if (parts.length === 2) {
    return { firstName: parts[0], middleInitial: "", lastName: parts[1] };
  }
  if (parts.length >= 3 && parts[1].length === 1) {
    return {
      firstName: parts[0],
      middleInitial: parts[1].toUpperCase(),
      lastName: parts.slice(2).join(" "),
    };
  }
  return { firstName: parts[0], middleInitial: "", lastName: parts.slice(1).join(" ") };
}

function readLocalMap() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeLocalProfile(uid, profile) {
  const map = readLocalMap();
  map[uid] = { ...profile, updatedAt: Date.now() };
  localStorage.setItem(LOCAL_KEY, JSON.stringify(map));
  window.TomatoInsightStorageSnapshot?.schedule?.();
}

function readLocalProfile(uid) {
  return readLocalMap()[uid] || null;
}

function sanitizePhoto(value) {
  const photo = String(value || "");
  if (!photo.startsWith("data:image/jpeg;base64,")) return "";
  if (photo.length > 180000) return "";
  return photo;
}

function normalizeProfile(raw) {
  return {
    firstName: String(raw?.firstName ?? "").trim(),
    middleInitial: String(raw?.middleInitial ?? "")
      .trim()
      .toUpperCase()
      .slice(0, 1),
    lastName: String(raw?.lastName ?? "").trim(),
    farmName: String(raw?.farmName ?? "").trim(),
    email: String(raw?.email ?? "").trim(),
    photo: sanitizePhoto(raw?.photo),
  };
}

function currentAuthEmail() {
  const apps = getApps();
  if (!apps.length) return "";
  return getAuth(apps[0]).currentUser?.email || "";
}

function firstNonEmpty(...values) {
  for (const v of values) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
}

export async function loadUserProfile(uid, authUser) {
  const fromSignUpDisplayName = parseDisplayName(authUser?.displayName);

  await window.TomatoInsightUserData?.whenReady?.();

  const local = readLocalProfile(uid);
  return normalizeProfile({
    firstName: firstNonEmpty(local?.firstName, fromSignUpDisplayName.firstName),
    middleInitial: firstNonEmpty(local?.middleInitial, fromSignUpDisplayName.middleInitial),
    lastName: firstNonEmpty(local?.lastName, fromSignUpDisplayName.lastName),
    farmName: firstNonEmpty(local?.farmName),
    email: firstNonEmpty(local?.email, authUser?.email),
    photo: local?.photo || "",
  });
}

export async function saveUserProfile(uid, profile, options = {}) {
  const { updateAuthDisplayName = true } = options;
  const existing = readLocalProfile(uid) || {};
  const data = normalizeProfile({
    ...profile,
    photo: profile.photo !== undefined ? profile.photo : existing.photo,
  });
  if (!data.firstName || !data.lastName) {
    return { ok: false, error: "First name and last name are required." };
  }
  if (data.middleInitial && !/^[A-Z]$/.test(data.middleInitial)) {
    return { ok: false, error: "Middle initial must be a single letter." };
  }

  data.email = data.email || currentAuthEmail();
  writeLocalProfile(uid, data);

  if (window.TOMATO_INSIGHT_FIREBASE_CONFIG?.projectId) {
    syncProfileToRtdb(uid, data, data.email).catch((err) => {
      console.warn("[TomatoInsight] Firestore profile save failed; saved locally only.", err);
    });
  }

  const displayName = buildDisplayName(data);
  if (updateAuthDisplayName) {
    const authResult = await window.TomatoInsightAuth?.updateDisplayName?.(displayName);
    if (authResult && !authResult.ok) {
      return { ok: false, error: authResult.error || "Could not update account name." };
    }
  }

  return { ok: true, profile: data, displayName };
}
