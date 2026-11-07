# TomatoInsight — Data Tables

This document lists **all data stored and used** by the project.  
Cloud storage is **Firestore** (plus **Firebase Authentication**). The browser also keeps a **localStorage** mirror for offline/fast UI.

> Note: The conceptual ERD (User → Plant → Scan → Disease Result, Subscription → Payment) maps to the structures below. TomatoInsight uses farm **tiles** instead of a separate Plant table, and **credits** instead of a Subscription table.

---

## Storage overview

| Layer | Path / key | Purpose |
| --- | --- | --- |
| Firebase Auth | Auth users | Login identity (`uid`, email, password) |
| Firestore | `users/{uid}` | Profile, credits, farm layout, plant names, week, scan calendar |
| Firestore | `users/{uid}/tiles/{tileNum}` | Saved scans, scores, week history, leaf photo |
| Firestore | `users/{uid}/deletions/{id}` | Deleted plant/tile history |
| Firestore | `payments/{paymentId}` | Demo credit purchases |
| Browser | `localStorage` | Local cache of the same farm/profile data |

---

## 1. Firebase Auth — User account

| Field | Type | Key | Description |
| --- | --- | --- | --- |
| `uid` | string | **PK** | Firebase Auth user id (also Firestore `users` document id) |
| `email` | string | | Sign-in email |
| `password` | string | | Handled by Firebase Auth (not stored in Firestore) |
| `displayName` | string | | Optional display name from signup |

**Relationships**

- 1 Auth user → 1 Firestore `users/{uid}` document  
- 1 Auth user → many `payments` rows (`uid`)  
- 1 Auth user → many `tiles` and `deletions` subdocuments  

---

## 2. Firestore — `users` (User / farmer account)

**Document id:** `uid` (**PK**)

| Field | Type | Key | Description |
| --- | --- | --- | --- |
| `uid` | string | **PK** | Same as Firebase Auth uid (document id) |
| `firstName` | string | | Given name |
| `middleInitial` | string | | Single letter |
| `lastName` | string | | Family name |
| `farmName` | string | | Farm display name |
| `email` | string | | Account email |
| `photo` | string | | Profile photo (`data:image/jpeg;base64,...`, size-capped) |
| `updatedAt` | string (ISO) | | Last profile update |
| `credits` | map | | Credit balance and grant flags (see table 2a) |
| `layout` | map | | Farm grid size (see table 2b) |
| `selectedFarmWeek` | number | | Active farm week (4–12) |
| `plantNames` | map | | Per-tile plant summary (see table 2c) |
| `scanCalendar` | map | | Optional scan schedule (see table 2d) |

**Relationships**

- 1 `users` → many `users/{uid}/tiles`  
- 1 `users` → many `users/{uid}/deletions`  
- 1 `users` → many `payments` (via `uid`)  

### 2a. Nested — `users.credits`

| Field | Type | Description |
| --- | --- | --- |
| `balance` | number | Current scan credits |
| `signupGranted` | boolean | `true` after one-time +10 signup credits |
| `profileBonusGranted` | boolean | `true` after one-time +5 farm-setup bonus |
| `updatedAt` | string (ISO) | Last credit change |

### 2b. Nested — `users.layout`

| Field | Type | Description |
| --- | --- | --- |
| `rows` | number | Farm grid rows |
| `columns` | number | Farm grid columns |
| `updatedAt` | string (ISO) / number | Last layout save |

### 2c. Nested — `users.plantNames["{tileNum}"]`

| Field | Type | Description |
| --- | --- | --- |
| `name` | string | Plant / tile name |
| `diseaseLabel` | string[] | Detected disease names |
| `diseases` | array | `{ name, pct }` (and related score fields) |
| `healthy` | map | Healthy score summary when present |
| `recommendation` | map | Treatment guide (see Intervention / recommendation) |

### 2d. Nested — `users.scanCalendar`

| Field | Type | Description |
| --- | --- | --- |
| `enabled` | boolean | Custom scan schedule on/off |
| `anchor` | string (YYYY-MM-DD) | Schedule start date |
| `nextDue` | string (YYYY-MM-DD) | Next due scan date |
| `selected` | string (YYYY-MM-DD) | Selected scan day |

---

## 3. Firestore — `users/{uid}/tiles` (Plant + Scan + Disease result)

**Document id:** `tileNum` (string, e.g. `"1"`) (**PK**)  
**Parent FK:** `uid` (from path)

| Field | Type | Key | Description |
| --- | --- | --- | --- |
| `tileNum` | string/number | **PK** | Tile number (document id) |
| `uid` | string | **FK** | Owner (parent `users/{uid}`) |
| `plantName` | string | | Name for this plant/tile |
| `savedAt` | string (ISO) | | Last save time |
| `scanDayIso` | string (YYYY-MM-DD) | | Scan calendar day used |
| `weekNumber` | number | | Farm week of latest save (4–12) |
| `imageDataUrl` | string / null | | Latest leaf scan image (may be stripped if too large) |
| `scores` | map | | Latest classification scores (see 3a) |
| `topBarKey` | string / null | | Top class key (`healthy`, `tlcv`, `early_blight`, `spotted_wilt`) |
| `topPct` | number | | Top class confidence % |
| `weeks` | map | | Per-week history (see 3b) |
| `recommendation` | map | | Latest treatment recommendation when synced |

**Relationships**

- Many tiles → 1 user  
- 1 tile → many week snapshots inside `weeks`  
- 1 tile → 0..1 recommendation (intervention guide)  

### 3a. Nested — `scores`

| Field | Type | Description |
| --- | --- | --- |
| `healthy` | number | Healthy % |
| `tlcv` | number | Tomato leaf curl virus % |
| `early_blight` | number | Early blight % |
| `spotted_wilt` | number | Spotted wilt % |

### 3b. Nested — `weeks["{weekNumber}"]` (Timeline / week history)

| Field | Type | Description |
| --- | --- | --- |
| `weekNumber` | number | Farm week |
| `savedAt` | string (ISO) | When that week was saved |
| `scanDayIso` | string | Scan day for that week |
| `scores` | map | Score snapshot |
| `topBarKey` | string / null | Top class for that week |
| `topPct` | number | Top % for that week |
| `imageDataUrl` | string / null | Week image (may be null to save space) |

---

## 4. Recommendation / Intervention (guide)

Stored under:

- `users/{uid}/tiles/{tileNum}.recommendation`
- and/or `users/{uid}.plantNames["{tileNum}"].recommendation`
- and locally in `tomatoInsight.plantRecommendations`

| Field | Type | Description |
| --- | --- | --- |
| `diseaseName` | string | Disease this guide targets |
| `urgencyNote` | string | Short urgency note |
| `summary` | string | Treatment summary |
| `actionSteps` | string[] | Recommended actions |
| `preventionTips` | string[] | Prevention tips |
| `isCriticalRemoval` | boolean | Critical / remove-plant flag |
| `barKey` | string | Class key for the guide |
| `pct` | number | Related confidence % |
| `topBarKey` | string | Top disease key when saved |
| `topPct` | number | Top % when saved |
| `scores` | map | Score snapshot tied to the guide |
| `scoresKey` | string | Cache key for the score set |
| `source` | string | `"groq"` or `"rules"` |
| `savedAt` | string (ISO) | When the guide was saved |
| `guides` | array | Optional multi-disease guides |

**Relationships**

- Many recommendations → 1 tile / plant result  

---

## 5. Firestore — `users/{uid}/deletions` (Deleted plant history)

**Document id:** deletion `id` (**PK**)  
**Parent FK:** `uid`

| Field | Type | Key | Description |
| --- | --- | --- | --- |
| `id` | string | **PK** | e.g. `"{tileNum}-{timestamp}"` |
| `uid` | string | **FK** | Owner (parent path) |
| `tileNum` | number | | Tile that was cleared |
| `plantName` | string | | Name at deletion time |
| `deletedAt` | string (ISO) | | When deleted |

**Relationships**

- Many deletions → 1 user  

---

## 6. Firestore — `payments` (Payment)

**Document id:** auto-generated `paymentId` (**PK**)

| Field | Type | Key | Description |
| --- | --- | --- | --- |
| `paymentId` | string | **PK** | Firestore document id |
| `uid` | string | **FK** | Buyer (`users/{uid}`) |
| `email` | string | | Buyer email at purchase time |
| `packId` | string | | `starter` / `grower` / `season` / `custom` |
| `packName` | string | | Pack display name |
| `credits` | number | | Credits added |
| `listPriceUsd` | number | | Listed pack price |
| `amountChargedUsd` | number | | Amount charged (demo = `0`) |
| `currency` | string | | e.g. `USD` |
| `status` | string | | e.g. `paid` |
| `method` | string | | e.g. `demo` |
| `isDemo` | boolean | | `true` for demo checkout |
| `createdAt` | string (ISO) | | Payment time |
| `createdAtMs` | number | | Payment time (ms) for sorting |
| `balanceBefore` | number | | Credit balance before top-up |
| `balanceAfter` | number | | Credit balance after top-up |

**Relationships**

- Many payments → 1 user (`uid`)  
- Payment updates `users.credits.balance`  

**Credit packs (catalog, not a DB table)**

| packId | packName | credits | listPriceUsd |
| --- | --- | --- | --- |
| `starter` | Starter | 10 | 4.99 |
| `grower` | Grower | 25 | 9.99 |
| `season` | Season | 50 | 17.99 |

---

## Entity relationship summary (as implemented)

```
Firebase Auth User (uid)
        │
        │ 1:1
        ▼
   users/{uid}
   ├── credits (nested)
   ├── layout (nested)
   ├── plantNames (nested map of tiles)
   ├── scanCalendar (nested)
   ├── selectedFarmWeek
   │
   ├── 1:N ──► users/{uid}/tiles/{tileNum}
   │              ├── scores / topBarKey / imageDataUrl
   │              ├── weeks{}          (timeline / week scans)
   │              └── recommendation   (intervention)
   │
   ├── 1:N ──► users/{uid}/deletions/{id}
   │
   └── 1:N ──► payments/{paymentId}
```

### Mapping from conceptual ERD → this project

| Conceptual table | Actual storage |
| --- | --- |
| User | Firebase Auth + `users/{uid}` |
| Plant | `users/{uid}/tiles/{tileNum}` (+ `plantNames`) |
| Subscription | `users.credits` (balance + grant flags; packs via payments) |
| Payment | `payments/{paymentId}` |
| Scan | Tile latest fields + `tiles.weeks` |
| Disease Result | `scores`, `topBarKey`, `topPct`, `plantNames.diseases` |
| Intervention | `recommendation` on tile / plantNames |
| Timeline | `weeks` + `selectedFarmWeek` + `scanCalendar` |
| Notification | UI/local reminders (not a Firestore collection today) |

---

## 7. Browser localStorage (cache / offline mirror)

| Key | Mirrors / stores |
| --- | --- |
| `tomatoInsight.userProfiles` | Profile fields by `uid` |
| `tomatoInsight.credits` | Cached credit balance / flags by `uid` |
| `tomatoInsight.farmLayout` | Farm grid layout |
| `tomatoInsight.tilePlantInfo` | Tile scans / week history |
| `tomatoInsight.plantNames` | Plant names by tile |
| `tomatoInsight.plantRecommendations` | Recommendations by tile |
| `tomatoInsight.selectedFarmWeek` | Active week number |
| `tomatoInsight.tileDeletions` | Deletion history array |
| `tomatoInsight.scanCalendar` | Scan schedule |
| `tomatoInsight.sidebarCollapsed` | UI preference |
| Remember-me / toast flags | Auth remember + one-time credit toast flags |

Local data is synced to Firestore when the user is signed in.

---

## Credit rules (business data, not separate tables)

| Event | Credits | One-time? | Stored flag |
| --- | --- | --- | --- |
| First account credit setup | +10 | Yes | `credits.signupGranted` |
| Complete 6 farm setup steps + **Update profile** | +5 | Yes | `credits.profileBonusGranted` |
| Successful Save Info (scan save) | −1 | Per save | balance only |
| Demo pack purchase | +10 / +25 / +50 | Per payment row | `payments` + balance |
