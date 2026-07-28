# Receipt-to-Expense Tracker

Upload a photo of a receipt, get the transaction details back via OCR, correct
anything the OCR engine got wrong, and save. There are no accounts, no login,
and no backend database — everything lives entirely in your browser.

## Stack

- **Frontend:** React + Vite SPA ([frontend/](frontend/)), client-side routed
  with React Router, charts via Chart.js/react-chartjs-2.
- **Storage:** IndexedDB, in the browser ([frontend/src/lib/db.js](frontend/src/lib/db.js)).
  Transactions, monthly salary, and extra income never leave the device —
  there is no server API for any of it.
- **OCR:** Tesseract.js (WebAssembly), also entirely client-side
  ([frontend/src/lib/ocr/](frontend/src/lib/ocr/)) — the receipt image never
  leaves the browser either, not even temporarily.
- **Backend:** Django, reduced to a single job — serving the built React app
  as static files via WhiteNoise ([config/spa.py](config/spa.py)). No
  database, no auth, no API, no admin.

## The no-image-storage constraint

Receipt images are never persisted anywhere, on-device or off:

- Each file is decoded straight into a `<canvas>` in memory
  ([frontend/src/lib/ocr/pipeline.js](frontend/src/lib/ocr/pipeline.js)) and
  handed to Tesseract.js from there. It's never written to a variable that
  outlives the extraction call, never uploaded, and never touches
  IndexedDB — only the structured fields you confirm (date/amount/currency/
  category) get saved.
- The one exception is deliberate and temporary: while a receipt is mid-
  confirmation (before you hit "Save"), its image is kept in a *separate*
  IndexedDB store ([frontend/src/lib/rowStore.js](frontend/src/lib/rowStore.js))
  purely so a page reload doesn't throw away an in-progress batch. It's
  deleted the moment that row is saved or removed.

## Project layout

```
config/          Django project settings/urls — just enough to serve static files
  spa.py         Catch-all view serving frontend/dist/index.html
frontend/        React + Vite SPA — this is the whole app
  src/pages/     Dashboard, CategoryDetail, Expenses, Income, TransactionDetail
  src/components/  Layout, chart components, TransactionsTable, ConfirmDialog
  src/lib/
    db.js          IndexedDB CRUD for transactions/monthly income/extra income
    aggregations.js  Dashboard/category chart math, ported from the old backend
    csvExport.js     Client-side CSV generation + download
    demoSeed.js      Seeds sample data into a brand-new browser
    ocr/             Tesseract.js pipeline + ported parser/categorizer
```

## Core workflow

1. On the **Update Expenses** page (`/expenses`), either:
   - fill in the manual-entry form (date/amount/currency/category) directly, or
   - upload one or more receipt images. Each one is downscaled, grayscaled,
     and OCR'd via Tesseract.js running in a small worker pool (several
     receipts process concurrently), then parsed into date/amount/currency/
     category — no upload, no network call at all.
2. For uploads, the extracted fields populate one editable confirmation card
   per receipt — category and currency are dropdowns constrained to fixed
   lists in [frontend/src/lib/constants.js](frontend/src/lib/constants.js):
   categories are Groceries, Transport, Dining, Utilities, Entertainment,
   Other; currencies are NGN (default), USD, EUR, GBP.
3. On submit, the (possibly corrected) fields are written straight to
   IndexedDB. A single unreadable image doesn't block the rest of the batch.
4. On the **Update Income** page (`/income`) — deliberately separate from the
   dashboard so it can't be changed by accident:
   - set the recurring monthly salary figure, or
   - log one-off "extra income this month" entries (a gift, side gig, bonus).
     These add to the month's total income without touching the salary figure.
5. The dashboard (`/dashboard`) shows this month's income (salary + extra)
   vs. spend vs. remaining balance, lists transactions with filtering
   (clicking any row opens `/transactions/:id` to edit or delete it), a
   monthly-spend line chart, a compact income-vs-spent pie chart, a
   click-to-navigate category breakdown chart, and CSV export
   (amounts comma-formatted, with a total-expense row).

A brand-new browser gets seeded with 20 sample transactions and a default
₦500,000 salary on first visit ([frontend/src/lib/demoSeed.js](frontend/src/lib/demoSeed.js)),
so the dashboard isn't empty — this only ever runs once, checked against
IndexedDB itself (not a flag), so it won't reseed on later visits.

## Setup

```bash
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt
python manage.py runserver
```

### Frontend

The React app lives in [frontend/](frontend/) and needs Node installed.

```bash
cd frontend
npm install
```

Two ways to run it locally:

- **Dev server (recommended while working on the frontend):** `npm run dev`
  starts Vite on `http://localhost:5173` with hot module reload. Since there's
  no backend API to proxy to anymore, this is usually all you need.
- **Built, Django-served (matches production):** `npm run build` outputs to
  `frontend/dist/`, which Django serves directly via WhiteNoise — run
  `python manage.py runserver` and visit `http://127.0.0.1:8000/`. Rebuild
  after every frontend change; there's no watch mode in this path.

Either way: `/` redirects straight to `/dashboard` — no login, ever.

## Environment variables

| Variable | Purpose | Default |
|---|---|---|
| `DJANGO_SECRET_KEY` | Django secret key | dev-only insecure default |
| `DJANGO_DEBUG` | `True`/`False` | `True` |
| `DJANGO_ALLOWED_HOSTS` | comma-separated hosts | `localhost,127.0.0.1` |
| `RENDER_EXTERNAL_HOSTNAME` | Set automatically by Render; trusted for `ALLOWED_HOSTS` | unset |

## Tests

There's no backend test suite anymore — Django has no logic left to test
(`python manage.py test` reports 0 tests, correctly). The React app is
verified by building it and exercising it in a real browser.

## Deploying

Ships as a single Docker image (see [Dockerfile](Dockerfile)): a Node stage
builds the React app, then a Python stage installs Django/whitenoise/gunicorn,
copies the built `frontend/dist/`, and serves it. No database, no migrations,
no email, no CORS — there's nothing else for the backend to do.

Deployed here via **Render**, using [render.yaml](render.yaml) as a Blueprint
(a single free Docker web service, no database). Render sets
`RENDER_EXTERNAL_HOSTNAME` automatically; settings.py trusts it for
`ALLOWED_HOSTS` without further config.

## Known limitations

- **Per-device, not synced.** Data lives in one browser's IndexedDB — it
  won't show up on another device or browser, and clearing site data deletes
  it. There's no account system to sync across devices by design.
- OCR quality depends heavily on photo quality; the parser is heuristic
  (keyword-based total detection, regex-based dates/amounts) rather than a
  trained model, so it will misread some receipts — that's exactly why the
  confirmation step exists before anything is saved.
