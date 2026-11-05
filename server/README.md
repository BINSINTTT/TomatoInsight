# TomatoInsight Server — Stage 1: Tomato Leaf Validation

Python API for the Android app. It calls your **Roboflow Serverless Workflow** (same as your cURL).

```
Kotlin app  →  POST /validate  →  Python (Render)  →  Roboflow Workflow  →  JSON back
```

Disease classification is **not** enabled yet.

---

## Roboflow workflow (your cURL)

```bash
curl --location 'https://serverless.roboflow.com/vincent-vfqqy/workflows/tomatoleafleafdetection-vtomatoleafleafdetection-1-yolov8n-t1-logic' \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer YOUR_API_KEY' \
  --data '{"inputs":{"image":{"type":"base64","value":"BASE64_IMAGE"}}}'
```

---

## Environment variables (Render or `.env`)

| Variable | Required | Example |
|----------|----------|---------|
| `ROBOFLOW_API_KEY` | Yes | Private key from Roboflow → Settings → API |
| `ROBOFLOW_WORKFLOW_PATH` | Yes | `vincent-vfqqy/workflows/tomatoleafleafdetection-vtomatoleafleafdetection-1-yolov8n-t1-logic` |
| `TOMATO_CLASS_NAMES` | Yes | `TomatoLeafLeafDetection` (must match your Roboflow class name exactly) |
| `VALIDATOR_MIN_CONFIDENCE` | No | `0.4` (= 40%) |

**Do not use** `VALIDATOR_PROJECT` — that is for the old `detect.roboflow.com` API, not workflows.

---

## Local test

```bash
cd server
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
# Edit .env — add ROBOFLOW_API_KEY
python app.py
```

```bash
curl http://localhost:5000/health
curl -X POST -F "file=@test_leaf.jpg" http://localhost:5000/validate
```

---

## Deploy on Render (free)

1. Push repo to GitHub (`tomatoinsight-api` with `server/` folder)
2. [render.com](https://render.com) → **New Web Service** → connect GitHub repo
3. Settings:

| Field | Value |
|-------|--------|
| **Root Directory** | `server` |
| **Build Command** | `pip install -r requirements.txt` |
| **Start Command** | `gunicorn app:app --bind 0.0.0.0:$PORT --timeout 120 --workers 1` |
| **Instance Type** | Free |

4. **Environment** → add variables from table above
5. Deploy → copy URL: `https://tomatoinsight-api.onrender.com`
6. In Android `ApiConfig.kt`, set `VALIDATION_SERVER_URL` to that URL

Or use the included `render.yaml` blueprint (set `ROBOFLOW_API_KEY` in dashboard).

---

## API endpoints

### `GET /health`

```json
{
  "status": "ok",
  "stage": "validation_only",
  "workflow_url": "https://serverless.roboflow.com/vincent-vfqqy/workflows/...",
  "api_key_configured": true
}
```

### `POST /validate`

Multipart form field: **`file`** (JPEG/PNG image)

**Tomato leaf found:**

```json
{
  "result": "TomatoLeaf",
  "confidence": 0.91,
  "detected_class": "TomatoLeafLeafDetection",
  "message": "Tomato leaf validated successfully...",
  "stage": "validation_only",
  "predictions": []
}
```

**Not a tomato:**

```json
{
  "result": "NotTomato",
  "confidence": 0.0,
  "detected_class": null,
  "message": "No tomato leaf detected...",
  "stage": "validation_only",
  "predictions": []
}
```

---

## Android connection

| Environment | `VALIDATION_SERVER_URL` |
|-------------|-------------------------|
| Render cloud | `https://your-app.onrender.com/` |
| Emulator + local PC | `http://10.0.2.2:5000/` |
| Phone + local PC (same Wi‑Fi) | `http://192.168.x.x:5000/` |

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `api_key_configured: false` | Set `ROBOFLOW_API_KEY` on Render |
| `Roboflow workflow failed` | Regenerate API key; check workflow path |
| Always `NotTomato` on real leaves | Fix `TOMATO_CLASS_NAMES` to match Roboflow class names |
| App connection error | Update `ApiConfig.VALIDATION_SERVER_URL`; wait for Render cold start (30–60 s) |
| Build failed on Render | Set **Root Directory** = `server` |

---

## Next step

When validation is stable, add Stage 2 disease classification in `app.py`.
