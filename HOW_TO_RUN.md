# Tomato Insight Web — How to Run (Terminal)

Use the local Python server for the site **and** API proxies (Ultralytics + Groq). Do not open `html/index.html` with double-click (`file://`) — validation, classification, and Firebase modules need HTTP.

---

## Prerequisites

- **Python 3.10+** (check: `python --version`)
- Internet access (AI APIs + Firebase Auth)

---

## 1. One-time setup

Open PowerShell and go to the project folder:

```powershell
cd C:\Users\SPARK-PC-05\Desktop\TomatoInsightWebApplication\server
pip install -r requirements.txt
```

Copy environment files if missing:

| File | Action |
|------|--------|
| `server\.env.example` → `server\.env` | Ultralytics + Groq keys |
| `js\Groq\groq-config.example.js` → `js\Groq\groq-config.js` | Groq proxy URL (optional; repo includes defaults) |
| `js\TomatoValidator\validation-config.example.js` → `js\TomatoValidator\validation-config.js` | Leaf validation settings |
| `js\DiseaseClassification\disease-classification-config.example.js` → `js\DiseaseClassification\disease-classification-config.js` | Disease model |
| `js\Firebase\firebase-config.example.js` → `js\Firebase\firebase-config.js` | Firebase web config |

---

## 2. Start the server (every session)

**Option A — recommended (Windows):**

```powershell
cd C:\Users\SPARK-PC-05\Desktop\TomatoInsightWebApplication\server
.\start.ps1
```

**Option B — manual:**

```powershell
cd C:\Users\SPARK-PC-05\Desktop\TomatoInsightWebApplication\server
python validation_api.py
```

You should see:

```text
Tomato Insight validation API + static site on http://127.0.0.1:8765/
```

Leave this terminal window open while you use the app.

---

## 3. Open the app in the browser

| Page | URL |
|------|-----|
| Public landing (default when you open the site) | http://127.0.0.1:8765/ |
| Farm dashboard (login required) | http://127.0.0.1:8765/index.html |
| Log in | http://127.0.0.1:8765/login.html |
| Sign up | http://127.0.0.1:8765/signup.html |

Opening `/` shows the **landing** page. Opening the dashboard (`index.html`) while signed out sends you to **login** first; after log in you return to the page you requested.
| Monitoring / History / Profile | Same host, e.g. `monitoring.html` |

Hard refresh after code changes: **Ctrl+F5**.

---

## 4. Quick health checks (optional)

```powershell
curl http://127.0.0.1:8765/health
```

Expect JSON with `"status":"ok"`, `"ultralytics_configured":true`, and
`"severity_configured":true` when `.env` is set correctly.

---

## 5. Stop the server

In the terminal where it is running: **Ctrl+C**.

If port 8765 is stuck (old process):

```powershell
Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force }
```

Then run `.\start.ps1` again.

---

## 6. What the server does

| Endpoint | Purpose |
|----------|---------|
| `GET /` | Serves static HTML/CSS/JS |
| `POST /validate` | Tomato leaf check (Ultralytics proxy) |
| `POST /classify` | Disease bars (Ultralytics proxy) |
| `POST /assess-severity` | Per-disease symptom extent from the Ultralytics segmentation model |
| `POST /recommend` | Disease care recommendations (Groq text model) |

Browser scripts call these URLs to avoid CORS errors.

### Scan and severity flow

1. The leaf validator accepts or rejects the uploaded image.
2. The disease classifier returns confidence scores. These scores identify possible diseases only.
3. The same image and top disease name are sent to the trained Ultralytics severity segmentation endpoint.
4. The server calculates `matching symptom-mask area ÷ leaf-mask area × 100`, then converts it into Healthy, Mild (1–33%), Moderate (34–66%), or Severe (67–100%).
5. The scan card shows the top disease and its severity. The complete per-disease severity map is kept with the saved scan and used by disease-specific care guides.
6. OpenCV color rules and Groq Vision are not used for severity. The segmentation response must contain a `leaf` polygon and the selected disease's symptom polygon; otherwise the app reports Unable to Assess rather than inventing a percentage.
7. If the model cannot detect the required masks, the classification remains visible and the user is asked to retake the image in focus with bright, even lighting.

The segmentation percentage is an AI visual screening estimate, not a laboratory measurement or an expert-validated plant-disease severity score. The deployed endpoint requires internet access; offline mobile inference still requires integrating the exported TFLite model separately.

---

## 7. Firebase Auth

- Enable **Email/Password** in Firebase Console.
- Under **Authentication → Settings → Authorized domains**, add every host you open the app with (at least **localhost** and **127.0.0.1**). Password reset emails use a “continue” link back to `login.html`; if that host is missing, Firebase returns `auth/unauthorized-continue-uri` (the app falls back to sending the email without a custom redirect).
- Config lives in `js/Firebase/firebase-config.js`.
- **Farmer account, farm layout, plant names, tile scans, and deleted-plant history** sync to **Cloud Firestore** in the same project as `js/Firebase/firebase-config.js`. Create the database in Firebase Console → Firestore Database and use the **(default)** database.

**Documents** (created automatically per signed-in farmer):

```text
users/{uid}
  firstName, middleInitial, lastName, farmName, email, photo, updatedAt
  layout: { rows, columns, updatedAt }
  selectedFarmWeek
  plantNames: { "1": { name, diseasePct, diseaseLabel }, ... }
users/{uid}/tiles/{tileNumber}
  saved scan, scores, week history, photo
users/{uid}/deletions/{id}
  plant name, tile number, deletedAt
```

**Firestore rules** (Firebase Console → Firestore Database → Rules):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      match /tiles/{tileId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
      match /deletions/{deletionId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
    match /payments/{paymentId} {
      allow read: if request.auth != null && resource.data.uid == request.auth.uid;
      allow create: if request.auth != null
        && request.resource.data.uid == request.auth.uid
        && request.resource.data.method == "demo"
        && request.resource.data.amountChargedUsd == 0;
      allow update, delete: if false;
    }
  }
}
```

Demo checkout on **Credit plans** writes to the `payments` collection. Without the block above, **Pay $0 (demo)** fails with a Firestore `permission-denied` error.

On sign-in, the app downloads that farmer’s account, layout, tiles, and plant names from Firestore into the browser cache, then uploads changes when you save layout, scans, names, or profile. **Sign-out saves the farm to Firestore first**, then clears farm data from this browser so the next account does not see the previous user’s tiles. After log in again, the grid and saved tile info reload from `users/{uid}`.

---

## 8. Troubleshooting

| Problem | Try |
|---------|-----|
| `Failed to fetch` on upload | Use `http://127.0.0.1:8765/`, not `file://` |
| Classification bars stay 0% | Restart server; confirm `/health` shows `ultralytics_configured: true` |
| `405` on `/classify` | Old server still running — stop port 8765 and restart |
| PowerShell `&&` error | Use `;` or run `.\start.ps1` |
| Sign up / login fails | Check Firebase authorized domains and Email/Password sign-in |
| **Authentication has users but Firestore is empty** | Auth and Firestore are separate: the app writes `users/{uid}` on sign-up/sign-in. Publish **Rules** (section 7), use the app at `http://127.0.0.1:8765/` (not `file://`), then sign up again or log in once. Open browser DevTools (F12) → Console for `permission-denied`. Accounts added only in Console → Authentication never appear in Firestore until that user logs in through the app. |
| `auth/unauthorized-continue-uri` on reset | Firebase Console → Authentication → Authorized domains → add **127.0.0.1** and **localhost** (match the URL in your browser) |

---

## Project root (reference)

```text
TomatoInsightWebApplication/
  html/
    landing.html      Public landing (default at /)
    index.html        Farm dashboard (auth required)
    login.html        Auth
    signup.html       Auth
    profile.html      Profile
    monitoring.html   Monitoring
    history.html      History
  server/
    validation_api.py API + static host
    start.ps1         Start script (Windows)
    .env              Server secrets (not in git)
  js/
    Authentication/   Auth guards, forms, session
    DiseaseClassification/
    Firebase/
    TomatoValidator/
    dashboard.js      Home / farm grid
  css/                Styles
```
