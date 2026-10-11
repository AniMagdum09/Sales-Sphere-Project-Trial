# SalesSphere — Offline Retail Analytics & Inventory Intelligence

Final-year mega project (Team I, Walchand Institute of Technology, Solapur) sponsored by
**Indo Sports, Moshi (Pune)** — 1 sports shop + 2 garments branches.

SalesSphere is a **strictly read-only analytics layer** on top of the shop's existing SQL Server
billing system. It never writes to billing data. A Spring Boot **Sync Agent** pulls the 4 core
billing tables into a SalesSphere-owned MySQL database; a **FastAPI Analytics API** turns that
data into sales / inventory / customer intelligence; an **Electron + React desktop dashboard**
presents it; an **Ollama-powered chatbot** answers plain-English questions about it — fully
offline.

Data can reach the analytics layer in TWO ways:
1. **Automatic sync** from the SQL Server billing DB (the normal path), or
2. **CSV / Excel import** — upload shop-exported bills, line items, customers, products and
   daily summaries from the dashboard's *Import Data* page (templates included, auto-detected
   columns, idempotent re-imports, per-row error report).

```
SQL Server "BILLING"  ──read-only──▶  Spring Boot Sync Agent  ──upsert──▶  MySQL (owned)
   (never touched)                      :8080 REST                          │
                                                                        analytics
                                                                        ▼
                                          Electron + React desktop ◀── FastAPI :8000
                                          dashboard + AI chatbot          (Ollama local LLM)
```

## Components

| Folder | What it is | Status |
|---|---|---|
| `sync-agent/` | Spring Boot service: dual persistence (read-only SQL Server source → MySQL target), idempotent upserts, Flyway V1–V4, REST for sync trigger/status + runtime source config (credentials masked) | **Built, compiles, boots; idempotency proven by integration test (4/4 green on real MySQL)** |
| `analytics-api/` | FastAPI: overview, sales trends, product/customer rankings, derived stock, FSN classification, dead stock, item movement, branch summary, chatbot (Ollama `qwen3:8b` with rule-based fallback) | **Built; every endpoint verified against a live MySQL** |
| `desktop-app/` | Electron + React (Vite) dashboard: Overview, Insights (profit / forecast / MoM growth), Sales, Inventory (FSN / dead stock / reorder suggestions), Customers (RFM segments), Alerts centre, Reports (CSV download + print), Import Data (drag & drop CSV/Excel), Chatbot. Day/night themes, branch switcher, date-range filters | **Built; visually verified** |
| `scripts/` | One-click start scripts + `validate_steps_1_to_6.ps1` (the handover's validation plan) | Ready |
| `seed_demo.py` (in analytics-api) | Creates `salessphere_demo`: 15 months of synthetic billing data for 3 branches (~10k invoices, seasonality, sunset items) so everything can be demoed without the shop DB | Ready |

## Prerequisites

- Java 21+ and Maven (sync agent) — built and tested on Java 23
- MySQL 8 running locally (target DB; the agent auto-creates `salessphere_local`)
- Python 3.11+ (analytics API — a venv is already set up at `analytics-api/.venv`)
- Node.js 18+ (desktop app — `node_modules` already installed)
- Optional: [Ollama](https://ollama.com) with `qwen3:8b` for the AI chatbot (falls back to
  rule-based answers without it)

## Quick start

**The desktop app** (simplest): double-click
`desktop-app
elease\SalesSphere-Portable.exe` — then start the API with
`scripts\start-analytics-api.bat`. (The exe is the UI; the API serves the data.)

**In the browser**: `scripts\start-in-browser.bat` — opens the dashboard at
http://127.0.0.1:4173 automatically.

**First run (fresh database)**: the Overview shows a welcome walkthrough. Click
*Import your data* and bring in the client's files — the sponsor's real exports
are supported directly:
- `SR  DD-MM-YYYY TO DD-MM-YYYY.xlsx` (sales report, bill-level) → invoices + customers
- `PR  DD-MM-YYYY TO DD-MM-YYYY.xlsx` (purchase report) → purchases
- `Stock Report_*.xlsx` (item master + stock + monthly sales) → products, live stock, item history

All three were tested against the sponsor's actual FY 2025-26 files: **zero row
errors**, and re-importing the same file never duplicates anything.

**Data management**: every import run is tracked with a batch id — delete any single
import (with all rows it brought) from the Import page, or use *Erase all data*
(type-DELETE confirmation) for a full fresh start.

**Combined analysis**: the dashboard merges all three files — revenue from the sales
report, purchase trends + top suppliers from the purchase report, live stock value and
item performance (qty sold, estimated revenue/profit at MRP, current stock) from the
stock report, plus brand/department mix. Overview shows Revenue, Purchases, Stock
value and Net margin (revenue − purchases) together.

**Demo data for testing** (synthetic, separate database — never touches the real one):
```bat
scripts\seed-demo-database.bat      :: builds salessphere_demo
:: then edit start-in-browser.bat / start-analytics-api.bat and uncomment the
:: salessphere_demo SALESSPHERE_DB_URL line
```

## Production run (on the shop machine)

1. `scripts\start-sync-agent.bat` — first boot creates + migrates `salessphere_local`
2. Point the agent at the billing DB (no restart needed):
   `PUT http://127.0.0.1:8080/api/config/source` with `{host, port, databaseName, username, password}`
   — or edit `salesphere.source.*` in `application.yml` before first boot.
3. `powershell -File scripts\validate_steps_1_to_6.ps1` — runs the handover validation plan:
   - **01** source connectivity test → **02** config + credential masking → **03** first sync +
     row inspection → **04** second sync = **idempotency proof** → **05** dynamic reconfig
     without restart → **06** `Im_Remaining_Qty` physical-count verification (manual).
4. `scripts\start-analytics-api.bat` (leave the demo `SALESSPHERE_DB_URL` line commented so it
   uses `salessphere_local`)
5. `scripts\start-desktop-app.bat`

## REST surfaces

**Sync Agent (:8080)** — `POST /api/sync/run` · `GET /api/sync/status` ·
`GET/PUT /api/config/source` (password always masked) · `POST /api/config/source/test`

**Analytics API (:8000, docs at `/docs`)** — `/api/overview` · `/api/sales/trends|by-product|by-customer|summary` ·
`/api/inventory/current-stock|fsn|dead-stock|movement` · `/api/customers/top|{id}` · `/api/branches` ·
`/api/insights/profit|forecast|reorder|rfm|alerts|category-sales|hourly|mom-growth|purchases|item-performance|brand-mix` ·
`/api/export/report.csv?kind=product_sales|customer_sales|inventory|dead_stock|reorder|profit|sales_summary` ·
`/api/import/upload` + `/api/import/template?kind=...` + `/api/import/history` +
`DELETE /api/import/runs/{id}` + `POST /api/import/erase-all` ·
`/api/chat` (POST `{question, history?}` — single-pass local-LLM SQL agent, typically
answers in 5-15 s fully offline) · `/api/health`

All sales-side endpoints accept an optional `branch` filter (01 / 02 / 03) plus `from`/`to` dates.

### CSV / Excel import notes
- Supported: `.csv` and `.xlsx` (single-type files, or a bulk workbook with sheets
  Invoices / InvoiceItems / Customers / Products / DayEnd).
- Column names are matched flexibly (`Bill No`, `BILL_NO`, `billno`, … all work); type is
  auto-detected or forced.
- When a line-items file has no numeric doc number, one is derived deterministically from
  `CRC32(branch|bill_no)`, so re-imports update the same rows (idempotent).
- Missing invoice headers are auto-created from the line items and their totals backfilled
  from the lines.
- Dates: ISO (`2026-10-05`) or Indian (`05/10/2026`) both parse correctly.
- Every run is logged (`import_runs` table, Flyway V5) with rows read/failed and the first 50
  row-level errors.

## Design decisions worth knowing (for the viva)

- **Read-only source, enforced in depth**: source JPA entities are Hibernate `@Immutable`, every
  source read runs in a `readOnly` transaction on a dedicated persistence unit, Hibernate DDL is
  disabled (`validate` only, and never against the source), and the source pool starts lazily so
  the agent boots even when the billing server is offline.
- **Idempotent sync**: every write is an upsert keyed on the composite invoice identity
  `branch_code + doc_type + doc_no` (plus `party_no` / `item_code` for masters). Running the sync
  twice changes nothing — proven by `TargetUpsertIdempotencyIT` on a real MySQL.
- **Derived stock**: `Im_Remaining_Qty` in the source is NOT trusted (handover caution). Current
  stock = purchases − sales within the synced window, reconcilable against `DAY_END`. The V3
  `daily_stock` table snapshots this daily.
- **Legacy compatibility**: if the source really is SQL Server 2005, set `jdbc-url-override` to
  the jTDS URL (`jdbc:jtds:sqlserver://...`) — the driver ships in the jar.
- **Doc-type watch-out**: if the billing system resets `Doc_No` every financial year, the
  composite identity must grow a year component — check during validation step 03 before
  trusting the data.

## Sync agent internals

```
sync-agent/src/main/java/com/salesphere/sync/
├── config/    TargetJpaConfig (primary MySQL + Flyway) · SourceJpaConfig (read-only source)
│              DynamicSourceDataSource (hot-reloadable pool) · SourceConfigService (masked config)
├── source/    @Immutable entities: PartyMst, Trinvs_Master, Imtrans_Detail, DAY_END (+ repos)
├── target/    SyncMetadata entity + repo (run history)
├── sync/      SourceReadService (all source reads, readOnly tx) · TargetUpsertService
│              (idempotent upserts + daily-stock rebuild) · SyncService (orchestration, async)
└── web/       SyncController · ConfigController · CORS + error handling
```

Flyway migrations: `V1` core tables (customers, products, invoices, invoice_items, day_end) ·
`V2` sync_metadata + source_config · `V3` daily_stock · `V4` analytics views ·
`V5` import_runs · `V6` products.purchase_price.

## Known limitations / next steps

- Cloud sync + multi-shop central dashboard (proposal Phase 5+) is **not built** — the current
  scope is the local, offline-first layer per the handover.
- Demand forecasting (Random Forest) and competitor price tracking are stretch goals, not started.
- The desktop app expects the analytics API at `http://127.0.0.1:8000` (configurable in its
  Settings dialog).
- First sync against the real billing DB may take a while (full scan + upsert, paged at 2000
  rows); incremental sync by `Mod_Date` is the planned optimization.
