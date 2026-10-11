# SalesSphere — Deep Analysis of All Project Documents

> **STATUS UPDATE (2026-10-11):** the full system has since been built in `T/salesphere/` —
> Spring Boot sync agent (compiles, boots, idempotency proven by integration test), FastAPI
> analytics API (all endpoints verified on live MySQL), Electron+React dashboard (all pages
> visually verified), Ollama chatbot working. See `T/salesphere/README.md`.
> What still requires the shop machine: live SQL Server connectivity (steps 01–03) and the
> physical `Im_Remaining_Qty` count (step 06) — use `salesphere/scripts/validate_steps_1_to_6.ps1`.

**Prepared:** 2026-10-09 · **Sources analyzed:** `TEAM I  - SALESSHPERE.pptx` (proposal deck, Aug 2026), `SalesSphere_Progress_Report 1.pptx` (progress deck, Sept 2026), `S.pdf` (handover document to ZCode, Oct 2026). Embedded diagram images from both decks were extracted to `../extracted_imgs/` and read.

---

## 1. Project Identity

| Field | Value |
|---|---|
| Project title | **AI-Powered Offline Centralized Sales Analytics & Inventory Intelligence System** |
| Product name | **SalesSphere** — tagline: *"Smarter Insights, Better Business"* |
| Institution | Walchand Institute of Technology, Solapur — Dept. of Computer Science & Engineering |
| Guide | Dr. D. P. Pandit |
| Team | B-34 Anmol Magdum · B-35 Yash Kagwade · B-36 Aniruddha Magdum · B-37 Rushikesh Koik |
| Sponsor | **Indo Sports, Moshi (Pune)** — sponsorship letter dated 28-07-2026, signed by Abhay Upadhye (Manager) |
| Duration | **August 2026 → May 2027** |
| Business outlets | **3 shops**: Shop 1 = Sports shop, Shop 2 = Garments shop 1, Shop 3 = Garments shop 2 (one main billing system) |

**One-sentence problem:** The sponsor already has billing software backed by an on-premise SQL Server database ("BILLING"), but the data is not usable for analytics. SalesSphere is a **read-only analytics layer** built alongside it — it never touches billing.

**Core principle (stated in every document, non-negotiable):** the SQL Server billing DB is strictly **read-only**; SalesSphere owns and writes only its own local MySQL database. A write to the source would corrupt live billing data.

---

## 2. What Each Document Contains

1. **TEAM I proposal deck (13 slides, Aug 2026)** — the *vision*: problem statement, project idea, background & existing systems, literature survey, unique features, methodology, software/hardware requirements, work distribution, expected outcomes. Contains the full 3-shop + cloud architecture diagram.
2. **Progress Report 1 (9 slides, Sept 2026)** — the *current state*: relational schema (ERD based on the actual source schema), DFD of the sync pipeline, implementation progress, next steps, future work.
3. **S.pdf handover (9 pages, Oct 2026)** — the *ground truth for development*: exact architecture, tech stack with build status, database design, sync agent internals, REST endpoints, what is/isn't completed, 6 prioritized next steps for ZCode, full roadmap (Phases 1–6), and cautions.

The handover PDF is the authoritative document. The proposal deck describes the end-state vision; much of it is deliberately *not built yet*.

---

## 3. System Architecture (as it actually stands)

```
SOURCE (READ-ONLY)          SYNC AGENT                    TARGET (OWNED)
SQL Server "BILLING"   →    Spring Boot (Java)      →     MySQL "salessphere_local"
localhost:1433              JDBC read-only (SELECT)       Normalized schema
26 source tables            Transform → Upsert            Flyway-managed migrations
4 tables synced             REST API (trigger/config)     Analytics layer lives here
```

- **Offline-first**: runs entirely on the shop's local machine; no internet needed.
- **Sync is designed to be repeatable and idempotent** — running it twice must produce identical row counts with no duplicates.
- **Sync metadata table** (Flyway V2) records when each sync ran, its status, and per-table insert/update counts.
- **Credential masking**: DB credentials are never returned in plain text from the REST API.

### REST endpoints (implemented)
```
POST /api/sync/run      -- trigger full synchronization
GET  /api/sync/status   -- last sync status + metadata
GET  /api/config/source -- view current source DB config (masked)
PUT  /api/config/source -- update source connection config at runtime (no restart)
```

### Build status (from handover, Oct 2026)
| Layer | Technology | Status |
|---|---|---|
| Sync Agent backend | Spring Boot (Java) | ✅ Built, **compiles** |
| Source DB | SQL Server Express | ⚠️ Pending validation (never connected at runtime) |
| Target DB | MySQL | ✅ Schema ready |
| Migrations | Flyway V1 + V2 | ✅ Done |
| Analytics API | FastAPI (Python) | Planned |
| Desktop frontend | Electron + React | Planned |
| AI chatbot | Ollama (local LLM) | Planned |

**The critical distinction the handover hammers on:** *compilation success ≠ runtime success*. Nothing has been proven against the live SQL Server yet. That is Phase 2 and it blocks everything else.

---

## 4. Data Model Deep-Dive

### Source: SQL Server 2005 "BILLING" DB (read-only)
26 tables total; **4 core tables** selected for sync:

| Source table | Role | Notable columns |
|---|---|---|
| `Trinvs_Master` | Sales invoice header | `Branch_Code`, `Doc_Type`, `Doc_No`, `Doc_Date/Doc_Time`, `Party_No` (FK), `Customer_Name`, `BILL_NO`, `Doc_Value`, `Discount`, `Total_Qty` … (+100 more) |
| `Imtrans_Detail` | Invoice line items / inventory movement | `ItemNo`, `Item_Code`, `Bar_Code`, `Size`, `UOM`, `HSN_Code`, `Im_Qty`, `Im_Purchase_Qty`, `Im_Remaining_Qty`, `Purchase_Price`, `Sales_Price`, `MRP`, `Supplier_Name`, `Batch_No` … |
| `PartyMst` | Customer/party master (66 columns) | `party_no` (PK), `party_name`, contact fields, `Credit_Limit`, `Opening_Balance`, `MembershipID`, `Branch_Code` … |
| `DAY_END` | Daily summary per branch | `Branch_Code` + `Day_End_Date`, `Total_Sales`, `Total_Purchase`, `Total_Collection`, `Total_Payment`, `Closing_Balance` |

Key schema facts:
- **Composite invoice identity = `Branch_Code + Doc_Type + Doc_No`** — this drives all dedup/upsert logic. (Doc_No alone is not unique.)
- The source schema already carries **`Branch_Code` everywhere** → the billing DB likely consolidates multiple outlets (see open question #1).
- Legacy SQL Server **2005** types in play: `smalldatetime`, `money`, `nvarchar`.

### Target: MySQL `salessphere_local` (normalized, owned)
- `customers` (from PartyMst) — surrogate `id` + `source_party_no` to preserve lineage
- `invoices` (from Trinvs_Master) — surrogate `id` + `source_branch_code/source_doc_type/source_doc_no` (the composite identity) + `customer_id` FK
- `invoice_items` (from Imtrans_Detail) — `invoice_id` FK + item/qty/price fields
- `day_end` / `day_end_logs` (from DAY_END) — daily stock & sales snapshots
- `sync_metadata` — sync run tracking
- Flyway history: `V1__initial_schema.sql` (core tables), `V2__sync_metadata.sql`; planned `V3__daily_stock.sql`, `V4__analytics_views.sql`

### The one flagged data risk
`Im_Remaining_Qty` exists in the source but is **not proven to be the authoritative current stock**. It looks like a per-line snapshot captured at invoice time, not a live stock balance. Inventory analytics must not be built on it until it's verified against a physical count (handover step 06). Safer alternative: derive current stock from purchase − sales movements and reconcile against `DAY_END.Closing_Balance`.

---

## 5. The End-State Vision (proposal deck — not yet built)

Full proposal architecture: each shop runs a desktop app (React UI wrapped in **Tauri**) with a local MySQL + background sync service + barcode scanner/receipt printer/cash drawer; a **cloud Spring Boot API + cloud MySQL (central DB)** collects all shops; an **owner/admin dashboard** (Tauri + React) shows all-3-shop analytics; an **Analytics Engine** on the cloud computes sales/profit/stock alerts/AI recommendations; plus an **AI chatbot** for plain-English questions.

Unique features promised: trend analysis (season/festival demand), dead-stock recovery (30/60/90-day flags + discount suggestions), competitor price tracker, customer credit points (₹100 = 10 points, loyalty tiers), smart reorder suggestions, AI chatbot.

Existing-systems comparison: Tally ERP, Busy Accounting, Zoho Inventory, retail POS, Excel — all rejected for cloud dependence, cost, or no unified multi-branch analytics.

**Reality check:** the entire built system today is the *single-shop local sync agent*. Cloud, multi-shop, chatbot, and forecasting are future phases. The proposal's scope is far larger than what 8 remaining months can safely deliver — the handover's phased roadmap is the realistic path.

---

## 6. Timeline & Where We Are

| Milestone | Date | Status |
|---|---|---|
| Sponsorship letter (Indo Sports) | 28 Jul 2026 | done |
| Project start | Aug 2026 | done |
| Source analysis, target schema, migrations, sync agent built | Sept 2026 | done |
| **Handover to ZCode; Phase 2 (integration & sync validation) begins** | **Oct 2026 (now)** | **← here** |
| Inventory analytics, sales analytics | next | not started |
| Dashboards + desktop app + chatbot | next | not started |
| Testing & deployment on shop machine | by May 2027 | not started |

Roughly **7–8 months remain**. Phase 2 (prove the sync) gates everything.

---

## 7. Inconsistencies Found Across the Documents

These matter for the report/viva and for keeping the story straight:

1. **Product name slip:** the Unique Features slide says *"What makes **RetailSync** different…"* — a leftover from an earlier project name. Should be SalesSphere.
2. **Deck filename typo:** "SALESSHPERE" in `TEAM I  - SALESSHPERE.pptx`.
3. **Desktop shell conflicts three ways:** Tauri + React (architecture diagram, methodology, references) vs **Electron + React** (handover) vs **JavaFX** (work-distribution slide). The handover's Electron choice is the latest; the deck should be updated to match before the next review.
4. **Cloud story conflicts:** "Free hosting via Render + **PlanetScale**" (advantages slide) vs "**Oracle Cloud** VM MySQL" (software slide, methodology, architecture). Note: PlanetScale removed its free tier in 2024 — the zero-cost claim only holds with Oracle Cloud Always Free (or similar).
5. **AI approach conflicts:** Random Forest (software slide) vs OpenAI API (references) vs **Ollama local LLM** (handover) vs generic "ML components" (architecture). Ollama is the only option consistent with offline-first + zero-cost; OpenAI contradicts both.
6. **Local DB:** software slide lists "MySQL, **SQLite**" — SQLite appears nowhere else; likely stale.
7. **Work distribution mismatch:** slide 11 defines 4 role-based members (backend lead / backend features / DB & sync / frontend+testing, with JavaFX); the team-slide image assigns by person (Anmol = AI/ML+SQL+planning, Yash = Spring Boot+cloud+React+Docker, Aniruddha = docs+PPT+Git, Rushikesh = communication only). These two distributions contradict each other and neither mentions Electron/FastAPI.
8. **Target-schema naming drift:** DFD says target table `parties`; ERD and Flyway V1 say `customers`. DFD lists `day_end_logs` as a synced target table; V1's comment lists `products` as a core table instead. The ERD shows no `products` table in the target. → Reconcile V1/DFD/ERD into one source of truth.
9. **"4 core tables" described differently:** handover says Invoices / Invoice Line Items / Products-Items / Customers; DFD says Trinvs_Master / Imtrans_Detail / PartyMst / DAY_END. There is no product *master* table in the documented source set — product data is embedded in `Imtrans_Detail`. If a product-master table exists among the other 22 source tables, it should be identified and documented.
10. **Billing UI contradiction:** the proposal's per-shop diagram lists "Billing" inside the SalesSphere React app, while the core principle says SalesSphere never touches billing (the existing software bills). The React app should be analytics/reporting only.
11. **Loyalty write-back contradiction:** "₹100 = 10 points, redeemable for discounts" implies *writing* redemption data back into the billing flow — impossible under the read-only rule. Loyalty must be report-only (compute points from synced sales) unless the sponsor's billing software handles redemption.

---

## 8. Technical Risks (beyond what the handover already flags)

1. **SQL Server 2005 connectivity:** modern Microsoft JDBC drivers (`mssql-jdbc` 6.x+) no longer officially support SQL Server 2005. If connection fails at step 01, try an older driver (sqljdbc4) or jTDS 1.3.1, and confirm the actual version with `SELECT @@VERSION`. Also expect classic Express gotchas: TCP/IP disabled by default, named instance `SQLEXPRESS` with dynamic port instead of 1433, Windows-vs-SQL authentication mode.
2. **Doc_No reset risk:** many Indian billing systems reset invoice numbers each financial year. If `Doc_No` restarts, `Branch_Code + Doc_Type + Doc_No` is *not* unique across years and the composite identity must include the year — otherwise the upsert would silently merge different years' invoices. Verify this against the data during step 02/03.
3. **Walk-in customers:** cash bills may have no `Party_No`. The target `invoices.customer_id` FK must be nullable (or a "Walk-in" sentinel row) — confirm before the first sync.
4. **Hardware vs Ollama:** shop spec is minimum 8 GB RAM / i3. Spring Boot + MySQL + Electron + a local LLM on 8 GB is very tight; plan for a small quantized model (≤3B) or a rules-based fallback.
5. **Unauthenticated REST API:** the agent currently only masks credentials; JWT/Spring Security is planned but absent. Fine on localhost now, must land before the cloud/multi-shop phase.
6. **Data cleaning burden:** 100+ legacy columns per transaction table, free-text fields, and a 2005-era schema mean the Transform step is where most real bugs will surface.
7. **Scope realism:** competitor price tracking has no data source (manual entry by definition) and Random-Forest demand forecasting needs more history than one shop-year provides. Position them as stretch goals; FSN + moving-average trends are the achievable core.

---

## 9. Next Steps (aligned with the handover's 6-step priority)

The handover defines the order; nothing in analytics can start until these pass:

1. Validate SQL Server Express connection on localhost:1433 (and confirm actual server version).
2. Source-config test via `GET /api/config/source`; verify all 4 core tables and column names against the JPA mappings.
3. First `POST /api/sync/run`; inspect and count MySQL rows against SQL Server.
4. Second sync run → prove idempotency (identical row counts, no duplicates).
5. Dynamic-config audit via `PUT /api/config/source` without restart.
6. Verify `Im_Remaining_Qty` against a physical stock count (sponsor involvement).

My additions, to resolve before/while building analytics: confirm whether `Doc_No` resets per financial year; confirm whether all 3 outlets share this one billing DB (via `Branch_Code`); decide walk-in-customer handling; reconcile the schema documentation (V1 vs DFD vs ERD).

---

## 10. Open Questions for the Sponsor / Guide

1. Does the single BILLING database cover **all three outlets** (via `Branch_Code`), or only the main sports shop? This decides the entire multi-shop strategy.
2. Do the two garments shops use the same billing software and database?
3. What is the invoice-number reset policy (per year / per branch / continuous)?
4. Is `Im_Remaining_Qty` trusted as current stock by the shop staff? (Physical count cross-check.)
5. How are cash/walk-in bills recorded — with or without a party record?
6. Is any write-back ever expected (loyalty redemption), or is reporting-only acceptable?
7. What hardware will the final deployment run on (chatbot feasibility)?
8. What is the realistic internet-availability pattern at the shops (cloud-sync phase planning)?
