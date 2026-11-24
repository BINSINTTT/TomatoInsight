const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/Firebase/credits.module.js"), "utf8")
  .replace(/^import\s+.*?from\s+"[^"]+";\s*/gms, "")
  .replace(/^export /gm, "");

test("credit grants during verification are announced once on that user's visible dashboard", async () => {
  const storage = new Map();
  const accounts = new Map();
  const user = { uid: "new-farmer", emailVerified: false };
  function openPage() {
    const window = new EventTarget();
    window.TOMATO_INSIGHT_FIREBASE_CONFIG = { projectId: "test" };
    const document = Object.assign(new EventTarget(), { hidden: false, getElementById: () => null });
    const titles = [];
    vm.runInNewContext(source + "\nmountCreditToast = toast => titles.push(toast.title);", {
      window, document, titles, CustomEvent,
      localStorage: {
        getItem: key => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
      },
      getApps: () => [{}], getAuth: () => ({ currentUser: user }), onAuthStateChanged() {},
      isFarmSetupComplete: () => false, getFirestore: () => ({}), doc: (_db, _col, id) => id,
      getDoc: async id => ({ exists: () => accounts.has(id), data: () => accounts.get(id) }),
      runTransaction: async (_db, fn) => fn({
        get: async id => ({ exists: () => accounts.has(id), data: () => accounts.get(id) }),
        set: (id, record) => accounts.set(id, record),
      }),
      onSnapshot: () => () => {},
    });
    return { credits: window.TomatoInsightCredits, document, titles };
  }

  const verification = openPage();
  await verification.credits.ensureAccountCredits(user.uid, {});
  assert.equal(accounts.get(user.uid).credits.balance, 10);
  user.emailVerified = true;
  await verification.credits.ensureAccountCredits(user.uid, {});
  assert.deepEqual(verification.titles, []);

  // A second account can use the same browser before the original farmer returns.
  user.uid = "other-farmer";
  accounts.set(user.uid, { credits: { signupGranted: true, profileBonusGranted: true, balance: 15 } });
  const other = openPage();
  other.credits.onDashboardReady();
  await other.credits.ensureAccountCredits(user.uid, {});
  assert.deepEqual(other.titles, []);

  user.uid = "new-farmer";
  const dashboard = openPage();
  await dashboard.credits.ensureAccountCredits(user.uid, {});
  dashboard.document.hidden = true;
  dashboard.credits.onDashboardReady();
  assert.deepEqual(dashboard.titles, []);
  dashboard.document.hidden = false;
  dashboard.document.dispatchEvent(new Event("visibilitychange"));
  await dashboard.credits.ensureAccountCredits(user.uid, {});
  assert.deepEqual(dashboard.titles, ["Welcome credits added", "Earn 5 more credits"]);

  const refresh = openPage();
  refresh.credits.onDashboardReady();
  await refresh.credits.ensureAccountCredits(user.uid, {});
  assert.deepEqual(refresh.titles, []);
  assert.equal(accounts.get(user.uid).credits.balance, 10);
});
