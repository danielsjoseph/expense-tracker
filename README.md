# Receipt-to-Expense Tracker

Upload a photo of a receipt, get the transaction details back via OCR, correct
anything the OCR engine got wrong, and save. The receipt image itself is
never written to disk, a model field, or a database — only the structured
fields you confirm ever get persisted.

## Stack

- **Backend:** Django + Django REST Framework — a pure JSON API (plus `/admin/`,
  CSV export, and `/logout/`)
- **Frontend:** React + Vite SPA ([frontend/](frontend/)), client-side routed
  with React Router, charts via Chart.js/react-chartjs-2. Built with
  `npm run build` and served by the same Django process via WhiteNoise — no
  separate frontend host, no CORS.
- **OCR:** pytesseract (Tesseract OCR engine) + OpenCV/Pillow preprocessing
- **DB:** SQLite locally, Postgres in production (via `DATABASE_URL`)
- **Admin:** Django admin, registered as a free transaction browser/editor
- **Auth:** passwordless email OTP login (no passwords stored at all) — Gmail
  SMTP locally, Resend's HTTPS API in production (see **Sending OTP email**)

## The no-image-storage constraint

This is a hard design constraint, not an optimization:

- The uploaded file is read with `.read()` into an in-memory `bytes` object
  ([receipts/views.py](receipts/views.py)) and handed directly to the OCR
  pipeline. It is never assigned to a `FileField`/`ImageField`, never passed
  to `default_storage`, and the project has no `MEDIA_ROOT` configured at all.
- `Transaction` ([transactions/models.py](transactions/models.py)) has no
  image/file column of any kind — only OCR-derived structured fields plus the
  raw OCR text (kept for audit/debugging, not the image).
- Preprocessing ([receipts/ocr/preprocessing.py](receipts/ocr/preprocessing.py))
  decodes bytes straight into an OpenCV array (`cv2.imdecode`) — no temp file
  is written by our code. `pytesseract.image_to_string` accepts that array
  directly; internally it writes its own short-lived temp file for the
  Tesseract subprocess call and deletes it itself — that file is pytesseract's
  implementation detail, not something this project controls, reads back, or
  persists.
- No view or endpoint serves the original image back, since it was never
  stored anywhere to serve.
- Uploads under 10MB are held in memory only (`MemoryFileUploadHandler`); a
  larger upload would spill to Django's own `TemporaryFileUploadHandler`,
  which writes to the OS temp directory and deletes the file itself once the
  request finishes — again, framework-managed transient storage, not
  something this project writes to or reads back from.
- Tests enforce this: [receipts/tests/test_views.py](receipts/tests/test_views.py)
  asserts `/api/extract/` never writes a `Transaction` row and that no
  `MEDIA_ROOT` materializes as a side effect of processing an upload.

## Project layout

```
config/          Django project settings/urls, config/spa.py (SPA catch-all view)
transactions/    Transaction model, DRF viewset, filters, admin
receipts/        upload/extract API view + OCR pipeline
  ocr/           preprocessing.py, extractor.py, parser.py, categorize.py, pipeline.py
                 (plain Python — no Django imports — independently testable)
dashboard/       dashboard/category-summary JSON API views + CSV export
accounts/        passwordless email-OTP login (LoginOTP model, request/verify/me API)
frontend/        React + Vite SPA — pages, charts, IndexedDB draft persistence
  src/pages/     Home, Login, Dashboard, CategoryDetail, Expenses, Income
  src/components/  Layout, ProtectedRoute, chart components, TransactionsTable
```

## Authentication

Every data-bearing API endpoint (everything except the OTP endpoints
themselves) requires an authenticated session — `IsAuthenticated` is the
DRF-wide default. The SPA shell itself (the HTML page) is served to everyone,
logged in or not; the React app calls `GET /api/auth/me/` on load to decide
whether to render a protected page or redirect to `/login` client-side
(`ProtectedRoute` in [frontend/src/components/ProtectedRoute.jsx](frontend/src/components/ProtectedRoute.jsx)).
There are no passwords anywhere:

1. Enter your email on `/login`. `POST /api/auth/request-otp/` generates a
   6-digit code, hashes it (Django's password hasher, never stored in plain
   text) with a 10-minute expiry, and emails it **synchronously** — the
   request blocks until `send_mail()` returns, no task queue. Capped at one
   request per email per 60 seconds.
2. Enter the code. `POST /api/auth/verify-otp/` checks it (max 5 attempts per
   code, single-use) and logs you in. The **first** successful verification
   for a new email auto-creates a `User` for it, seeded with 20 sample
   transactions and a default ₦500,000 salary so the dashboard isn't empty —
   there's no separate signup step.
3. `Transaction` / `MonthlyIncome` / `ExtraIncome` are all scoped to
   `request.user`, so each account only ever sees its own data.

### Sending OTP email

Locally, Gmail SMTP works fine. In production, most PaaS free tiers (Render
included) block outbound SMTP ports to deter spam, so OTP email would never
send — the app instead switches to sending over **Resend's HTTPS API**
(via `django-anymail`) whenever `RESEND_API_KEY` is set, since that isn't
subject to the port block. Local dev with no key set keeps using Gmail SMTP.

**Gmail SMTP (local dev):** requires an **App Password** (not your normal
password) once 2FA is on — enable 2-Step Verification, generate one at
<https://myaccount.google.com/apppasswords>, then in `.env`:
```
EMAIL_HOST_USER=youraddress@gmail.com
EMAIL_HOST_PASSWORD=the16charapppassword
DEFAULT_FROM_EMAIL=youraddress@gmail.com
```

**Resend (production):** sign up at <https://resend.com>, verify a sender
(a domain, or use their `onboarding@resend.dev` default), create an API key,
and set `RESEND_API_KEY` + `DEFAULT_FROM_EMAIL` on the host.

Until either is set up, add `EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend`
to `.env` to print codes to the `runserver` terminal instead of emailing them.

## Core workflow

1. On the **Update Expenses** page (`/expenses/`), either:
   - fill in the manual-entry form (date/amount/currency/category) directly, or
   - upload one or more receipt images. Browser JS POSTs them (multipart) to
     `POST /api/extract/`. Each image is preprocessed (grayscale → denoise →
     deskew → adaptive threshold), OCR'd with Tesseract, and parsed into date /
     amount / currency / category / line items — no DB write happens here.
     (Merchant name is detected internally only to guess a category; it's
     never stored or returned.)
2. For uploads, the extracted fields populate one editable confirmation card
   per receipt — category and currency are dropdowns constrained to fixed
   lists in [receipts/ocr/categorize.py](receipts/ocr/categorize.py) /
   [receipts/ocr/parser.py](receipts/ocr/parser.py): categories are Groceries,
   Transport, Dining, Utilities, Entertainment, Other; currencies are NGN
   (always the default selection), USD, EUR, GBP.
3. On submit, the browser POSTs the (possibly corrected) fields to
   `POST /api/transactions/`, which saves only those fields via the ORM. A
   single unreadable image doesn't block the rest of the batch.
4. On the **Update Income** page (`/income/`) — deliberately separate from the
   dashboard so it can't be changed by accident:
   - set the recurring monthly salary figure, or
   - log one-off "extra income this month" entries (a gift, side gig, bonus).
     These add to the month's total income without touching the salary figure.
5. The dashboard (`/dashboard/`) shows this month's income (salary + extra)
   vs. spend vs. remaining balance, lists transactions with filtering, a
   monthly-spend line chart, a compact income-vs-spent pie chart, and CSV
   export (amounts comma-formatted, with a total-expense row).

`/` itself is a public, logged-out-friendly landing page describing these
features with a login CTA — logged-in visitors hitting it are redirected
straight to `/dashboard/` instead of seeing the pitch again.

## API

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/extract/` | POST | Upload one or more images under `images`, get back a `results` array of extracted fields (one per image, order preserved). No DB write. |
| `/api/transactions/` | GET, POST | List (paginated, filterable) / create transactions. |
| `/api/transactions/{id}/` | GET, PUT, PATCH, DELETE | Retrieve/update/delete a transaction. |
| `/api/transactions/summary/` | GET | Aggregated totals — overall, by category, by month. |
| `/api/income/current/` | GET, POST | Get/upsert the signed-in (or anonymous) user's recurring monthly salary. |
| `/api/income/extra/` | GET, POST, DELETE | List/add/remove one-off extra income entries, always scoped to the current calendar month. |
| `/api/auth/request-otp/` | POST | `{"email"}` → emails a 6-digit code. No auth required. Rate-limited to 1 per email per 60s. |
| `/api/auth/verify-otp/` | POST | `{"email", "code"}` → logs in (creating the account on first success). No auth required. |
| `/api/auth/me/` | GET | `{"email"}` if authenticated, 403 otherwise — the SPA's own login gate. |
| `/api/dashboard/summary/` | GET | Filtered total, daily chart, income-vs-spent, category breakdown — everything the dashboard page needs in one call. |
| `/api/dashboard/category/{category}/summary/` | GET | Same category breakdown chart data, plus that one category's total — for the category detail page. |

Filter query params on `/api/transactions/`: `category` (exact match against
the fixed category list), `date_from`, `date_to`, plus `ordering` (`date`,
`amount`, `category`, `created_at`, prefix `-` for descending).

## Setup

```bash
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt
```

Install Tesseract OCR itself (the Python package only wraps the binary):

- Windows: `winget install UB-Mannheim.TesseractOCR` (or the
  [UB-Mannheim installer](https://github.com/UB-Mannheim/tesseract/wiki))
- macOS: `brew install tesseract`
- Linux: `apt install tesseract-ocr`

If it isn't on your `PATH`, set it explicitly in a `.env` file at the project
root:

```
TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe
```

Then:

```bash
python manage.py migrate
python manage.py createsuperuser   # optional, for /admin/
python manage.py runserver
```

### Frontend

The React app lives in [frontend/](frontend/) and needs Node installed.

```bash
cd frontend
npm install
```

Two ways to run it locally:

- **Dev server (recommended while working on the frontend):**
  `npm run dev` starts Vite on `http://localhost:5173`, proxying `/api`,
  `/admin`, `/export`, and `/logout` straight through to Django on port 8000
  (see `vite.config.js`) — run both servers side by side, then use the Vite
  URL. Hot module reload works normally.
- **Built, Django-served (matches production):** `npm run build` outputs to
  `frontend/dist/`, which Django serves directly via WhiteNoise at the same
  origin — just run `python manage.py runserver` and visit
  `http://127.0.0.1:8000/`. Rebuild after every frontend change; there's no
  watch mode in this path.

Either way: `/` is the public landing page, `/login` to log in (see
**Authentication** above), then `/dashboard`, `/expenses` to add a
transaction (manually or from a receipt), `/income` to set your salary or
log extra income, `/admin/` for the built-in transaction browser (a
separate, traditional username/password login — use `createsuperuser` for
that one).

## Environment variables

| Variable | Purpose | Default |
|---|---|---|
| `DJANGO_SECRET_KEY` | Django secret key | dev-only insecure default |
| `DJANGO_DEBUG` | `True`/`False` | `True` |
| `DJANGO_ALLOWED_HOSTS` | comma-separated hosts | `localhost,127.0.0.1` |
| `DATABASE_URL` | e.g. Postgres connection string | falls back to local SQLite |
| `TESSERACT_CMD` | path to the tesseract binary, if not on `PATH` | unset |
| `EMAIL_BACKEND` | e.g. `...backends.console.EmailBackend` for dev | `...backends.smtp.EmailBackend` |
| `EMAIL_HOST_USER` | Gmail address sending OTP codes (local dev) | unset |
| `EMAIL_HOST_PASSWORD` | Gmail App Password (not your real password) | unset |
| `DEFAULT_FROM_EMAIL` | From address for OTP emails | `EMAIL_HOST_USER` |
| `RESEND_API_KEY` | Resend API key — when set, switches OTP email to Resend's HTTPS API (production) | unset |
| `RENDER_EXTERNAL_HOSTNAME` | Set automatically by Render; trusted for `ALLOWED_HOSTS`/CSRF | unset |

## Tests

```bash
python manage.py test
```

Covers: parser edge cases (subtotal/tax vs. total, thousands separators, OCR
dropping decimal points, currency symbol detection), preprocessing output
shape, category keyword guessing, the transactions API (CRUD, filtering,
summary aggregation, pagination), monthly-salary and extra-income
upsert/scoping behavior, the dashboard/category-summary JSON endpoints
(per-user scoping, date/category filtering, 404 on unknown category), the
no-image-persistence constraint, and the OTP login flow (code expiry, max
attempts, single-use, rate-limit cooldown, auto-account-creation + demo
seeding, and that every protected API endpoint actually rejects an anonymous
caller). Django's test runner automatically swaps `EMAIL_BACKEND` for an
in-memory outbox, so the OTP tests never hit real Gmail/Resend. This is the
backend test suite (`python manage.py test`) only — there's no frontend test
suite; the React app is verified by building it and exercising it in a
browser.

## Deploying

Ships as a single Docker image (see [Dockerfile](Dockerfile)): a Node stage
builds the React app, then a Python stage installs dependencies, copies the
built `frontend/dist/`, runs `collectstatic`, and serves everything —
API, admin, and the SPA shell — through one gunicorn process. No separate
frontend host, no CORS config needed.

Deployed here via **Render**, using [render.yaml](render.yaml) as a
Blueprint (free Postgres + a Docker web service):

- **DB:** `DATABASE_URL` env var (Render's free Postgres, or any Postgres host)
- **Static files:** WhiteNoise serves both Django's own `/static/`
  (admin/DRF browsable API, via `collectstatic`) and the React build's
  assets (via `WHITENOISE_ROOT`, decoupled from Django's static machinery
  since Vite already content-hashes its own filenames)
- **Email:** set `RESEND_API_KEY` — see **Sending OTP email** above; Gmail
  SMTP doesn't work on Render's free tier (outbound SMTP ports are blocked)
- Render sets `RENDER_EXTERNAL_HOSTNAME` automatically; settings.py trusts it
  for `ALLOWED_HOSTS`/`CSRF_TRUSTED_ORIGINS` without further config
- Set `DJANGO_DEBUG=False` and `DJANGO_SECRET_KEY` in production (render.yaml
  generates the latter automatically for a Blueprint deploy)

## Known limitations

OCR quality depends heavily on photo quality; the parser is heuristic
(keyword-based total detection, regex-based dates/amounts) rather than a
trained model, so it will misread some receipts — that's exactly why the
confirmation step exists before anything is saved.
