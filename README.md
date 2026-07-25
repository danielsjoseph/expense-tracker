# Receipt-to-Expense Tracker

Upload a photo of a receipt, get the transaction details back via OCR, correct
anything the OCR engine got wrong, and save. The receipt image itself is
never written to disk, a model field, or a database — only the structured
fields you confirm ever get persisted.

## Stack

- **Backend:** Django + Django REST Framework
- **OCR:** pytesseract (Tesseract OCR engine) + OpenCV/Pillow preprocessing
- **DB:** SQLite locally, Postgres in production (via `DATABASE_URL`)
- **Frontend:** server-rendered Django templates + vanilla JS (fetch calls to the DRF API)
- **Admin:** Django admin, registered as a free transaction browser/editor
- **Auth:** passwordless email OTP login (no passwords stored at all) via Gmail SMTP

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
config/          Django project settings/urls
transactions/    Transaction model, DRF viewset, filters, admin
receipts/        upload/extract API view + OCR pipeline
  ocr/           preprocessing.py, extractor.py, parser.py, categorize.py, pipeline.py
                 (plain Python — no Django imports — independently testable)
dashboard/       server-rendered pages: public homepage, dashboard, Update Expenses, Update Income
accounts/        passwordless email-OTP login (LoginOTP model, request/verify API, login page)
```

## Authentication

The whole app is login-gated — every dashboard page and every API endpoint
(except the OTP endpoints themselves) requires an authenticated session
(`IsAuthenticated` is the DRF-wide default; pages use `@login_required`).
There are no passwords anywhere:

1. Enter your email on `/login/`. `POST /api/auth/request-otp/` generates a
   6-digit code, hashes it (Django's password hasher, never stored in plain
   text) with a 10-minute expiry, and emails it **synchronously** via Gmail
   SMTP — the request blocks until `send_mail()` returns, no task queue.
2. Enter the code. `POST /api/auth/verify-otp/` checks it (max 5 attempts per
   code, single-use) and logs you in. The **first** successful verification
   for a new email auto-creates a `User` for it — there's no separate signup
   step.
3. `Transaction` / `MonthlyIncome` / `ExtraIncome` are all scoped to
   `request.user`, so each account only ever sees its own data.

### Setting up Gmail

Gmail requires an **App Password** (not your normal password) for SMTP once
2FA is on:

1. Enable 2-Step Verification on the Google account.
2. Generate one at <https://myaccount.google.com/apppasswords>.
3. In `.env`:
   ```
   EMAIL_HOST_USER=youraddress@gmail.com
   EMAIL_HOST_PASSWORD=the16charapppassword
   DEFAULT_FROM_EMAIL=youraddress@gmail.com
   ```

Until that's set up, add `EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend`
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
| `/api/auth/request-otp/` | POST | `{"email"}` → emails a 6-digit code. No auth required. |
| `/api/auth/verify-otp/` | POST | `{"email", "code"}` → logs in (creating the account on first success). No auth required. |

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

Visit `http://127.0.0.1:8000/` for the public landing page, `/login/` to log
in (see **Authentication** above for Gmail setup), then `/dashboard/`,
`/expenses/` to add a transaction (manually or from a receipt), `/income/`
to set your salary or log extra income, `/admin/` for the built-in
transaction browser (a separate, traditional username/password login — use
`createsuperuser` for that one).

## Environment variables

| Variable | Purpose | Default |
|---|---|---|
| `DJANGO_SECRET_KEY` | Django secret key | dev-only insecure default |
| `DJANGO_DEBUG` | `True`/`False` | `True` |
| `DJANGO_ALLOWED_HOSTS` | comma-separated hosts | `localhost,127.0.0.1` |
| `DATABASE_URL` | e.g. Postgres connection string | falls back to local SQLite |
| `TESSERACT_CMD` | path to the tesseract binary, if not on `PATH` | unset |
| `EMAIL_BACKEND` | e.g. `...backends.console.EmailBackend` for dev | `...backends.smtp.EmailBackend` |
| `EMAIL_HOST_USER` | Gmail address sending OTP codes | unset |
| `EMAIL_HOST_PASSWORD` | Gmail App Password (not your real password) | unset |
| `DEFAULT_FROM_EMAIL` | From address for OTP emails | `EMAIL_HOST_USER` |

## Tests

```bash
python manage.py test
```

Covers: parser edge cases (subtotal/tax vs. total, thousands separators, OCR
dropping decimal points, currency symbol detection), preprocessing output
shape, category keyword guessing, the transactions API (CRUD, filtering,
summary aggregation), monthly-salary and extra-income upsert/scoping
behavior, the renamed routes, the no-image-persistence constraint, and the
OTP login flow (code expiry, max attempts, single-use, auto-account-creation,
and that every page/API endpoint actually redirects/rejects when logged out).
Django's test runner automatically swaps `EMAIL_BACKEND` for an in-memory
outbox, so the OTP tests never hit real Gmail.

## Deploying (free tier)

- **App:** Railway or Render
- **DB:** Railway/Supabase/Neon free Postgres — set `DATABASE_URL`
- **Static files:** already wired through whitenoise
  (`STATICFILES_STORAGE` + `collectstatic` at deploy time)
- Set `DJANGO_DEBUG=False` and `DJANGO_ALLOWED_HOSTS` to your real domain in
  production.

## Known limitations

OCR quality depends heavily on photo quality; the parser is heuristic
(keyword-based total detection, regex-based dates/amounts) rather than a
trained model, so it will misread some receipts — that's exactly why the
confirmation step exists before anything is saved.
