/**
 * Firestore — per-user farmer account and farm data.
 *
 *   users/{uid}
 *     firstName, middleInitial, lastName, farmName, email, photo, updatedAt
 *     credits: { balance, signupGranted, profileBonusGranted, updatedAt }
 *     layout: { rows, columns, updatedAt }
 *     selectedFarmWeek
 *     plantNames: { "1": { name, diseaseLabel: [names], diseases: [{ name, pct }], recommendation }, ... }
 *   users/{uid}/tiles/{tileNum}
 *     saved scan, scores, week history, photo
 *   users/{uid}/deletions/{id}
 *     removed plant records shown in History
 *   payments/{paymentId}
 *     demo (and later paid) top-ups, queried separately from users.credits
 */
import { getApps } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  updateDoc,
  deleteField,
  runTransaction,
  onSnapshot,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

const LOCAL = {
  profiles: "tomatoInsight.userProfiles",
  layout: "tomatoInsight.farmLayout",
  tiles: "tomatoInsight.tilePlantInfo",
  plantNames: "tomatoInsight.plantNames",
  recommendations: "tomatoInsight.plantRecommendations",
  farmWeek: "tomatoInsight.selectedFarmWeek",
  deletions: "tomatoInsight.tileDeletions",
  scanCalendar: "tomatoInsight.scanCalendar",
};

const FARM_WEEK_FIRST = 4;
const FARM_WEEK_LAST = 12;
const TILE_DOC_LIMIT = 900000;
const HYDRATE_SESSION_KEY = "tomatoInsight.hydratedSession";

let activeUid = null;
let hydratePromise = Promise.resolve();
let stopFarmWatch = null;
let lastCloudJson = "";

function resolveSyncUid() {
  if (activeUid) return activeUid;
  const apps = getApps();
  if (!apps.length) return null;
  return getAuth(apps[0]).currentUser?.uid ?? null;
}

function fs() {
  const config = window.TOMATO_INSIGHT_FIREBASE_CONFIG;
  if (!config?.projectId || !getApps().length) return null;
  return getFirestore(getApps()[0]);
}

function userRef(uid) {
  return doc(fs(), "users", uid);
}

function tilesCol(uid) {
  return collection(fs(), "users", uid, "tiles");
}

function deletionsCol(uid) {
  return collection(fs(), "users", uid, "deletions");
}

export function rtdbWriteErrorMessage(error) {
  const code = error?.code || "";
  if (code === "permission-denied" || code === "PERMISSION_DENIED") {
    return (
      "Firestore denied the write. In Firebase Console → Firestore Database → Rules, " +
      "allow each signed-in user to read and write only users/{their uid}, including tiles and deletions, then Publish."
    );
  }
  if (code === "not-found") {
    return "Firestore database was not found. In Firebase Console create a Firestore database named (default) for this project.";
  }
  return error?.message || "Could not save to Firestore.";
}

function logCloudFailure(action, error) {
  console.error(`[TomatoInsight] Firestore ${action} failed:`, error?.code || error?.message || error);
  if (error?.code === "permission-denied" || error?.code === "PERMISSION_DENIED" || error?.code === "not-found") {
    console.error("[TomatoInsight]", rtdbWriteErrorMessage(error));
  }
}

function coalesceStr(...values) {
  for (const v of values) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
}

function coalesceMiddleInitial(...values) {
  for (const v of values) {
    const s = String(v ?? "")
      .trim()
      .toUpperCase();
    if (s) return s.slice(0, 1);
  }
  return "";
}

function sanitizePhoto(value) {
  const photo = String(value || "");
  if (!photo.startsWith("data:image/jpeg;base64,")) return "";
  if (photo.length > 180000) return "";
  return photo;
}

function mergePhoto(incoming, local, existing) {
  if (incoming && Object.prototype.hasOwnProperty.call(incoming, "photo")) {
    return sanitizePhoto(incoming.photo);
  }
  return sanitizePhoto(local?.photo) || sanitizePhoto(existing?.photo);
}

function mergeProfileFields(incoming, local, existing) {
  return {
    firstName: coalesceStr(incoming.firstName, local.firstName, existing.firstName),
    middleInitial: coalesceMiddleInitial(
      incoming.middleInitial,
      local.middleInitial,
      existing.middleInitial
    ),
    lastName: coalesceStr(incoming.lastName, local.lastName, existing.lastName),
    farmName: coalesceStr(incoming.farmName, local.farmName, existing.farmName),
    email: coalesceStr(incoming.email, local.email, existing.email),
    photo: mergePhoto(incoming, local, existing),
  };
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
  window.TomatoInsightStorageSnapshot?.schedule?.();
}

export function clearLocalUserFarmData() {
  activeUid = null;
  localStorage.removeItem(LOCAL.layout);
  localStorage.removeItem(LOCAL.tiles);
  localStorage.removeItem(LOCAL.plantNames);
  localStorage.removeItem(LOCAL.farmWeek);
  localStorage.removeItem(LOCAL.deletions);
  localStorage.removeItem(LOCAL.scanCalendar);
}

function writeLocalProfile(uid, profile) {
  const map = readJson(LOCAL.profiles, {});
  map[uid] = { ...profile, updatedAt: Date.now() };
  writeJson(LOCAL.profiles, map);
}

function readLocalProfile(uid) {
  const map = readJson(LOCAL.profiles, {});
  return map[uid] || null;
}

function readLocalFarmWeek() {
  try {
    const w = Number.parseInt(localStorage.getItem(LOCAL.farmWeek), 10);
    if (!Number.isNaN(w) && w >= FARM_WEEK_FIRST && w <= FARM_WEEK_LAST) return w;
  } catch {
    /* ignore */
  }
  return FARM_WEEK_FIRST;
}

function readScanCalendar() {
  const raw = readJson(LOCAL.scanCalendar, null);
  if (!raw || typeof raw !== "object") return null;
  return {
    enabled: Boolean(raw.enabled),
    anchor: raw.anchor || "",
    nextDue: raw.nextDue || "",
    selected: raw.selected || "",
  };
}

function readLocalDeletions() {
  const raw = readJson(LOCAL.deletions, []);
  return Array.isArray(raw) ? raw : [];
}

function captureLocalFarm() {
  return {
    layout: readJson(LOCAL.layout, null),
    plantNames: readJson(LOCAL.plantNames, {}),
    tiles: readJson(LOCAL.tiles, {}),
    selectedFarmWeek: readLocalFarmWeek(),
  };
}

function markHydrateSession(uid) {
  if (!uid) return;
  try {
    sessionStorage.setItem(HYDRATE_SESSION_KEY, JSON.stringify({ uid, at: Date.now() }));
  } catch {
    /* ignore */
  }
}

function clearHydrateSession() {
  try {
    sessionStorage.removeItem(HYDRATE_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/** True when this browser already has farm/profile data for the user (skip blocking hydrate). */
function hasLocalUserBundle(uid) {
  const profile = readLocalProfile(uid);
  if (profile?.firstName || profile?.lastName || profile?.farmName || profile?.photo) return true;
  const farm = captureLocalFarm();
  if (layoutValid(farm.layout)) return true;
  if (Object.keys(farm.plantNames || {}).length) return true;
  if (Object.keys(farm.tiles || {}).length) return true;
  if (readLocalDeletions().length) return true;
  return false;
}

function dispatchUserDataReady(uid, displayName, extra = {}) {
  window.dispatchEvent(
    new CustomEvent("tomatoInsight:userDataReady", {
      detail: { uid, displayName: displayName || "", ...extra },
    })
  );
}

/** Same-tab UI refresh after local saves (storage events only fire in other tabs). */
function notifyLocalFarmDataChange(source = "farm") {
  const uid = activeUid || resolveSyncUid() || "";
  const detail = { changed: true, local: true, source };
  window.dispatchEvent(new CustomEvent("tomatoInsight:farmDataChanged", { detail }));
  dispatchUserDataReady(uid, window.__tomatoInsightAccountName || "", detail);
}

export function shouldRefreshUiForUserDataEvent(detail) {
  const d = detail || {};
  if (d.fromCache) return false;
  if (d.background && !d.changed) return false;
  return true;
}

function layoutValid(layout) {
  return Boolean(layout && layout.rows >= 1 && layout.columns >= 1);
}

function layoutRecord(layout, { withUpdatedAt = false } = {}) {
  if (!layoutValid(layout)) return null;
  const record = { rows: Number(layout.rows), columns: Number(layout.columns) };
  if (withUpdatedAt) record.updatedAt = new Date().toISOString();
  return record;
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out = {};
    Object.keys(value)
      .sort()
      .forEach((key) => {
        if (value[key] !== undefined) out[key] = sortKeys(value[key]);
      });
    return out;
  }
  return value;
}

function firestoreSafe(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((item) => firestoreSafe(item) ?? null);
  if (typeof value === "object") {
    const out = {};
    Object.keys(value).forEach((key) => {
      if (!key || key.includes("/") || key.includes(".") || key.startsWith("__")) return;
      const next = firestoreSafe(value[key]);
      if (next !== undefined) out[key] = next;
    });
    return out;
  }
  return null;
}

function jsonSize(value) {
  try {
    return JSON.stringify(value).length;
  } catch {
    return TILE_DOC_LIMIT + 1;
  }
}

function tileForFirestore(info, tileId) {
  const safe = firestoreSafe(info) || {};
  const recommendation = recommendationRecord(readJson(LOCAL.recommendations, {})[String(tileId)]);
  if (recommendation) safe.recommendation = recommendationForCloud(recommendation);
  if (jsonSize(safe) <= TILE_DOC_LIMIT) return safe;
  if (safe.weeks && typeof safe.weeks === "object") {
    Object.values(safe.weeks).forEach((week) => {
      if (week && typeof week === "object") week.imageDataUrl = null;
    });
  }
  if (jsonSize(safe) <= TILE_DOC_LIMIT) return safe;
  safe.imageDataUrl = null;
  return safe;
}

function profilePayload(profile, email) {
  const merged = mergeProfileFields(profile || {}, {}, {});
  return {
    ...merged,
    email: coalesceStr(email, merged.email),
    photo: sanitizePhoto(merged.photo),
    updatedAt: new Date().toISOString(),
  };
}

const SCORE_KEYS = ["healthy", "tlcv", "early_blight", "spotted_wilt"];
const DISEASE_LABELS = {
  healthy: "Healthy",
  tlcv: "TLCV",
  early_blight: "Early blight",
  spotted_wilt: "Spotted wilt",
};

function plantNameText(value) {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && typeof value.name === "string") return value.name.trim();
  return "";
}

function deletedTileIdsWithoutScan(tiles, deletions) {
  const gone = new Set();
  (Array.isArray(deletions) ? deletions : []).forEach((entry) => {
    const id = String(entry?.tileNum ?? entry?.tileNumber ?? "");
    if (!id || (tiles && tiles[id])) return;
    gone.add(id);
  });
  return gone;
}

function namesForLocal(plantNames, tiles, deletions) {
  const gone = deletedTileIdsWithoutScan(tiles, deletions);
  const out = {};
  Object.entries(plantNames || {}).forEach(([id, value]) => {
    if (gone.has(String(id))) return;
    const name = plantNameText(value);
    if (name) out[String(id)] = name;
  });
  Object.entries(tiles || {}).forEach(([id, info]) => {
    if (gone.has(String(id)) || out[String(id)]) return;
    const name = plantNameText(info?.plantName);
    if (name) out[String(id)] = name;
  });
  return out;
}

const DISEASE_KEYS = ["tlcv", "early_blight", "spotted_wilt"];

function roundScore(value) {
  return Math.round(Math.min(100, Math.max(0, Number(value) || 0)) * 10) / 10;
}

/** Every disease above 0%. Healthy is a score row, not a disease label. */
function detectedDiseasesForTile(info) {
  const scores = info?.scores && typeof info.scores === "object" ? info.scores : null;
  if (scores) {
    return DISEASE_KEYS.map((key) => ({
      name: DISEASE_LABELS[key],
      pct: roundScore(scores[key]),
    }))
      .filter((item) => item.name && item.pct > 0)
      .sort((a, b) => b.pct - a.pct);
  }
  const storedKey = String(info?.topBarKey || "");
  if (DISEASE_KEYS.includes(storedKey) && Number(info?.topPct) > 0) {
    return [{ name: DISEASE_LABELS[storedKey], pct: roundScore(info.topPct) }];
  }
  return [];
}

function healthyRecordForTile(info) {
  const scores = info?.scores && typeof info.scores === "object" ? info.scores : null;
  if (scores && Object.prototype.hasOwnProperty.call(scores, "healthy")) {
    return { pct: roundScore(scores.healthy) };
  }
  if (String(info?.topBarKey || "") === "healthy") {
    return { pct: roundScore(info.topPct) };
  }
  return null;
}

function diseaseNameList(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => (item && typeof item === "object" ? item.name : item))
      .map((item) => String(item || "").trim())
      .filter((name) => name && barKeyForLabel(name) !== "healthy");
  }
  const text = String(value || "").trim();
  if (!text || barKeyForLabel(text) === "healthy") return [];
  return [text];
}

function recommendationRecord(value) {
  if (!value || typeof value !== "object") return null;
  const summary = String(value.summary || "").trim().slice(0, 800);
  const actionSteps = Array.isArray(value.actionSteps)
    ? value.actionSteps.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 12)
    : [];
  if (!summary && !actionSteps.length) return null;
  const record = {
    diseaseName: String(value.diseaseName || "").trim().slice(0, 80),
    urgencyNote: String(value.urgencyNote || "").trim().slice(0, 240),
    summary,
    actionSteps,
    preventionTips: Array.isArray(value.preventionTips)
      ? value.preventionTips.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 8)
      : [],
    isCriticalRemoval: Boolean(value.isCriticalRemoval),
  };
  const scoresKey = String(value.scoresKey || "").trim().slice(0, 200);
  if (scoresKey) record.scoresKey = scoresKey;
  const topBarKey = String(value.topBarKey || "").trim();
  if (SCORE_KEYS.includes(topBarKey)) record.topBarKey = topBarKey;
  const topPct = Math.round(Math.min(100, Math.max(0, Number(value.topPct) || 0)) * 10) / 10;
  if (topPct > 0) record.topPct = topPct;
  if (value.source === "groq" || value.source === "rules") record.source = value.source;
  const savedAt = String(value.savedAt || "").trim();
  if (savedAt) record.savedAt = savedAt;
  if (value.scores && typeof value.scores === "object") {
    const scores = {};
    SCORE_KEYS.forEach((key) => {
      scores[key] = Math.round(Math.min(100, Math.max(0, Number(value.scores[key]) || 0)) * 10) / 10;
    });
    record.scores = scores;
  }
  if (!record.diseaseName && record.topBarKey) {
    record.diseaseName = DISEASE_LABELS[record.topBarKey] || "";
  }
  return record;
}

function recommendationForCloud(record) {
  if (!record) return null;
  const next = { ...record };
  const label = barKeyForLabel(next.diseaseName);
  if (label === "healthy" || next.topBarKey === "healthy") delete next.diseaseName;
  return next;
}

function recommendationsForLocal(plantNames, tiles) {
  const out = {};
  Object.entries(tiles && typeof tiles === "object" ? tiles : {}).forEach(([id, info]) => {
    const recommendation = recommendationRecord(info?.recommendation);
    if (recommendation) out[String(id)] = recommendation;
  });
  Object.entries(plantNames && typeof plantNames === "object" ? plantNames : {}).forEach(([id, value]) => {
    const recommendation = recommendationRecord(value && value.recommendation);
    if (recommendation) out[String(id)] = recommendation;
  });
  return out;
}

function barKeyForLabel(label) {
  const key = String(label || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (!key) return "";
  if (key.includes("healthy")) return "healthy";
  if (key.includes("earlyblight")) return "early_blight";
  if (key.includes("spottedwilt") || key === "tswv") return "spotted_wilt";
  if (key.includes("yellowleafcurl") || key === "tlcv" || key.includes("tylcv")) return "tlcv";
  return "";
}

function samePlantResult(leftLabel, leftPct, rightLabel, rightPct) {
  const leftKey = barKeyForLabel(leftLabel);
  const rightKey = barKeyForLabel(rightLabel);
  if (leftKey && rightKey && leftKey !== rightKey) return false;
  if (!leftKey || !rightKey) {
    const left = String(leftLabel || "").trim().toLowerCase();
    const right = String(rightLabel || "").trim().toLowerCase();
    if (left && right && left !== right) return false;
  }
  const a = Number(leftPct) || 0;
  const b = Number(rightPct) || 0;
  if (a > 0 && b > 0 && Math.abs(a - b) > 0.55) return false;
  return true;
}

function mergePlantEntry(entry, previous) {
  const scored = Boolean(entry.scored);
  const next = { ...entry };
  delete next.scored;
  delete next.diseasePct;
  const names = diseaseNameList(next.diseaseLabel);
  if (!scored && !names.length && previous && typeof previous === "object") {
    const keptNames = diseaseNameList(previous.diseaseLabel);
    if (keptNames.length) next.diseaseLabel = keptNames;
    if (Array.isArray(previous.diseases) && previous.diseases.length) next.diseases = previous.diseases;
    if (previous.healthy && typeof previous.healthy === "object") next.healthy = previous.healthy;
  }
  if (next.recommendation || !previous || typeof previous !== "object") return next;
  const kept = recommendationRecord(previous.recommendation);
  if (!kept) return next;
  const currentNames = diseaseNameList(next.diseaseLabel);
  const recommendationKey = barKeyForLabel(kept.diseaseName);
  const stillDetected =
    !currentNames.length ||
    currentNames.some((name) => barKeyForLabel(name) === recommendationKey);
  if (!stillDetected) return next;
  next.recommendation = recommendationForCloud(kept);
  return next;
}

function plantNamesForFirestore(names, tiles) {
  const source = names && typeof names === "object" ? names : {};
  const tileMap = tiles && typeof tiles === "object" ? tiles : {};
  const stored = readJson(LOCAL.recommendations, {});
  const out = {};
  const ids = new Set([...Object.keys(source), ...Object.keys(tileMap)]);
  ids.forEach((id) => {
    const name = plantNameText(source[id]) || plantNameText(tileMap[id]?.plantName);
    if (!name) return;
    const tile = tileMap[String(id)];
    const diseases = detectedDiseasesForTile(tile);
    const entry = { name, scored: Boolean(tile?.scores) };
    const healthy = healthyRecordForTile(tile);
    if (healthy) entry.healthy = healthy;
    if (diseases.length) {
      entry.diseaseLabel = diseases.map((item) => item.name);
      entry.diseases = diseases;
    }
    const recommendation =
      recommendationRecord(stored[String(id)]) ||
      recommendationRecord(source[id] && typeof source[id] === "object" ? source[id].recommendation : null) ||
      recommendationRecord(tileMap[id]?.recommendation);
    if (recommendation) entry.recommendation = recommendationForCloud(recommendation);
    out[String(id)] = entry;
  });
  return out;
}

function farmFromDoc(data, tiles) {
  const source = data || {};
  let selectedFarmWeek = Number(source.selectedFarmWeek);
  if (
    Number.isNaN(selectedFarmWeek) ||
    selectedFarmWeek < FARM_WEEK_FIRST ||
    selectedFarmWeek > FARM_WEEK_LAST
  ) {
    selectedFarmWeek = readLocalFarmWeek();
  }
  return {
    layout: layoutRecord(source.layout),
    plantNames: source.plantNames && typeof source.plantNames === "object" ? source.plantNames : {},
    tiles: tiles && typeof tiles === "object" ? tiles : {},
    selectedFarmWeek,
  };
}

function tileSavedAtMs(info) {
  if (!info || typeof info !== "object") return 0;
  const raw = info.savedAt || info.updatedAt || "";
  const ms = Date.parse(String(raw));
  return Number.isNaN(ms) ? 0 : ms;
}

/** Prefer newer saved scans. Drop plants that were deleted in Firestore. */
function mergeTileRecords(localTiles, remoteTiles, deletions) {
  const local = localTiles && typeof localTiles === "object" ? localTiles : {};
  const remote = remoteTiles && typeof remoteTiles === "object" ? remoteTiles : {};
  const gone = deletedTileIdsWithoutScan(remote, deletions);
  const ids = new Set([...Object.keys(local), ...Object.keys(remote)]);
  const merged = {};
  ids.forEach((id) => {
    if (gone.has(String(id))) return;
    const left = local[id];
    const right = remote[id];
    if (left && right) {
      merged[id] = tileSavedAtMs(left) >= tileSavedAtMs(right) ? left : right;
      return;
    }
    if (right) {
      merged[id] = right;
      return;
    }
    if (left) merged[id] = left;
  });
  return merged;
}

function applyFarmToLocal(farm, deletions) {
  const localTiles = readJson(LOCAL.tiles, {});
  const mergedTiles = mergeTileRecords(localTiles, farm.tiles, deletions);

  if (layoutValid(farm.layout)) {
    writeJson(LOCAL.layout, layoutRecord(farm.layout));
  } else if (!Object.keys(mergedTiles).length) {
    localStorage.removeItem(LOCAL.layout);
  }

  if (farm.plantNames && typeof farm.plantNames === "object") {
    writeJson(LOCAL.plantNames, namesForLocal(farm.plantNames, mergedTiles, deletions));
    writeJson(LOCAL.recommendations, recommendationsForLocal(farm.plantNames, mergedTiles));
  } else if (!Object.keys(mergedTiles).length) {
    localStorage.removeItem(LOCAL.plantNames);
    localStorage.removeItem(LOCAL.recommendations);
  }

  if (Object.keys(mergedTiles).length) {
    writeJson(LOCAL.tiles, mergedTiles);
  } else {
    localStorage.removeItem(LOCAL.tiles);
  }

  localStorage.setItem(LOCAL.farmWeek, String(farm.selectedFarmWeek ?? FARM_WEEK_FIRST));
}

function applyDeletionsToLocal(deletions) {
  writeJson(LOCAL.deletions, Array.isArray(deletions) ? deletions : []);
}

function applyCloudBundle(uid, bundle, { notify } = {}) {
  const farm = farmFromDoc(bundle.user, bundle.tiles);
  const profile = mergeProfileFields(bundle.user || {}, readLocalProfile(uid) || {}, {});
  const deletions = Array.isArray(bundle.deletions) ? bundle.deletions : [];
  const signature = JSON.stringify(sortKeys({ profile, farm, deletions, scanCalendar: bundle.user?.scanCalendar || null }));
  if (signature === lastCloudJson) return false;
  lastCloudJson = signature;
  if (bundle.user) writeLocalProfile(uid, { ...profile, email: coalesceStr(bundle.user.email, profile.email) });
  applyFarmToLocal(farm, deletions);
  applyDeletionsToLocal(deletions);
  if (bundle.user?.scanCalendar && typeof bundle.user.scanCalendar === "object") {
    writeJson(LOCAL.scanCalendar, bundle.user.scanCalendar);
  }
  if (notify) {
    dispatchUserDataReady(activeUid, window.__tomatoInsightAccountName || "", {
      live: true,
      changed: true,
    });
  }
  return true;
}

async function commitOps(ops) {
  const db = fs();
  if (!db || !ops.length) return;
  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(db);
    ops.slice(i, i + 400).forEach((op) => op(batch));
    await batch.commit();
  }
}

async function writeTiles(uid, tiles) {
  const existing = await getDocs(tilesCol(uid));
  const localIds = new Set(Object.keys(tiles || {}));
  const ops = [];
  existing.forEach((snap) => {
    if (!localIds.has(snap.id)) {
      const ref = snap.ref;
      ops.push((batch) => batch.delete(ref));
    }
  });
  Object.entries(tiles || {}).forEach(([id, info]) => {
    const ref = doc(tilesCol(uid), id);
    ops.push((batch) => batch.set(ref, tileForFirestore(info)));
  });
  await commitOps(ops);
}

async function writeDeletions(uid, deletions) {
  const list = Array.isArray(deletions) ? deletions : [];
  const existing = await getDocs(deletionsCol(uid));
  const localIds = new Set(list.map((entry) => String(entry?.id || "")).filter(Boolean));
  const ops = [];
  existing.forEach((snap) => {
    if (!localIds.has(snap.id)) {
      const ref = snap.ref;
      ops.push((batch) => batch.delete(ref));
    }
  });
  list.forEach((entry) => {
    if (!entry?.id) return;
    const ref = doc(deletionsCol(uid), String(entry.id));
    ops.push((batch) => batch.set(ref, firestoreSafe(entry)));
  });
  await commitOps(ops);
}

async function writeUserDoc(uid, fields) {
  const payload = firestoreSafe(fields);
  if (!payload || !Object.keys(payload).length) return;
  await setDoc(userRef(uid), payload, { merge: true });
}

async function readCloudBundle(uid) {
  const userSnap = await getDoc(userRef(uid));
  const user = userSnap.exists() ? userSnap.data() : null;
  const tilesSnap = await getDocs(tilesCol(uid));
  const tiles = {};
  tilesSnap.forEach((snap) => {
    tiles[snap.id] = snap.data();
  });
  const deletionSnap = await getDocs(deletionsCol(uid));
  const deletions = [];
  deletionSnap.forEach((snap) => deletions.push({ id: snap.id, ...snap.data() }));
  deletions.sort((a, b) => String(b.deletedAt || "").localeCompare(String(a.deletedAt || "")));
  return { user, tiles, deletions };
}

function hasCloudData(bundle) {
  const user = bundle?.user;
  if (user && (user.firstName || user.lastName || user.farmName || user.email || user.layout)) return true;
  if (user?.plantNames && Object.keys(user.plantNames).length) return true;
  if (bundle?.tiles && Object.keys(bundle.tiles).length) return true;
  if (bundle?.deletions?.length) return true;
  return false;
}

async function uploadLocalBundle(uid, email) {
  const profile = readLocalProfile(uid) || {};
  const farm = captureLocalFarm();
  const deletions = readLocalDeletions();
  const userFields = {
    ...profilePayload(profile, email),
    layout: layoutRecord(farm.layout, { withUpdatedAt: true }),
    selectedFarmWeek: farm.selectedFarmWeek,
    plantNames: firestoreSafe(plantNamesForFirestore(farm.plantNames, farm.tiles)) || {},
    scanCalendar: readScanCalendar(),
  };
  await writeUserDoc(uid, userFields);
  await writeTiles(uid, farm.tiles);
  await writeDeletions(uid, deletions);
  return {
    user: userFields,
    tiles: farm.tiles,
    deletions,
  };
}

/** Create or update the farmer account. Safe on sign-up. */
export async function bootstrapUserInRtdb(uid, email, profile = {}) {
  if (!fs() || !uid) {
    const err = new Error("Firestore is not available.");
    err.code = "not-found";
    throw err;
  }
  activeUid = uid;
  const existingSnap = await getDoc(userRef(uid));
  const existing = existingSnap.exists() ? existingSnap.data() : {};
  const local = readLocalProfile(uid) || {};
  const merged = mergeProfileFields({ ...profile, email: email || profile.email || "" }, local, existing);
  const payload = profilePayload(merged, email || existing.email);
  await writeUserDoc(uid, payload);
  writeLocalProfile(uid, payload);
}

export async function flushLocalFarmToRtdb(uid) {
  const id = uid || resolveSyncUid();
  if (!id || !fs()) return;
  const profile = readLocalProfile(id) || {};
  const farm = captureLocalFarm();
  const deletions = readLocalDeletions();
  await writeUserDoc(id, {
    ...profilePayload(profile, profile.email),
    layout: layoutRecord(farm.layout, { withUpdatedAt: true }),
    selectedFarmWeek: farm.selectedFarmWeek,
    scanCalendar: readScanCalendar(),
  });
  await writePlantNamesFromLocal(id);
  await writeTiles(id, farm.tiles);
  await writeDeletions(id, deletions);
}

export async function hydrateUserFromRtdb(uid, email) {
  if (!fs() || !uid) {
    activeUid = uid || null;
    return { ok: false, reason: "no-database" };
  }

  activeUid = uid;
  const remote = await readCloudBundle(uid);

  if (hasCloudData(remote)) {
    const changed = applyCloudBundle(uid, remote);
    const local = readLocalProfile(uid) || {};
    const remoteName = remote.user?.firstName || remote.user?.lastName || remote.user?.farmName;
    if ((local.firstName || local.lastName || local.farmName) && !remoteName) {
      await bootstrapUserInRtdb(uid, email, local);
    } else if (email && remote.user && !remote.user.email) {
      await writeUserDoc(uid, { email });
    }
    try {
      await syncPlantNamesToRtdb(uid);
    } catch (err) {
      logCloudFailure("syncPlantNames", err);
    }
    return { ok: true, source: "remote", changed: Boolean(changed) };
  }

  const localFarm = captureLocalFarm();
  const localProfile = readLocalProfile(uid) || {};
  const hasLocal =
    localFarm.layout ||
    Object.keys(localFarm.plantNames || {}).length ||
    Object.keys(localFarm.tiles || {}).length ||
    readLocalDeletions().length ||
    localProfile.firstName ||
    localProfile.farmName;

  if (hasLocal) {
    const uploaded = await uploadLocalBundle(uid, email);
    const changed = applyCloudBundle(uid, uploaded);
    return { ok: true, source: "migrated-local", changed: Boolean(changed) };
  }

  await bootstrapUserInRtdb(uid, email, localProfile);
  clearLocalUserFarmData();
  activeUid = uid;
  const cached = readLocalProfile(uid) || localProfile;
  writeLocalProfile(uid, {
    firstName: cached.firstName || "",
    middleInitial: cached.middleInitial || "",
    lastName: cached.lastName || "",
    farmName: cached.farmName || "",
    email: email || cached.email || "",
    photo: sanitizePhoto(cached.photo),
  });
  localStorage.setItem(LOCAL.farmWeek, String(FARM_WEEK_FIRST));
  applyDeletionsToLocal([]);
  return { ok: true, source: "initialized-empty" };
}

export function getActiveUid() {
  return activeUid;
}

export async function syncProfileToRtdb(uid, profile, email) {
  await bootstrapUserInRtdb(uid, email, profile);
}

export async function syncLayoutToRtdb(uid, layout) {
  if (!fs() || !uid || !layout) return;
  await writeUserDoc(uid, { layout: layoutRecord(layout, { withUpdatedAt: true }) });
}

async function writePlantNamesFromLocal(uid) {
  const user = userRef(uid);
  await runTransaction(fs(), async (tx) => {
    const snap = await tx.get(user);
    if (!snap.exists()) return;
    const cloud = snap.get("plantNames");
    const merged = cloud && typeof cloud === "object" ? { ...cloud } : {};
    const localNames = readJson(LOCAL.plantNames, {});
    const localTiles = readJson(LOCAL.tiles, {});
    const built = plantNamesForFirestore(localNames, localTiles);
    const gone = deletedTileIdsWithoutScan(localTiles, readLocalDeletions());
    Object.entries(built).forEach(([id, entry]) => {
      merged[id] = mergePlantEntry(entry, merged[id]);
    });
    const stored = readJson(LOCAL.recommendations, {});
    Object.keys(merged).forEach((id) => {
      if (gone.has(String(id))) {
        delete merged[id];
        return;
      }
      const current = merged[id];
      if (!current || typeof current !== "object" || built[id]) return;
      const recommendation = recommendationForCloud(recommendationRecord(stored[id]));
      if (recommendation) merged[id] = { ...current, recommendation };
    });
    tx.set(user, { plantNames: firestoreSafe(merged) || {} }, { merge: true });
  });
}

export async function syncPlantNamesToRtdb(uid) {
  if (!fs() || !uid) return;
  await writePlantNamesFromLocal(uid);
}

export async function syncTileToRtdb(uid, tileNum, info) {
  if (!fs() || !uid) return;
  const ref = doc(tilesCol(uid), String(tileNum));
  const id = String(tileNum);
  if (!info) {
    await deleteDoc(ref);
    await updateDoc(userRef(uid), { [`plantNames.${id}`]: deleteField() });
    return;
  }
  await setDoc(ref, tileForFirestore(info, id));
  const names = plantNamesForFirestore(readJson(LOCAL.plantNames, {}), readJson(LOCAL.tiles, {}));
  const entry = names[id];
  if (entry) {
    const payload = { ...entry };
    delete payload.scored;
    await updateDoc(userRef(uid), { [`plantNames.${id}`]: firestoreSafe(payload) });
  }
}

export async function syncScanCalendarToCloud(uid) {
  const id = uid || resolveSyncUid();
  if (!fs() || !id) return;
  await writeUserDoc(id, { scanCalendar: readScanCalendar() });
}

export async function syncSelectedFarmWeekToRtdb(uid, weekNumber) {
  if (!fs() || !uid) return;
  await writeUserDoc(uid, { selectedFarmWeek: weekNumber });
}

export async function syncDeletionsToCloud(uid) {
  const id = uid || resolveSyncUid();
  if (!fs() || !id) return;
  await writeDeletions(id, readLocalDeletions());
}

function stopWatchingFarm() {
  if (stopFarmWatch) {
    stopFarmWatch();
    stopFarmWatch = null;
  }
}

function watchUserFarm(uid) {
  stopWatchingFarm();
  const db = fs();
  if (!db || !uid) return;
  const state = { user: null, tiles: null, deletions: null };
  const seen = { user: false, tiles: false, deletions: false };
  const apply = () => {
    if (activeUid !== uid || !seen.user || !seen.tiles || !seen.deletions) return;
    applyCloudBundle(uid, state, { notify: true });
  };
  const unsubUser = onSnapshot(
    userRef(uid),
    (snap) => {
      state.user = snap.exists() ? snap.data() : null;
      seen.user = true;
      apply();
    },
    (err) => logCloudFailure("watchUser", err)
  );
  const unsubTiles = onSnapshot(
    tilesCol(uid),
    (snap) => {
      const tiles = {};
      snap.forEach((item) => {
        tiles[item.id] = item.data();
      });
      state.tiles = tiles;
      seen.tiles = true;
      apply();
    },
    (err) => logCloudFailure("watchTiles", err)
  );
  const unsubDeletions = onSnapshot(
    deletionsCol(uid),
    (snap) => {
      const deletions = [];
      snap.forEach((item) => deletions.push({ id: item.id, ...item.data() }));
      deletions.sort((a, b) => String(b.deletedAt || "").localeCompare(String(a.deletedAt || "")));
      state.deletions = deletions;
      seen.deletions = true;
      apply();
    },
    (err) => logCloudFailure("watchDeletions", err)
  );
  stopFarmWatch = () => {
    unsubUser();
    unsubTiles();
    unsubDeletions();
  };
}

function registerGlobalBridge() {
  window.TomatoInsightUserData = {
    getActiveUid() {
      return activeUid;
    },
    syncLayout(layout) {
      const uid = resolveSyncUid();
      if (!uid || !layout) return Promise.resolve();
      return syncLayoutToRtdb(uid, layout).catch((err) => {
        logCloudFailure("syncLayout", err);
      });
    },
    syncTile(tileNum) {
      const uid = resolveSyncUid();
      if (!uid) return Promise.resolve();
      const tiles = readJson(LOCAL.tiles, {});
      const info = tiles[String(tileNum)] || null;
      return syncTileToRtdb(uid, tileNum, info).catch((err) => {
        logCloudFailure("syncTile", err);
      });
    },
    syncPlantNames() {
      const uid = resolveSyncUid();
      if (!uid) return Promise.resolve();
      return syncPlantNamesToRtdb(uid).catch((err) => {
        logCloudFailure("syncPlantNames", err);
      });
    },
    syncFarmWeek(weekNumber) {
      const uid = resolveSyncUid();
      if (!uid) return Promise.resolve();
      return syncSelectedFarmWeekToRtdb(uid, weekNumber).catch((err) => {
        logCloudFailure("syncFarmWeek", err);
      });
    },
    syncScanCalendar() {
      const uid = resolveSyncUid();
      if (!uid) return Promise.resolve();
      return syncScanCalendarToCloud(uid).catch((err) => {
        logCloudFailure("syncScanCalendar", err);
      });
    },
    syncDeletions() {
      const uid = resolveSyncUid();
      if (!uid) return Promise.resolve();
      return syncDeletionsToCloud(uid).catch((err) => {
        logCloudFailure("syncDeletions", err);
      });
    },
    flushFarmToCloud() {
      const uid = resolveSyncUid();
      if (!uid) return Promise.resolve();
      return flushLocalFarmToRtdb(uid).catch((err) => {
        logCloudFailure("flushFarm", err);
      });
    },
    whenReady() {
      return hydratePromise;
    },
    shouldRefreshUiForUserDataEvent(detail) {
      return shouldRefreshUiForUserDataEvent(detail);
    },
    notifyLocalChange(source) {
      notifyLocalFarmDataChange(source);
    },
  };
}

function afterHydrate(uid, displayName, result) {
  if (result?.ok !== false) markHydrateSession(uid);
  if (activeUid === uid) watchUserFarm(uid);
  return result;
}

function runBlockingHydrate(uid, email, displayName) {
  return hydrateUserFromRtdb(uid, email)
    .catch((err) => {
      logCloudFailure("hydrate", err);
      return { ok: false, reason: err?.code || "hydrate-failed", error: err };
    })
    .then((result) => {
      afterHydrate(uid, displayName, result);
      dispatchUserDataReady(uid, displayName, {
        background: false,
        changed: Boolean(result?.changed),
      });
      return result;
    });
}

function runBackgroundHydrate(uid, email, displayName) {
  return flushLocalFarmToRtdb(uid)
    .catch((err) => {
      logCloudFailure("flush-before-hydrate", err);
    })
    .then(() => hydrateUserFromRtdb(uid, email))
    .catch((err) => {
      logCloudFailure("hydrate", err);
      return { ok: false, reason: err?.code || "hydrate-failed", error: err };
    })
    .then((result) => {
      afterHydrate(uid, displayName, result);
      dispatchUserDataReady(uid, displayName, {
        background: true,
        changed: Boolean(result?.changed),
      });
      return result;
    });
}

export function bindUserDataSync(auth) {
  registerGlobalBridge();
  auth.onAuthStateChanged((user) => {
    stopWatchingFarm();
    lastCloudJson = "";
    if (user) {
      window.__tomatoInsightAccountName = user.displayName || "";
      const uid = user.uid;
      const displayName = user.displayName || "";
      activeUid = uid;

      if (hasLocalUserBundle(uid)) {
        hydratePromise = Promise.resolve({ ok: true, source: "local-cache" });
        const announce = () => dispatchUserDataReady(uid, displayName, { fromCache: true });
        if (typeof queueMicrotask === "function") queueMicrotask(announce);
        else window.setTimeout(announce, 0);
        void runBackgroundHydrate(uid, user.email, displayName);
        return;
      }

      hydratePromise = runBlockingHydrate(uid, user.email, displayName);
      return;
    }

    hydratePromise = Promise.resolve();
    clearHydrateSession();
    const uid = activeUid || resolveSyncUid();
    const pending = uid ? flushLocalFarmToRtdb(uid) : Promise.resolve();
    clearLocalUserFarmData();
    window.dispatchEvent(new CustomEvent("tomatoInsight:userDataCleared"));
    pending.catch((err) => {
      logCloudFailure("flush-on-signout", err);
    });
  });
}
