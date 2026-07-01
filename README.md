# Anupam Paints — Costing & Quoting System

A formulation-based costing engine for paint manufacturing, plus a customer
quoting layer on top of it.

## What this does

- **Raw materials**: master list with live ₹/kg prices and density. Editable
  by admins, importable from a Google Sheet.
- **Products**: e.g. "Synthetic Enamel", "Epoxy Primer ZRP" — tagged as
  single-pack or two-pack (base + hardener).
- **Formulations**: the actual recipe for a product. A product can have many
  formulations (one per customer/spec), each with its own raw material
  quantities (kg), loss %, packing cost, and mixing ratio (for two-pack).
- **Live costing**: cost per kg and per litre is computed fresh every time
  it's viewed — never stored as a stale number. Change a raw material price
  once, every formulation using it updates automatically everywhere.
- **Quotes**: built on top of formulations — pick a formulation, enter
  quantity, apply margin % and GST %, get a customer-ready total. Quote
  line costs are snapshotted at creation time, so old quotes don't silently
  change if prices move later.
- **Roles**: Admins can edit raw materials, packing, products, formulations,
  and see all quotes. Estimators can create quotes and view costing, but
  can't change prices or formulations.

## Tech stack

Next.js 14 (App Router) + Postgres + JWT cookie auth (bcrypt password
hashing). No external auth provider needed — login is handled by this app.

## 1. Get a Postgres database

Any of these work and have a free tier:
- **Neon** (neon.tech) — recommended, integrates natively with Vercel
- **Supabase** (supabase.com)
- **Vercel Postgres** (from your Vercel dashboard → Storage → Create Database)

Once created, copy the connection string — it looks like:
`postgres://user:password@host/dbname?sslmode=require`

## 2. Local setup (to test before deploying)

```bash
npm install
cp .env.example .env.local
# edit .env.local: paste your DATABASE_URL, generate a JWT_SECRET, set admin credentials
npm run db:migrate   # creates all tables
npm run db:migrate2  # adds search/history/three-pack/backup support (safe to re-run)
npm run db:seed      # creates your first admin login
npm run dev          # open http://localhost:3000
```

If you already had this app running before these features were added, you only
need to run `npm run db:migrate2` against your existing database — it's
written to be safe on a database that already has data (every change is
`IF NOT EXISTS` / additive).

Log in with the `ADMIN_EMAIL` / `ADMIN_PASSWORD` you set in `.env.local`.

## 3. Deploy to Vercel

```bash
npm i -g vercel   # if you don't have the CLI
vercel             # follow prompts, link/create your Vercel project
```

Then in the Vercel dashboard for this project → **Settings → Environment
Variables**, add:
- `DATABASE_URL`
- `JWT_SECRET`
- (optionally) `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_KEY` — see below

Redeploy after adding env vars (`vercel --prod`), then run migration + seed
**once** against your production database. Easiest way: temporarily set
`DATABASE_URL` in your local `.env.local` to the **production** connection
string and run:

```bash
npm run db:migrate
npm run db:seed
```

Then switch your local `.env.local` back to a dev database if you have one,
or just keep using the production one for now.

## 4. Google Sheets import (raw material prices)

This lets you click "Import from Sheet" on the Raw Materials page and pull
prices directly from your Google Sheet.

**Sheet format** — first row must be headers, matched by name (not position):

| Name | Price Per Kg | Density (kg/litre) | Supplier | Notes |
|------|-------------|---------------------|----------|-------|
| Titanium Dioxide | 285 | 4.0 | XYZ Chemicals | |
| Xylene | 92 | 0.86 | | |

**Setup:**
1. Go to [console.cloud.google.com](https://console.cloud.google.com) → create
   or pick a project.
2. Enable the **Google Sheets API** (search for it under "APIs & Services").
3. Create a **Service Account** (APIs & Services → Credentials → Create
   Credentials → Service Account).
4. Open the service account → **Keys** tab → **Add Key** → JSON. This
   downloads a JSON file.
5. Open your raw materials Google Sheet → **Share** → paste in the service
   account's email (looks like `xxxx@xxxx.iam.gserviceaccount.com`, found in
   the JSON file as `client_email`) → give it **Viewer** access.
6. From the JSON file, copy:
   - `client_email` → set as `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `private_key` → set as `GOOGLE_SERVICE_ACCOUNT_KEY` (keep the `\n`
     characters literally as `\n`, don't replace them with real line breaks)
7. Add both as environment variables in Vercel, redeploy.
8. On the Raw Materials page, click "Import from Sheet", paste your Sheet ID
   (the long string in the sheet's URL between `/d/` and `/edit`) and the
   range (e.g. `RawMaterials!A1:E500` if your tab is named "RawMaterials").

Once this is set up, send me the actual sheet — I can also adjust the column
matching if your sheet's headers are named differently.

## 5. Adding your team

Log in as admin → **Users** tab → **Add team member**. Give them a temporary
password and tell them to use it to log in (a self-service password change
can be added later if needed — for now, an admin can recreate an account if
someone's locked out).

## New: batch-sheet costing, customer search, image extraction

- **Batch size + percent ↔ kg**: each formulation can have a "batch size
  (kg)" — the total finished goods that recipe makes. Enter a raw
  material's quantity in kg OR its percent of the batch, and the other
  fills in automatically. This mirrors your factory batch sheets directly.
- **Batch-sheet-style cost table**: expanding a formulation shows a table
  matching your factory format — Raw Material / Percent / Rate / Cost per
  Kg / Cost per Ltr per row, with Total, loss adjustment, packing-per-kg,
  and a final **Nett** row (cost/kg and cost/litre).
- **Packing cost is per batch**: the packing materials you select are a
  flat per-batch cost, divided by batch size to get the per-kg Nett add-on
  — matching how your factory actually accounts for packing.
- **Search by customer name**: the Products search box now also matches
  any customer/spec name attached to a product's formulations — searching
  a customer's name surfaces every product costed for them.
- **Upload a batch sheet photo**: when creating a formulation, you can
  upload a photo or screenshot of a paper/Excel batch sheet. Claude reads
  the raw material names, percentages, and rates and shows you an editable
  review table — nothing is saved automatically, and unmatched raw
  materials are flagged in red for you to map or skip. Requires
  `ANTHROPIC_API_KEY` (see `.env.example`).

- **Two/three-pack weight-per-litre is per side, not shared**: Base and
  Hardener (and Component C) are supplied in separate containers and have
  different densities. Each side gets its own measured weight-per-litre.
  The final mixed cost is blended using the volume mix ratio:
  - each side's cost/litre = that side's cost/kg × that side's density
  - volume share of each side = its volume-ratio number ÷ sum of all sides'
    volume-ratio numbers (e.g. 4:1 → Base 80%, Hardener 20%)
  - blended cost/litre = Σ (volume share × that side's cost/litre)
  - blended density = Σ (volume share × that side's density)
  - blended cost/kg = blended cost/litre ÷ blended density
  Loss% and packing-per-kg are then applied once to this blended figure,
  same as single-pack, to produce the final Nett.
- **Single-pack** still uses one shared weight-per-litre field, unchanged.

- **Single-pack products** (synthetic enamels, primers): one recipe list.
- **Two-pack products** (epoxy, PU, aluminium): separate Base and Hardener
  recipes. **Three-pack products** add a third Component C recipe the same way.
- **Batch size (kg)** anchors the percent ↔ kg conversion for every raw
  material line in that formulation: `percent = qty_kg / batch_size_kg * 100`.
  If no batch size is set (older formulations), the recipe's own total
  weight is used as the implied batch size, so existing costings keep
  producing the same numbers as before.
- **Per-row cost contribution** = `(percent / 100) × raw material's price per kg`
  — this is each ingredient's contribution to one kg of finished product,
  not the raw material's own price.
- **Total** = sum of every row's cost contribution = cost per kg before loss.
- **Loss %** is applied as `Total × (1 + loss% / 100)`.
- **Packing cost** is a flat **per-batch** figure from the Packing
  Materials master, divided by batch size to get a per-kg add-on.
- **Nett** = Total-with-loss + packing-per-kg = the final cost per kg.
- **Nett per litre** = `Nett × weight-per-litre`, where weight-per-litre is
  a number your technical team measures and enters per formulation (not
  derived automatically from raw material densities). Until that number is
  entered, cost per litre shows as "—" / null.

## New: search, history, backups, bulk entry

- **Search**: both the Products and Raw Materials pages have a live search
  box that filters by name as you type.
- **Price history**: every time a raw material's price is edited, the old
  price is archived with a timestamp. Click the trend icon next to any raw
  material to see its full price timeline on a chart, plus the dated list.
- **Formulation cost history**: every time a formulation is created or
  edited, a dated snapshot of its cost/kg and cost/litre is saved. Click
  "Cost history" inside any expanded formulation to see its timeline.
- **Bulk raw material entry**: the "Add materials" button on Raw Materials
  lets you add several materials in one form and save them all together.
- **Weekly backup prompt**: admins see a banner if it's been 7+ days since
  the last backup. Clicking "Backup now" downloads a full JSON export of
  every table (excluding password hashes) and logs the backup so the
  prompt resets for another week.

## Project structure

```
app/
  api/              → all backend routes (Next.js API routes)
  login/            → login page
  products/          → products list + product detail (formulation builder)
  raw-materials/     → raw material master + Google Sheet import
  packing-materials/ → packing cost master (admin only)
  quotes/            → quote list, new quote builder, quote detail
  admin/             → team/user management (admin only)
lib/
  db.js             → Postgres connection pool
  costing.js        → the core live-costing calculation
  auth.js           → password hashing, JWT signing/verification
  apiGuard.js       → route-level auth/role checks
schema.sql          → full database schema
scripts/            → migrate.js, seed.js
```
