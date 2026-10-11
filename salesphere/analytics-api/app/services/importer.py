"""CSV / Excel data import for SalesSphere.

Accepts shop-exported billing files (CSV or Excel) and upserts them into the SAME
normalized target schema the sync agent maintains — same composite invoice identity
(branch_code, doc_type, doc_no), same idempotent INSERT ... ON DUPLICATE KEY UPDATE
semantics, so re-importing a file never duplicates data.

Supported layouts:
- single-kind CSV / XLSX (kind forced or auto-detected)
- bulk XLSX workbook with one sheet per kind (Invoices, InvoiceItems, Customers,
  Products, DayEnd) — sheet names are matched fuzzily

Doc_No derivation: many shop exports carry only a bill number string. When no numeric
Doc_No is present it is derived as CRC32(branch|bill_no) % 1e9 — deterministic, so the
same bill always maps to the same identity and re-imports stay idempotent.
"""
import datetime as dt
import io
import json
import re
import zlib
from pathlib import Path

import pandas as pd
from sqlalchemy import text

from ..db import engine

TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates"

KINDS = ("invoices", "invoice_items", "customers", "products", "day_end",
         "sales_bills", "purchase_bills", "stock_items")

# column aliases -> canonical names (matched after lowercasing/stripping)
ALIASES = {
    "invoices": {
        "doc_no": ["doc_no", "docno", "doc number", "invoice_no", "invoiceno", "bill_no", "billno", "bill no", "bill", "invoice"],
        "bill_no": ["bill_no", "billno", "bill no", "bill"],
        "branch_code": ["branch_code", "branch", "branchcode", "shop", "outlet"],
        "doc_type": ["doc_type", "doctype", "type"],
        "invoice_date": ["invoice_date", "date", "doc_date", "bill_date", "billdate"],
        "invoice_time": ["invoice_time", "time", "doc_time"],
        "party_no": ["party_no", "partyno", "customer_id", "customerid", "ledger_no"],
        "customer_name": ["customer_name", "customer", "customername", "party_name", "partyname", "name"],
        "doc_value": ["doc_value", "docvalue", "amount", "total", "gross", "gross_amount", "subtotal", "value"],
        "discount": ["discount", "disc"],
        "total_amount": ["total_amount", "net", "net_amount", "net_total", "new_total", "grand_total", "payable"],
        "total_qty": ["total_qty", "qty", "quantity", "items"],
    },
    "invoice_items": {
        "doc_no": ["doc_no", "docno", "bill_no", "billno", "bill no", "invoice_no", "invoiceno", "bill", "invoice"],
        "branch_code": ["branch_code", "branch", "branchcode", "shop", "outlet"],
        "doc_type": ["doc_type", "doctype", "type"],
        "source_item_no": ["source_item_no", "item_no", "itemno", "sr", "sr_no", "srno", "sl", "slno", "line"],
        "item_code": ["item_code", "itemcode", "code", "sku", "item id"],
        "item_name": ["item_name", "itemname", "item", "product", "product_name", "description", "particulars"],
        "bar_code": ["bar_code", "barcode", "ean", "upc"],
        "size": ["size"],
        "uom": ["uom", "unit", "units"],
        "hsn_code": ["hsn_code", "hsn", "hsncode"],
        "category": ["category", "product_type", "group", "item_group"],
        "quantity": ["quantity", "qty", "sold", "im_qty"],
        "purchase_qty": ["purchase_qty", "purchased_qty", "purchasequnty"],
        "purchase_price": ["purchase_price", "purchaseprice", "cost", "cost_price", "purchase_rate"],
        "sales_price": ["sales_price", "salesprice", "rate", "price", "selling_price", "mrp_price", "sale_price"],
        "mrp": ["mrp", "max_retail_price"],
        "supplier_name": ["supplier_name", "supplier", "vendor"],
        "batch_no": ["batch_no", "batch", "batchno"],
        "sp_id": ["sp_id", "spid"],
        "invoice_date": ["invoice_date", "date", "bill_date"],
        "customer_name": ["customer_name", "customer", "party_name", "name"],
    },
    "customers": {
        "party_no": ["party_no", "partyno", "customer_id", "customerid", "code", "ledger_no"],
        "party_name": ["party_name", "partyname", "customer_name", "customername", "customer", "name"],
        "phone": ["phone", "mobile", "contact", "phone_no", "mobile_no", "party_tel", "tel"],
        "email": ["email", "e_mail", "mail"],
        "address": ["address", "party_add", "addr"],
        "city": ["city", "party_city", "town"],
        "state": ["state", "party_state"],
        "credit_limit": ["credit_limit", "creditlimit"],
        "opening_balance": ["opening_balance", "openingbal", "opening"],
        "membership_id": ["membership_id", "membership", "membershipid"],
        "branch_code": ["branch_code", "branch", "branchcode"],
    },
    "products": {
        "item_code": ["item_code", "itemcode", "code", "sku"],
        "item_name": ["item_name", "itemname", "name", "item", "product", "product_name"],
        "short_name": ["short_name", "shortname"],
        "bar_code": ["bar_code", "barcode", "ean"],
        "size": ["size"],
        "uom": ["uom", "unit"],
        "hsn_code": ["hsn_code", "hsn"],
        "category": ["category", "group", "item_group", "product_type"],
        "sales_price": ["sales_price", "salesprice", "price", "rate", "selling_price"],
        "purchase_price": ["purchase_price", "purchaseprice", "cost", "cost_price"],
        "mrp": ["mrp"],
    },
    "day_end": {
        "branch_code": ["branch_code", "branch", "branchcode", "shop"],
        "day_end_date": ["day_end_date", "date", "dayenddate", "day"],
        "total_sales": ["total_sales", "sales", "sale"],
        "total_purchase": ["total_purchase", "purchase", "purchases"],
        "total_collection": ["total_collection", "collection", "collections", "cash_in"],
        "total_payment": ["total_payment", "payment", "payments", "cash_out"],
        "closing_balance": ["closing_balance", "closing", "closingbal"],
        "remarks": ["remarks", "remark", "notes"],
    },
}

REQUIRED = {
    "invoices": [("doc_no", "bill/document number"), ("invoice_date", "date")],
    "invoice_items": [("doc_no", "bill/document number"), ("item_code", "item code"), ("quantity", "quantity")],
    "customers": [("party_name", "customer name")],
    "products": [("item_code", "item code"), ("item_name", "item name")],
    "day_end": [("day_end_date", "date"), ("total_sales", "total sales")],
}


# ----------------------------------------------------------------- file reading

def read_tables(raw: bytes, filename: str) -> dict:
    """Returns {kind_or_sheetname: DataFrame} with string-normalized headers.

    Handles shop-report exports where the header row is NOT the first row
    (e.g. SR/PR reports carry ~9 title/summary rows first): the header row is
    located by scanning for the row with the most filled cells.
    """
    lower = filename.lower()
    # trust content over extension: PK magic = xlsx container
    is_xlsx = raw[:2] == b"PK"
    if lower.endswith((".xlsx", ".xlsm")) or is_xlsx:
        xl = pd.ExcelFile(io.BytesIO(raw), engine="openpyxl")
        out = {}
        for sheet in xl.sheet_names:
            df = xl.parse(sheet, dtype=str)
            df = _promote_header_row(df)
            kind = match_sheet_kind(sheet)
            out[kind or sheet] = normalize_headers(df)
        return out
    # CSV: try utf variants then fall back
    for enc in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            df = pd.read_csv(io.BytesIO(raw), encoding=enc, dtype=str)
            return {"_file": normalize_headers(_promote_header_row(df))}
        except UnicodeDecodeError:
            continue
    raise ValueError("Could not decode the CSV file (tried utf-8 and latin-1)")


def _promote_header_row(df: pd.DataFrame) -> pd.DataFrame:
    """If a datafile has title/blank rows above the real header (report exports),
    shift the header down to the row with the most filled cells."""
    df = df.dropna(how="all").reset_index(drop=True)
    if df.empty:
        return df
    nonnull = df.notna().sum(axis=1)
    # 1) strong signal: a row whose cells contain known header words
    header_tokens = ("bill date", "sr no", "item name", "supplier name",
                     "customer name", "doc no", "bill no", "party no", "item code")
    for i in range(min(30, len(df))):
        cells = [str(v).strip().lower() for v in df.iloc[i].tolist() if pd.notna(v)]
        if len(cells) < 4:
            continue
        joined = " | ".join(cells)
        hits = sum(1 for t in header_tokens if t in joined)
        if hits >= 2 and i > 0:
            new_cols = [str(v).strip() if pd.notna(v) else f"col{j}" for j, v in enumerate(df.iloc[i])]
            body = df.iloc[i + 1:].reset_index(drop=True)
            body.columns = new_cols
            return body
        if hits >= 2:
            return df  # header is already row 0
    # 2) fallback: promote only on clear evidence of title rows above the header
    best = int(nonnull.idxmax())
    if best > 0 and nonnull.iloc[0] < max(4, nonnull.iloc[best] * 0.6):
        new_cols = [str(v).strip() if pd.notna(v) else f"col{i}" for i, v in enumerate(df.iloc[best])]
        body = df.iloc[best + 1:].reset_index(drop=True)
        body.columns = new_cols
        return body
    return df


def match_sheet_kind(sheet_name: str):
    s = sheet_name.lower().replace(" ", "").replace("_", "")
    if "invoiceitem" in s or "item" in s and "invoice" in s:
        return "invoice_items"
    if "invoice" in s or "bill" in s or "sale" in s:
        return "invoices"
    if "customer" in s or "party" in s:
        return "customers"
    if "product" in s or ("itemmaster" in s):
        return "products"
    if "dayend" in s or "summary" in s:
        return "day_end"
    return None


def normalize_headers(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = [str(c).strip().lower() for c in df.columns]
    return df.dropna(how="all")


def map_columns(df: pd.DataFrame, kind: str) -> pd.DataFrame:
    """Renames aliased columns to canonical names; unmatched columns pass through."""
    aliases = ALIASES[kind]
    canon_alias = {k: {_canon(o) for o in opts} for k, opts in aliases.items()}
    ren, seen = {}, set()
    for col in df.columns:
        c = _canon(col)
        for canon, options in canon_alias.items():
            if canon in seen:
                continue
            if c in options:
                ren[col] = canon
                seen.add(canon)
                break
    return df.rename(columns=ren)


def _canon(name) -> str:
    """Canonical column key: lowercase, non-alphanumeric runs -> single underscore."""
    return re.sub(r"[^a-z0-9]+", "_", str(name).strip().lower()).strip("_")


def _canon_columns(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    seen = {}
    cols = []
    for c in df.columns:
        k = _canon(c) or f"col{len(cols)}"
        if k in seen:
            seen[k] += 1
            k = f"{k}_{seen[k]}"
        else:
            seen[k] = 0
        cols.append(k)
    df.columns = cols
    return df


def detect_kind(df: pd.DataFrame) -> str:
    cols = {_canon(c) for c in df.columns}
    # shop report exports (Indo Sports billing software)
    if "supplier_name" in cols and "bill_amount" in cols:
        return "purchase_bills"
    if ("customer_name" in cols and "net_bill_amt" in cols) or (
            "customer_name" in cols and "bill_amount" in cols and "doc_no" in cols):
        return "sales_bills"
    if "item_name" in cols and "stock" in cols and "quantity" not in cols:
        return "stock_items"
    if {"item_code", "quantity"} & cols and ("doc_no" in cols or "bill_no" in cols):
        return "invoice_items"
    if "day_end_date" in cols or ("total_sales" in cols and "branch_code" in cols and "item_code" not in cols):
        return "day_end"
    if "credit_limit" in cols or ("phone" in cols and "party_name" in cols) or ("party_name" in cols and "doc_no" not in cols and "quantity" not in cols):
        return "customers"
    if "item_code" in cols and "doc_no" not in cols and "quantity" not in cols:
        return "products"
    if "doc_no" in cols or "bill_no" in cols:
        return "invoices"
    raise ValueError(
        "Could not auto-detect the data type. Pick the type manually "
        "(Invoices / Invoice line items / Customers / Products / Daily summaries)."
    )


# ----------------------------------------------------------------- value helpers

def clean_str(v, maxlen=None):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    s = str(v).strip()
    if s == "" or s.lower() in ("nan", "none", "null"):
        return None
    return s[:maxlen] if maxlen else s


def clean_num(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    try:
        s = str(v).replace(",", "").replace("₹", "").strip()
        if s.lower().startswith("rs"):
            s = s[2:].strip()
        f = float(s)
        return f if f == f else None  # NaN guard
    except (ValueError, TypeError):
        return None


def clean_date(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    if isinstance(v, (dt.datetime, pd.Timestamp)):
        ts = pd.Timestamp(v)
        return None if pd.isna(ts) else ts.to_pydatetime().replace(tzinfo=None)
    s = str(v).strip()
    # ISO dates (2026-10-05) are unambiguous: parse strictly. pandas' dayfirst=True
    # would otherwise RE-INTERPRET ISO dates as YYYY-DD-MM (verified bug).
    if re.match(r"^\d{4}-\d{1,2}-\d{1,2}", s):
        ts = pd.to_datetime(s, errors="coerce")
    else:
        # Indian convention: day comes first (05/10/2026 = 5 Oct)
        ts = pd.to_datetime(s, dayfirst=True, errors="coerce")
    return None if pd.isna(ts) else ts.to_pydatetime().replace(tzinfo=None)


def derive_doc_no(branch: str, bill: str) -> int:
    return zlib.crc32(f"{branch or ''}|{bill}".encode()) % 1_000_000_000


# ----------------------------------------------------------------- upserts

UPSERT_SQL = {
    "customers": text("""
        INSERT INTO customers (batch_id, source_party_no, party_name, phone, email, address, city, state,
            credit_limit, opening_balance, membership_id, source_branch_code)
        VALUES (:batch_id, :source_party_no, :party_name, :phone, :email, :address, :city, :state,
            :credit_limit, :opening_balance, :membership_id, :source_branch_code) AS new
        ON DUPLICATE KEY UPDATE batch_id=new.batch_id, party_name=new.party_name, phone=new.phone,
            email=new.email, address=new.address, city=new.city, state=new.state,
            credit_limit=new.credit_limit, opening_balance=new.opening_balance,
            membership_id=new.membership_id, source_branch_code=new.source_branch_code"""),
    "products": text("""
        INSERT INTO products (batch_id, item_code, item_name, short_name, bar_code, size, uom, hsn_code,
            category, sales_price, purchase_price, mrp, brand, department, colour, design_no,
            stock_qty, stock_as_on)
        VALUES (:batch_id, :item_code, :item_name, :short_name, :bar_code, :size, :uom, :hsn_code,
            :category, :sales_price, :purchase_price, :mrp, :brand, :department, :colour,
            :design_no, :stock_qty, :stock_as_on) AS new
        ON DUPLICATE KEY UPDATE batch_id=new.batch_id, item_name=new.item_name, short_name=new.short_name,
            bar_code=new.bar_code, size=new.size, uom=new.uom, hsn_code=new.hsn_code,
            category=new.category, sales_price=new.sales_price,
            purchase_price=new.purchase_price, mrp=new.mrp,
            brand=COALESCE(new.brand, products.brand),
            department=COALESCE(new.department, products.department),
            colour=COALESCE(new.colour, products.colour),
            design_no=COALESCE(new.design_no, products.design_no),
            stock_qty=new.stock_qty, stock_as_on=new.stock_as_on"""),
    "purchases": text("""
        INSERT INTO purchases (batch_id, source_branch_code, doc_no, bill_no, bill_date, supplier_name,
            bill_amount, taxable_amount, tax_amount)
        VALUES (:batch_id, :source_branch_code, :doc_no, :bill_no, :bill_date, :supplier_name,
            :bill_amount, :taxable_amount, :tax_amount) AS new
        ON DUPLICATE KEY UPDATE batch_id=new.batch_id, bill_date=new.bill_date,
            supplier_name=new.supplier_name, bill_amount=new.bill_amount,
            taxable_amount=new.taxable_amount, tax_amount=new.tax_amount"""),
    "item_monthly_sales": text("""
        INSERT INTO item_monthly_sales (batch_id, item_code, ym, qty, value)
        VALUES (:batch_id, :item_code, :ym, :qty, :value) AS new
        ON DUPLICATE KEY UPDATE batch_id=new.batch_id, qty=new.qty, value=new.value"""),
    "invoices": text("""
        INSERT INTO invoices (batch_id, source_branch_code, source_doc_type, source_doc_no, invoice_date,
            invoice_time, customer_id, customer_name, bill_no, doc_value, doc_discount,
            total_amount, total_qty)
        VALUES (:batch_id, :source_branch_code, :source_doc_type, :source_doc_no, :invoice_date,
            :invoice_time, :customer_id, :customer_name, :bill_no, :doc_value, :doc_discount,
            :total_amount, :total_qty) AS new
        ON DUPLICATE KEY UPDATE batch_id=new.batch_id, invoice_date=new.invoice_date,
            invoice_time=new.invoice_time, customer_id=new.customer_id,
            customer_name=new.customer_name, bill_no=new.bill_no,
            doc_value=new.doc_value, doc_discount=new.doc_discount,
            total_amount=new.total_amount, total_qty=new.total_qty"""),
    "invoice_items": text("""
        INSERT INTO invoice_items (batch_id, invoice_id, source_branch_code, source_doc_type, source_doc_no,
            source_item_no, item_code, item_name, bar_code, size, uom, hsn_code, category,
            quantity, purchase_qty, purchase_price, sales_price, mrp, supplier_name, batch_no, sp_id)
        VALUES (:batch_id, :invoice_id, :source_branch_code, :source_doc_type, :source_doc_no, :source_item_no,
            :item_code, :item_name, :bar_code, :size, :uom, :hsn_code, :category,
            :quantity, :purchase_qty, :purchase_price, :sales_price, :mrp, :supplier_name, :batch_no, :sp_id) AS new
        ON DUPLICATE KEY UPDATE batch_id=new.batch_id, item_code=new.item_code, item_name=new.item_name,
            bar_code=new.bar_code, size=new.size, uom=new.uom, hsn_code=new.hsn_code,
            category=new.category, quantity=new.quantity, purchase_qty=new.purchase_qty,
            purchase_price=new.purchase_price, sales_price=new.sales_price, mrp=new.mrp,
            supplier_name=new.supplier_name, batch_no=new.batch_no, sp_id=new.sp_id"""),
    "day_end": text("""
        INSERT INTO day_end (batch_id, source_branch_code, day_end_date, total_sales, total_purchase,
            total_collection, total_payment, closing_balance, remarks)
        VALUES (:batch_id, :source_branch_code, :day_end_date, :total_sales, :total_purchase,
            :total_collection, :total_payment, :closing_balance, :remarks) AS new
        ON DUPLICATE KEY UPDATE batch_id=new.batch_id, total_sales=new.total_sales,
            total_purchase=new.total_purchase, total_collection=new.total_collection,
            total_payment=new.total_payment, closing_balance=new.closing_balance, remarks=new.remarks"""),
}


def _exec_upsert(kind: str, rows: list) -> int:
    if not rows:
        return 0
    with engine.begin() as conn:
        conn.execute(UPSERT_SQL[kind], rows)
    return len(rows)


def _load_customer_id_map() -> dict:
    with engine.connect() as conn:
        rows = conn.execute(text("SELECT id, source_party_no FROM customers")).all()
    return {r[1]: r[0] for r in rows if r[1]}


def _load_invoice_id_map() -> dict:
    with engine.connect() as conn:
        rows = conn.execute(text(
            "SELECT id, source_branch_code, source_doc_type, source_doc_no FROM invoices")).all()
    return {f"{r[1]}|{r[2]}|{r[3]}": r[0] for r in rows}


# ----------------------------------------------------------------- row builders

def build_customer_rows(df, default_branch):
    rows, errors = [], []
    for i, r in df.iterrows():
        name = clean_str(r.get("party_name"), 100)
        if not name:
            errors.append({"row": int(i) + 2, "error": "missing customer name"})
            continue
        party_no = clean_str(r.get("party_no"), 7) or derive_key_str(name, clean_str(r.get("phone"), 20))
        rows.append(dict(
            source_party_no=party_no[:7], party_name=name,
            phone=clean_str(r.get("phone"), 50), email=clean_str(r.get("email"), 100),
            address=clean_str(r.get("address"), 255), city=clean_str(r.get("city"), 50),
            state=clean_str(r.get("state"), 50),
            credit_limit=clean_num(r.get("credit_limit")),
            opening_balance=clean_num(r.get("opening_balance")),
            membership_id=clean_str(r.get("membership_id"), 50),
            source_branch_code=clean_str(r.get("branch_code"), 2) or default_branch,
        ))
    return rows, errors


def build_product_rows(df, default_branch):
    rows, errors = [], []
    for i, r in df.iterrows():
        code = clean_str(r.get("item_code"), 50)
        name = clean_str(r.get("item_name"), 100)
        if not code or not name:
            errors.append({"row": int(i) + 2, "error": "missing item_code or item_name"})
            continue
        rows.append(dict(
            item_code=code, item_name=name,
            short_name=clean_str(r.get("short_name"), 50) or name[:50],
            bar_code=clean_str(r.get("bar_code"), 50), size=clean_str(r.get("size"), 30),
            uom=clean_str(r.get("uom"), 30) or "PCS", hsn_code=clean_str(r.get("hsn_code"), 30),
            category=clean_str(r.get("category"), 50),
            sales_price=clean_num(r.get("sales_price")),
            purchase_price=clean_num(r.get("purchase_price")),
            mrp=clean_num(r.get("mrp")),
            brand=None, department=None, colour=None, design_no=None,
            stock_qty=None, stock_as_on=None,
        ))
    return rows, errors


def derive_key_str(*parts) -> str:
    return f"IMP{zlib.crc32(('|'.join(str(p) for p in parts)).encode()) % 10_000_000:07d}"[:7]


def build_invoice_rows(df, default_branch):
    rows, errors = [], []
    for i, r in df.iterrows():
        bill = clean_str(r.get("doc_no"), 50) or clean_str(r.get("bill_no"), 50)
        date = clean_date(r.get("invoice_date"))
        if not bill:
            errors.append({"row": int(i) + 2, "error": "missing bill/document number"})
            continue
        if date is None:
            errors.append({"row": int(i) + 2, "error": "missing or unreadable date"})
            continue
        branch = clean_str(r.get("branch_code"), 2) or default_branch or "01"
        doc_type = int(clean_num(r.get("doc_type")) or 1)
        doc_no_raw = clean_num(r.get("doc_no"))
        doc_no = int(doc_no_raw) if doc_no_raw is not None else derive_doc_no(branch, bill)
        amount = clean_num(r.get("total_amount"))
        doc_value = clean_num(r.get("doc_value"))
        if amount is None and doc_value is None:
            errors.append({"row": int(i) + 2, "error": "missing amount/total column"})
            continue
        time_v = clean_date(r.get("invoice_time"))
        rows.append(dict(
            source_branch_code=branch, source_doc_type=doc_type, source_doc_no=doc_no,
            invoice_date=date,
            invoice_time=time_v.time() if time_v else (date.time() if date else None),
            customer_id=None, customer_name=clean_str(r.get("customer_name"), 100),
            bill_no=bill, doc_value=doc_value if doc_value is not None else amount,
            doc_discount=clean_num(r.get("discount")) or 0,
            total_amount=amount if amount is not None else doc_value,
            total_qty=clean_num(r.get("total_qty")),
        ))
    return rows, errors


def build_item_rows(df, default_branch, autocreate_headers=True):
    """Line items; optionally synthesizes invoice headers from the same file."""
    raw_rows, errors = [], []
    for i, r in df.iterrows():
        bill = clean_str(r.get("doc_no"), 50) or clean_str(r.get("bill_no"), 50)
        code = clean_str(r.get("item_code"), 50)
        qty = clean_num(r.get("quantity"))
        if not bill:
            errors.append({"row": int(i) + 2, "error": "missing bill/document number"})
            continue
        if not code:
            errors.append({"row": int(i) + 2, "error": "missing item_code"})
            continue
        if qty is None:
            errors.append({"row": int(i) + 2, "error": "missing quantity"})
            continue
        branch = clean_str(r.get("branch_code"), 2) or default_branch or "01"
        doc_type = int(clean_num(r.get("doc_type")) or 1)
        doc_no_raw = clean_num(r.get("doc_no"))
        doc_no = int(doc_no_raw) if doc_no_raw is not None else derive_doc_no(branch, bill)
        raw_rows.append(dict(
            source_branch_code=branch, source_doc_type=doc_type, source_doc_no=doc_no,
            source_item_no=clean_num(r.get("source_item_no")),
            item_code=code, item_name=clean_str(r.get("item_name"), 100),
            bar_code=clean_str(r.get("bar_code"), 50), size=clean_str(r.get("size"), 30),
            uom=clean_str(r.get("uom"), 30) or "PCS", hsn_code=clean_str(r.get("hsn_code"), 30),
            category=clean_str(r.get("category"), 50), quantity=qty,
            purchase_qty=clean_num(r.get("purchase_qty")) or 0,
            purchase_price=clean_num(r.get("purchase_price")),
            sales_price=clean_num(r.get("sales_price")), mrp=clean_num(r.get("mrp")),
            supplier_name=clean_str(r.get("supplier_name"), 100),
            batch_no=clean_str(r.get("batch_no"), 50), sp_id=clean_str(r.get("sp_id"), 50),
            _bill=bill, _date=clean_date(r.get("invoice_date")),
            _customer=clean_str(r.get("customer_name"), 100),
        ))

    # de-dup line numbers within a bill (stable: file order)
    counters, invoices_needed = {}, {}
    for r in raw_rows:
        key = f"{r['source_branch_code']}|{r['source_doc_type']}|{r['source_doc_no']}"
        counters[key] = counters.get(key, 0) + 1
        if r["source_item_no"] is None:
            r["source_item_no"] = counters[key]
        if key not in invoices_needed:
            invoices_needed[key] = r

    invoice_rows = []
    if autocreate_headers:
        for key, r in invoices_needed.items():
            if r["_date"] is None:
                errors.append({"row": 0, "error": f"bill {r['_bill']}: rows carry no usable date; header skipped"})
                continue
            invoice_rows.append(dict(
                source_branch_code=r["source_branch_code"], source_doc_type=r["source_doc_type"],
                source_doc_no=r["source_doc_no"], invoice_date=r["_date"],
                invoice_time=r["_date"].time(), customer_id=None,
                customer_name=r["_customer"], bill_no=r["_bill"],
                doc_value=None, doc_discount=0, total_amount=None, total_qty=None,
            ))
        _exec_upsert("invoices", invoice_rows)

    id_map = _load_invoice_id_map()
    rows, missing = [], 0
    for r in raw_rows:
        key = f"{r['source_branch_code']}|{r['source_doc_type']}|{r['source_doc_no']}"
        inv_id = id_map.get(key)
        if inv_id is None:
            missing += 1
            errors.append({"row": 0, "error": f"bill {r['_bill']}: no matching invoice header (and header autocreate was off or had no date)"})
            continue
        r["invoice_id"] = inv_id
        rows.append({k: v for k, v in r.items() if not k.startswith("_")})
    if missing:
        errors.append({"row": 0, "error": f"{missing} line(s) skipped for missing invoice headers"})
    touched_ids = sorted({int(r["invoice_id"]) for r in rows})
    return rows, errors, touched_ids


def backfill_invoice_totals(touched_ids: list) -> None:
    """Fill doc_value/total_amount/total_qty on headers that were auto-created from a
    line-items file (those columns are unknown until the lines are inserted). Must be
    called AFTER the item upsert. COALESCE keeps explicitly imported amounts."""
    if not touched_ids:
        return
    ids_csv = ",".join(str(int(i)) for i in touched_ids)
    with engine.begin() as conn:
        conn.execute(text(f"""
            UPDATE invoices i
            JOIN (
                SELECT invoice_id,
                       SUM(quantity * COALESCE(sales_price, 0)) AS rev,
                       SUM(quantity) AS qty
                FROM invoice_items
                WHERE invoice_id IN ({ids_csv})
                GROUP BY invoice_id
            ) t ON t.invoice_id = i.id
            SET i.doc_value    = COALESCE(i.doc_value, t.rev),
                i.total_amount = COALESCE(i.total_amount, t.rev),
                i.total_qty    = COALESCE(i.total_qty, t.qty)
            WHERE i.id IN ({ids_csv})
        """))


# ------------------------------------------------------- shop report exports (real data)

def build_sales_bills_rows(df, default_branch):
    """SR report (bill-level sales): DOC NO, BILL DATE, BILL NO, CUSTOMER NAME,
    BILL AMOUNT, NET BILL AMT. Customer names often embed a phone number
    ('9876543210 RAMESH') - the digits become the customer key."""
    cust_rows, inv_rows, errors = [], [], []
    for i, r in df.iterrows():
        bill = clean_str(r.get("bill_no"), 50)
        doc_raw = clean_num(r.get("doc_no"))
        date = clean_date(r.get("bill_date") or r.get("invoice_date"))
        if not bill and doc_raw is None:
            continue  # blank / totals row
        if date is None:
            errors.append({"row": int(i) + 2, "error": "missing or unreadable BILL DATE"})
            continue
        branch = clean_str(r.get("branch_code"), 2) or default_branch or "01"
        doc_no = int(doc_raw) if doc_raw is not None else derive_doc_no(branch, bill or str(doc_raw))
        amount = clean_num(r.get("bill_amount"))
        net = clean_num(r.get("net_bill_amt"))
        if amount is None and net is None:
            errors.append({"row": int(i) + 2, "error": "missing BILL AMOUNT / NET BILL AMT"})
            continue

        raw_name = clean_str(r.get("customer_name"), 100)
        party_no, display = None, None
        if raw_name:
            m = re.search(r"(\d{10,12})", raw_name)
            if m:
                party_no = m.group(1)
                display = raw_name.replace(m.group(1), "").strip() or raw_name[:60]
            else:
                display = raw_name
        if party_no:
            cust_rows.append(dict(
                source_party_no=party_no[:20], party_name=display[:100], phone=party_no,
                email=None, address=None, city=None, state=None, credit_limit=None,
                opening_balance=None, membership_id=None, source_branch_code=branch,
            ))
        inv_rows.append(dict(
            source_branch_code=branch, source_doc_type=1, source_doc_no=doc_no,
            invoice_date=date, invoice_time=date.time(),
            customer_id=None, customer_name=display or raw_name,
            bill_no=bill or str(doc_no),
            doc_value=amount if amount is not None else net,
            doc_discount=max((amount or 0) - (net or 0), 0) if net is not None else 0,
            total_amount=net if net is not None else amount,
            total_qty=None,
            _party=party_no,
        ))
    # dedupe customers; caller upserts them (stamped) before the invoices
    seen, deduped = set(), []
    for c in cust_rows:
        if c["source_party_no"] not in seen:
            seen.add(c["source_party_no"])
            deduped.append(c)
    return inv_rows, deduped, errors


def build_purchase_rows(df, default_branch):
    """PR report (purchase bills): DOC NO, BILL DATE, BILL NO, SUPPLIER NAME,
    BILL AMOUNT, TAXABLE BILL AMT, TAX AMT."""
    rows, errors = [], []
    for i, r in df.iterrows():
        bill = clean_str(r.get("bill_no"), 50)
        date = clean_date(r.get("bill_date"))
        amount = clean_num(r.get("bill_amount"))
        if not bill or date is None or amount is None:
            if bill or date or amount:
                errors.append({"row": int(i) + 2, "error": "row needs BILL NO, BILL DATE and BILL AMOUNT"})
            continue
        doc_raw = clean_num(r.get("doc_no"))
        branch = clean_str(r.get("branch_code"), 2) or default_branch or "01"
        rows.append(dict(
            source_branch_code=branch,
            doc_no=int(doc_raw) if doc_raw is not None else None,
            bill_no=bill, bill_date=date.date(),
            supplier_name=clean_str(r.get("supplier_name"), 150),
            bill_amount=amount,
            taxable_amount=clean_num(r.get("taxable_bill_amt")),
            tax_amount=clean_num(r.get("tax_amt")),
        ))
    return rows, errors


def build_stock_item_rows(df, default_branch):
    """Stock Report: ITEM NAME, FIT/STYLE, BRAND, DEPARTMENT, SIZE GROUP, DESIGN NO,
    COLOUR, Size, Purchase_Price, MRP, Stock, <one qty column per month>.
    Item identity is derived deterministically from name+fit+size+design."""
    month_cols = [c for c in df.columns if re.match(r"^\d{4}[_-]\d{2}[_-]\d{2}", str(c))]
    prod_rows, month_rows, errors = [], [], []
    for i, r in df.iterrows():
        name = clean_str(r.get("item_name"), 100)
        if not name:
            continue
        fit = clean_str(r.get("fit_/_style"), 50) or clean_str(r.get("fit_style"), 50)
        size = clean_str(r.get("size"), 30)
        design = clean_str(r.get("design_no"), 50)
        code = "IT-" + str(zlib.crc32(f"{name}|{fit}|{size}|{design}".encode()) % 10_000_000).zfill(7)
        prod_rows.append(dict(
            item_code=code, item_name=name, short_name=name[:50],
            bar_code=None, size=size, uom="PCS", hsn_code=None,
            category=fit, sales_price=None,
            purchase_price=clean_num(r.get("purchase_price")),
            mrp=clean_num(r.get("mrp")),
            brand=clean_str(r.get("brand"), 80),
            department=clean_str(r.get("department"), 80),
            colour=clean_str(r.get("colour"), 50),
            design_no=design,
            stock_qty=clean_num(r.get("stock")),
            stock_as_on=dt.date.today(),
        ))
        for mc in month_cols:
            q = clean_num(r.get(mc))
            if q:
                parts = re.findall(r"\d{1,4}", str(mc))
                ym = f"{parts[0]}-{parts[1]}-01"
                month_rows.append(dict(item_code=code, ym=ym, qty=q, value=None))
    return prod_rows, month_rows, errors


def build_day_end_rows(df, default_branch):
    rows, errors = [], []
    for i, r in df.iterrows():
        date = clean_date(r.get("day_end_date"))
        sales = clean_num(r.get("total_sales"))
        if date is None or sales is None:
            errors.append({"row": int(i) + 2, "error": "missing date or total_sales"})
            continue
        rows.append(dict(
            source_branch_code=clean_str(r.get("branch_code"), 2) or default_branch or "01",
            day_end_date=date.date(),
            total_sales=sales,
            total_purchase=clean_num(r.get("total_purchase")) or 0,
            total_collection=clean_num(r.get("total_collection")) or 0,
            total_payment=clean_num(r.get("total_payment")) or 0,
            closing_balance=clean_num(r.get("closing_balance")) or 0,
            remarks=clean_str(r.get("remarks"), 255),
        ))
    return rows, errors


BUILDERS = {
    "customers": build_customer_rows,
    "products": build_product_rows,
    "invoices": build_invoice_rows,
    "day_end": build_day_end_rows,
}


# ----------------------------------------------------------------- main entry

def run_import(raw: bytes, filename: str, kind: str, branch: str | None) -> dict:
    tables = read_tables(raw, filename)
    tables = {k: v for k, v in tables.items() if not v.empty}
    if not tables:
        raise ValueError("The file has no data rows.")

    total_read = total_ok = 0
    all_errors = []
    table_counts = {}
    kinds_used = []

    # create the run row first so every imported row can be stamped with batch_id
    with engine.begin() as conn:
        conn.execute(text("""
            INSERT INTO import_runs (filename, kinds, branch_code, rows_read, rows_ok, rows_failed, status)
            VALUES (:f, :k, :b, 0, 0, 0, 'RUNNING')
        """), dict(f=filename[:255], k=(kind if kind in KINDS else "auto")[:100], b=branch))
        run_id = int(conn.execute(text("SELECT LAST_INSERT_ID()")).scalar())

    for sheet, df in tables.items():
        k = kind if kind in KINDS else (sheet if sheet in KINDS else None)
        if k is None:
            k = detect_kind(df)
        kinds_used.append(k)
        mapped = (_canon_columns(df) if k in ("sales_bills", "purchase_bills", "stock_items")
                  else map_columns(df, k))
        touched_ids = []
        if k == "invoice_items":
            rows, errs, touched_ids = build_item_rows(mapped, branch)
            for r in rows:
                r["batch_id"] = run_id
            inserted = _exec_upsert(k, rows)
            if touched_ids:
                backfill_invoice_totals(touched_ids)
        elif k == "sales_bills":
            rows, cust_rows, errs = build_sales_bills_rows(mapped, branch)
            for r in cust_rows:
                r["batch_id"] = run_id
            _exec_upsert("customers", cust_rows)
            cust_map = _load_customer_id_map()
            for v in rows:
                v["customer_id"] = cust_map.get(v.pop("_party")) if v.get("_party") else None
                v["batch_id"] = run_id
            inserted = _exec_upsert("invoices", rows)
        elif k == "purchase_bills":
            rows, errs = build_purchase_rows(mapped, branch)
            for r in rows:
                r["batch_id"] = run_id
            inserted = _exec_upsert("purchases", rows)
        elif k == "stock_items":
            prod_rows, month_rows, errs = build_stock_item_rows(mapped, branch)
            for r in prod_rows:
                r["batch_id"] = run_id
            for r in month_rows:
                r["batch_id"] = run_id
            inserted = _exec_upsert("products", prod_rows)
            months = _exec_upsert("item_monthly_sales", month_rows)
            table_counts["item_monthly_sales"] = table_counts.get("item_monthly_sales", 0) + months
            rows = prod_rows
        else:
            rows, errs = BUILDERS[k](mapped, branch)
            for r in rows:
                r["batch_id"] = run_id
            inserted = _exec_upsert(k, rows)
        table_counts[k] = table_counts.get(k, 0) + inserted
        total_read += len(df)
        total_ok += len(rows)
        all_errors.extend(errs)

    status = "SUCCESS" if not all_errors else ("PARTIAL" if total_ok else "FAILED")
    errors_json = json.dumps(all_errors[:50]) if all_errors else None
    with engine.begin() as conn:
        conn.execute(text("""
            UPDATE import_runs SET kinds=:k, rows_read=:rr, rows_ok=:ro, rows_failed=:rf,
                status=:s, errors_json=:e, tables_json=:tj
            WHERE id=:id
        """), dict(k="+".join(sorted(set(kinds_used)))[:100], rr=total_read, ro=total_ok,
                    rf=len(all_errors), s=status, e=errors_json,
                    tj=json.dumps({k: v for k, v in sorted(table_counts.items())}), id=run_id))

    return {
        "ok": total_ok > 0,
        "run_id": run_id,
        "tables": {k: {"rows": v} for k, v in sorted(table_counts.items())},
        "rows_read": total_read,
        "rows_failed": len(all_errors),
        "errors": all_errors[:50],
        "status": status,
    }


DELETABLE_TABLES = ("invoice_items", "invoices", "customers", "products",
                    "purchases", "item_monthly_sales", "day_end", "daily_stock")


def delete_run(run_id: int) -> dict:
    """Deletes every row stamped with this import run's batch_id."""
    deleted = {}
    with engine.begin() as conn:
        exists = conn.execute(text("SELECT id FROM import_runs WHERE id=:i"), dict(i=run_id)).first()
        if not exists:
            raise ValueError(f"Import run {run_id} not found")
        for t in DELETABLE_TABLES:
            if t == "invoice_items":
                # line items join invoices that share the batch
                n = conn.execute(text(
                    "DELETE ii FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id "
                    "WHERE ii.batch_id = :b OR i.batch_id = :b"), dict(b=run_id)).rowcount
            else:
                n = conn.execute(text(f"DELETE FROM {t} WHERE batch_id = :b"), dict(b=run_id)).rowcount
            if n:
                deleted[t] = int(n)
        conn.execute(text("DELETE FROM import_runs WHERE id=:i"), dict(i=run_id))
    return {"ok": True, "deleted": deleted}


def erase_all() -> dict:
    """Full fresh start: removes ALL imported/analytics rows (schema is kept)."""
    cleared = {}
    with engine.begin() as conn:
        for t in DELETABLE_TABLES + ("sync_metadata", "import_runs"):
            n = conn.execute(text(f"DELETE FROM {t}")).rowcount
            cleared[t] = int(n)
    return {"ok": True, "cleared": cleared}


def import_history(limit=25) -> dict:
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT id, filename, kinds, branch_code, rows_read, rows_ok, rows_failed, status,
                   created_at, tables_json
            FROM import_runs ORDER BY id DESC LIMIT :lim
        """), dict(lim=limit)).mappings().all()
    runs = []
    for r in rows:
        d = dict(r)
        try:
            d["tables"] = json.loads(d.pop("tables_json") or "{}")
        except Exception:
            d["tables"] = {}
        runs.append(d)
    return {"runs": runs}


# ----------------------------------------------------------------- templates

TEMPLATE_COLUMNS = {
    "invoices": ["Doc_No", "Bill_No", "Date", "Branch_Code", "Customer_Name", "Doc_Value", "Discount", "Total_Amount"],
    "invoice_items": ["Doc_No", "Date", "Branch_Code", "Item_Code", "Item_Name", "Category", "Quantity", "Sales_Price", "Purchase_Price", "MRP", "Size", "UOM"],
    "customers": ["Party_No", "Customer_Name", "Phone", "Email", "Address", "City", "State", "Credit_Limit", "Opening_Balance", "Membership_ID", "Branch_Code"],
    "products": ["Item_Code", "Item_Name", "Category", "Size", "UOM", "HSN_Code", "Sales_Price", "Purchase_Price", "MRP", "Bar_Code"],
    "day_end": ["Branch_Code", "Date", "Total_Sales", "Total_Purchase", "Total_Collection", "Total_Payment", "Closing_Balance", "Remarks"],
}

TEMPLATE_SAMPLES = {
    "invoices": [["1001", "B-1001", "2026-10-01", "01", "Rahul Sharma", "2500", "100", "2400"]],
    "invoice_items": [["1001", "2026-10-01", "01", "SP-001", "Cricket Bat KW", "Bats", "1", "1200", "900", "1499", "FREE", "PCS"]],
    "customers": [["P0001", "Rahul Sharma", "9876543210", "rahul@example.com", "12 MG Road", "Pune", "Maharashtra", "50000", "0", "MEM0001", "01"]],
    "products": [["SP-001", "Cricket Bat KW", "Bats", "FREE", "PCS", "9506", "1200", "900", "1499", "8901234567890"]],
    "day_end": [["01", "2026-10-01", "45000", "12000", "45000", "0", "45000", ""]],
}

TEMPLATE_CSV = {
    "invoices": "1001,B-1001,2026-10-01,01,Rahul Sharma,2500,100,2400",
    "invoice_items": "1001,2026-10-01,01,SP-001,Cricket Bat KW,Bats,1,1200,900,1499,FREE,PCS",
    "customers": "P0001,Rahul Sharma,9876543210,rahul@example.com,12 MG Road,Pune,Maharashtra,50000,0,MEM0001,01",
    "products": "SP-001,Cricket Bat KW,Bats,FREE,PCS,9506,1200,900,1499,8901234567890",
    "day_end": "01,2026-10-01,45000,12000,45000,0,45000,",
}


def template_csv(kind: str) -> str:
    header = ",".join(TEMPLATE_COLUMNS[kind])
    return header + "\n" + TEMPLATE_CSV[kind] + "\n"


def template_bulk_xlsx() -> bytes:
    import openpyxl  # noqa: F401  (pandas needs it)
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        for kind in KINDS:
            df = pd.DataFrame(TEMPLATE_SAMPLES[kind], columns=TEMPLATE_COLUMNS[kind])
            sheet = {"invoices": "Invoices", "invoice_items": "InvoiceItems",
                     "customers": "Customers", "products": "Products",
                     "day_end": "DayEnd"}[kind]
            df.to_excel(writer, sheet_name=sheet, index=False)
    return buf.getvalue()
