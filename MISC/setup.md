# airRepo — Google Cloud Setup

End-to-end guide for deploying both halves of airRepo on Google Cloud, optimised for the free tier.

```
airrepo.net        →  Firebase Hosting  (React frontend)
api.airrepo.net    →  Cloud Run         (Flask API)
data store         →  Firestore         (Native mode)
```

Why these choices:

- **Cloud Run** for the API: scale-to-zero, generous free tier, painless custom domain + managed TLS.
- **Firestore (Native)** for the cache: no servers to manage, 1 GiB / 50k daily reads / 20k daily writes free forever.
- **Firebase Hosting** for the frontend: free SSL, free custom domain, global CDN, 10 GiB free egress/month. Way cheaper than Cloud Storage + Load Balancer (the LB alone is ~$18/month).

> **One concept up front.** A bulk-registry cache miss inside a user request would burn ~$0.50 in Firestore writes *and* block the response for 60+ seconds. We avoid that with a **seed-then-serve** pattern: you run `seed.py` once locally to populate Firestore, and the deployed Cloud Run image runs with `AIRREPO_INGEST_ON_MISS=false` so user requests are always pure reads. The image already defaults to this — you just have to remember to seed before going live.

---

## 0 · Prerequisites

| You need | Why |
|---|---|
| Google account with billing enabled | Required even for free-tier usage |
| [`gcloud` CLI](https://cloud.google.com/sdk/docs/install) | Deploy backend + manage GCP resources |
| [`firebase` CLI](https://firebase.google.com/docs/cli) (`npm install -g firebase-tools`) | Deploy frontend |
| Node.js 18+ | Build the React app |
| Python 3.10+ | Run `seed.py` locally |
| Registered domain `airrepo.net` | DNS records will point here |

Authenticate once each:

```powershell
gcloud auth login
gcloud auth application-default login
firebase login
```

---

## 1 · Create the GCP project

Pick a project ID (must be globally unique). I'll use `airrepo-prod` in examples.

```powershell
gcloud projects create airrepo-prod --name="airRepo"
gcloud config set project airrepo-prod

# Find your billing account ID:
gcloud billing accounts list
# Link it:
gcloud billing projects link airrepo-prod --billing-account=XXXXXX-XXXXXX-XXXXXX
```

Enable the APIs we'll use:

```powershell
gcloud services enable `
  run.googleapis.com `
  artifactregistry.googleapis.com `
  cloudbuild.googleapis.com `
  firestore.googleapis.com `
  firebasehosting.googleapis.com
```

Pick a region close to you and your users. The rest of this guide uses **`us-central1`** (cheapest, most-supported default). Swap freely.

---

## 2 · Firestore database

Create a single Native-mode database. **The location can't be changed later** — pick carefully.

```powershell
gcloud firestore databases create --location=us-central1
```

That's it. No schema, no provisioning, no instance to size. Firestore charges per read/write/storage with a generous free tier:

| Quota | Free tier | What airRepo uses |
|---|---|---|
| Document reads | 50,000/day | 1 per user lookup |
| Document writes | 20,000/day | Only during one-time seed |
| Storage | 1 GiB | ~150 MB if you seed the full FAA registry |
| Network egress | 10 GiB/month | Trivial for JSON responses |

---

## 3 · Seed the cache (one-time)

Run this from your laptop, not Cloud Run. The script downloads the bulk registry files locally, parses them, and batches writes into Firestore.

```powershell
cd API
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

$env:AIRREPO_BACKEND = "firestore"
# The application-default credentials from `gcloud auth application-default login`
# are picked up automatically; no service-account file needed for local seed.
$env:GOOGLE_CLOUD_PROJECT = "airrepo-prod"

# Seed everything (~$0.50 one-off in Firestore writes, mostly the FAA file):
python seed.py

# Or seed just one region at a time to stay inside the 20k-writes/day free tier:
python seed.py Canada
python seed.py Australia
# … one region per day if you want it fully free.
```

What this populates:

| Region | Approx. docs | Approx. write cost |
|---|---|---|
| US (FAA) | ~290,000 | $0.52 |
| Canada | ~37,000 | $0.07 |
| Australia | ~15,000 | $0.03 |
| New Zealand | ~5,000 | $0.01 |
| Brazil | ~30,000 | $0.05 |
| Ireland | ~1,200 | <$0.01 |

> If the FAA download SSL-fails on Windows, install certifi (`pip install certifi`) or run from WSL.

UK is intentionally not seeded — the G-INFO portal has no bulk download, and the in-product Selenium fallback is disabled on Cloud Run (would balloon the image). You can either run the seed for UK manually if you have Chrome locally, or accept that UK tails fall through to the configured mock data.

---

## 4 · Backend — Cloud Run

### 4a. Artifact Registry repo

```powershell
gcloud artifacts repositories create airrepo `
  --repository-format=docker `
  --location=us-central1 `
  --description="airRepo container images"
```

### 4b. Build the image

The Dockerfile already sets `AIRREPO_BACKEND=firestore` and `AIRREPO_INGEST_ON_MISS=false`, so you don't need to pass either at deploy.

```powershell
cd API
gcloud builds submit --tag us-central1-docker.pkg.dev/airrepo-prod/airrepo/api:v1 .
```

First build is ~3–5 min (Chromium is hefty). You can shave ~300 MB and ~2 min by removing the `chromium` install from the Dockerfile and `selenium` from `requirements.txt` — only do that if you've definitely given up on UK live scraping.

### 4c. Deploy

```powershell
gcloud run deploy airrepo-api `
  --image us-central1-docker.pkg.dev/airrepo-prod/airrepo/api:v1 `
  --region us-central1 `
  --platform managed `
  --allow-unauthenticated `
  --memory 512Mi `
  --cpu 1 `
  --timeout 30 `
  --concurrency 80 `
  --max-instances 3 `
  --set-env-vars "GOOGLE_CLOUD_PROJECT=airrepo-prod"
```

Settings rationale:

- **`--memory 512Mi`** — plenty for a Firestore read-only API; 256Mi works too if you remove Chromium.
- **`--timeout 30`** — with ingest-on-miss disabled, requests are pure Firestore lookups (<200 ms typical). A short timeout caps any runaway.
- **`--max-instances 3`** — caps your blast radius if something goes viral. Bump later.
- **No `--min-instances`** — leaves scale-to-zero on; you only pay when serving.

### 4d. Grant Firestore access to the Cloud Run runtime

The default Compute service account already has Firestore access in most new projects, but it's worth being explicit:

```powershell
$PROJECT_NUMBER = gcloud projects describe airrepo-prod --format="value(projectNumber)"
$SA = "$PROJECT_NUMBER-compute@developer.gserviceaccount.com"

gcloud projects add-iam-policy-binding airrepo-prod `
  --member="serviceAccount:$SA" `
  --role="roles/datastore.user"
```

(Yes, `datastore.user` — the role name is historical; it covers Firestore.)

### 4e. Smoke test

Cloud Run prints a URL like `https://airrepo-api-abc123-uc.a.run.app`. Curl it:

```powershell
curl https://airrepo-api-abc123-uc.a.run.app/healthz
curl https://airrepo-api-abc123-uc.a.run.app/v1/aircraft/N91GF
```

You should get `{"status": "ok"}` and an aircraft record respectively. If the second one 404s, you haven't seeded that region yet — go back to step 3.

---

## 5 · Custom domain — `api.airrepo.net`

### 5a. Verify domain ownership

```powershell
gcloud domains verify airrepo.net
```

Follow the browser prompt. You'll be asked to add a `TXT` record at your registrar — do that, wait 1–5 minutes, click **Verify**.

### 5b. Map the subdomain

```powershell
gcloud beta run domain-mappings create `
  --service airrepo-api `
  --domain api.airrepo.net `
  --region us-central1
```

The command output lists DNS records to add at your registrar. For an `api.` subdomain it's usually one CNAME:

```
api.airrepo.net.   CNAME   ghs.googlehosted.com.
```

Add it. Google auto-provisions a managed Let's Encrypt cert in ~15–60 minutes. Watch progress:

```powershell
gcloud beta run domain-mappings describe `
  --domain api.airrepo.net --region us-central1
```

When the cert shows `Ready`:

```powershell
curl https://api.airrepo.net/v1/aircraft/N91GF
```

---

## 6 · Frontend — Firebase Hosting

### 6a. Link the Firebase project

The Firebase project is the same GCP project; you're just toggling the Firebase services on.

```powershell
firebase projects:addfirebase airrepo-prod
firebase use airrepo-prod
```

### 6b. Build the React app

```powershell
cd Web
npm install
# Point the build at your live API:
$env:VITE_API_BASE_URL = "https://api.airrepo.net"
npm run build
```

This produces `Web/dist/`. The default already points at `https://api.airrepo.net`, so you can skip the env var if your domain matches.

### 6c. Initialise hosting

```powershell
cd Web
firebase init hosting
```

Answers:

- Use an existing project → `airrepo-prod`
- Public directory → `dist`
- Single-page app → **Yes** (rewrites everything to `index.html`)
- Set up automatic builds with GitHub → **No** (skip for now)
- Overwrite `dist/index.html` → **No** (don't let it stomp the Vite output)

That creates `firebase.json` and `.firebaserc` inside `Web/`. Both are safe to commit.

### 6d. Deploy

```powershell
firebase deploy --only hosting
```

You'll get a `https://airrepo-prod.web.app` URL. Visit it; the React app should load and successfully query the API.

---

## 7 · Custom domain — `airrepo.net` (root + `www`)

In the Firebase console: **Hosting → Add custom domain**.

1. Add `airrepo.net`. Firebase shows you `A` records to add at your registrar (usually two IPv4 addresses).
2. Add `www.airrepo.net` as a separate domain, choose **Redirect to** → `airrepo.net`. Add the CNAME it gives you.
3. Wait for DNS propagation + cert provisioning (~1 hour worst-case).

Once green, both `https://airrepo.net` and `https://www.airrepo.net` serve the frontend, and `https://api.airrepo.net` serves the API. The CORS allowlist in `app.py` already permits both.

---

## 8 · Iteration loop

**Frontend change:**

```powershell
cd Web
npm run build
firebase deploy --only hosting
```

**Backend change:**

```powershell
cd API
gcloud builds submit --tag us-central1-docker.pkg.dev/airrepo-prod/airrepo/api:v2 .
gcloud run deploy airrepo-api `
  --image us-central1-docker.pkg.dev/airrepo-prod/airrepo/api:v2 `
  --region us-central1
```

**Data refresh** (registries update monthly):

```powershell
cd API
$env:AIRREPO_BACKEND = "firestore"
python seed.py
```

You can automate this later with Cloud Scheduler + a Cloud Run Job, but for low usage a manual quarterly run is fine.

---

## 9 · Cost expectations

Assuming low usage (say, <500 lookups/day):

| Service | Monthly cost |
|---|---|
| Cloud Run | **$0** (under free tier of 2M req/mo, 360k GB-s) |
| Firestore reads | **$0** (under 50k/day free) |
| Firestore storage | **$0** (under 1 GiB free) |
| Artifact Registry | **$0** (single image < 0.5 GiB free) |
| Cloud Build | **$0** (under 120 min/day free) |
| Firebase Hosting | **$0** (under 10 GiB/month transfer free) |
| Cloud DNS / domain registrar | varies — ~$10/yr for the domain itself |
| **Total** | **~$0/month** + one-time ~$0.50 seed cost |

Cost ceiling on a runaway spike: with `--max-instances 3` on Cloud Run and Firestore reads at $0.06/100k beyond free tier, even a million requests in a day would be a few dollars. Set [billing alerts](https://console.cloud.google.com/billing/budgets) at $5 to sleep easy.

---

## 10 · Troubleshooting

**`gcloud builds submit` permission denied on Cloud Storage.**
First-time Cloud Build needs you to grant its service account access. The error message includes the exact command — copy/paste it.

**Cloud Run cold starts feel slow.**
First request after idle is ~2–4s. To eliminate: `--min-instances 1` (costs ~$5/month). Usually not worth it for a hobby site.

**`api.airrepo.net` returns 404 from a browser but the `*.run.app` URL works.**
Domain mapping cert isn't ready yet. `gcloud beta run domain-mappings describe --domain api.airrepo.net --region us-central1` and look for `ResourceRecord` errors or a non-`Ready` cert status. Wait it out (up to 60 min).

**CORS error in browser console.**
The frontend origin isn't in the allowlist. Either deploy from `airrepo.net` (already whitelisted) or pass a different list via `AIRREPO_CORS_ORIGINS` on the Cloud Run service:

```powershell
gcloud run services update airrepo-api `
  --region us-central1 `
  --set-env-vars "AIRREPO_CORS_ORIGINS=https://airrepo.net,https://www.airrepo.net,https://your-preview.web.app"
```

**Firestore permission denied from local seed.**
You didn't run `gcloud auth application-default login`, or the active project is wrong. Verify with `gcloud config get-value project`.

**Seed script hits the 20k writes/day free-tier ceiling.**
Run one region per day (`python seed.py Canada`, next day `python seed.py Australia`, etc.) or accept the ~$0.50 one-time cost to do it all at once.

**UK tails return `not_found` in production.**
Expected. UK has no bulk download and the in-container Selenium scraper is disabled by default. Either re-enable `AIRREPO_INGEST_ON_MISS=true` (and accept the ~30s first-request latency) or add UK records manually in `MOCK_AIRCRAFT_DATA` and re-seed.

---

## What to do next (later)

- **Scheduled re-ingestion**: Cloud Scheduler → Cloud Run Job that runs `seed.py` monthly.
- **Caching at the edge**: front Cloud Run with Cloud CDN to cut Firestore reads further.
- **Rate limiting**: Cloud Armor preset rules, or in-app via `flask-limiter` keyed by IP.
- **Analytics**: Firebase Analytics or a lightweight alternative like Plausible.
- **CI/CD**: GitHub Actions → `gcloud run deploy` on push to `main`, `firebase deploy` on Web changes.
