"""SalesSphere chatbot v2: an LLM data agent that answers questions about the data.

1. Fast-path intent rules for common questions (instant, no LLM).
2. Otherwise the local LLM (Ollama) writes a READ-ONLY SQL SELECT against the
   documented schema; the SQL is validated hard (single statement, SELECT only,
   whitelisted tables, LIMIT enforced) and executed with a row cap.
3. The LLM phrases the final answer from the returned rows; rows + SQL are
   returned so the UI can render a table and show the query.
"""
import json
import re
import urllib.request
from datetime import date

from sqlalchemy import text as sql_text

from . import analytics
from .. import config
from ..db import engine

MAX_ROWS = 50

SCHEMA_DOC = """Tables (MySQL):
- invoices(id, source_branch_code VARCHAR(2), source_doc_type, source_doc_no, invoice_date DATETIME, customer_id INT NULL, customer_name VARCHAR(100), bill_no VARCHAR(50), doc_value DECIMAL, doc_discount DECIMAL, total_amount DECIMAL, total_qty DECIMAL)
- customers(id, source_party_no VARCHAR(20), party_name, phone, email, address, city, state, credit_limit DECIMAL, opening_balance, membership_id, source_branch_code)
- products(id, item_code VARCHAR(50), item_name, short_name, bar_code, size, uom, hsn_code, category, brand, department, colour, design_no, sales_price, purchase_price, mrp, stock_qty DECIMAL, stock_as_on DATE)
- purchases(id, source_branch_code, doc_no, bill_no, bill_date DATE, supplier_name VARCHAR(150), bill_amount, taxable_amount, tax_amount)
- invoice_items(id, invoice_id -> invoices.id, item_code, item_name, category, quantity, purchase_price, sales_price, mrp)  -- may be EMPTY when only bill-level reports were imported
- item_monthly_sales(item_code -> products.item_code, ym DATE (first of month), qty DECIMAL)  -- per-item monthly qty sold
- day_end(source_branch_code, day_end_date DATE, total_sales, total_purchase, total_collection, total_payment, closing_balance)

Rules:
- Revenue per bill = invoices.total_amount. "This month" = current calendar month.
- Per-item sold qty comes from item_monthly_sales (monthly granularity).
- Current stock per item = products.stock_qty.
- Branch codes: '01' sports main, '02'/'03' garments.
- Never assume columns that are not listed above."""


def is_ollama_available() -> bool:
    return _ollama_available()


def _ollama_available() -> bool:
    try:
        with urllib.request.urlopen(f"{config.OLLAMA_URL}/api/tags", timeout=2) as r:
            return r.status == 200
    except Exception:
        return False


def _ollama_chat(system: str, user: str, timeout: int = 120) -> str | None:
    body = json.dumps({
        "model": config.OLLAMA_MODEL,
        "stream": False,
        # qwen3 is a thinking model: thinking off = ~10x faster answers
        "think": False,
        "options": {"temperature": 0.15, "num_ctx": 6144, "num_predict": 400},
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user + " /no_think"},
        ],
    }).encode()
    req = urllib.request.Request(
        f"{config.OLLAMA_URL}/api/chat", data=body,
        headers={"Content-Type": "application/json"}, method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            data = json.loads(r.read().decode())
            content = (data.get("message") or {}).get("content") or ""
            content = re.sub(r"<think>.*?</think>", "", content, flags=re.S).strip()
            return content or None
    except Exception:
        return None


# ------------------------------------------------------------------ SQL guard

FORBIDDEN = re.compile(
    r"\b(insert|update|delete|drop|alter|create|truncate|replace|grant|revoke|"
    r"set|lock|call|use|information_schema|mysql\.|load_file|outfile|sleep|benchmark)\b",
    re.I,
)
ALLOWED_TABLES = {"invoices", "customers", "products", "purchases",
                  "invoice_items", "item_monthly_sales", "day_end"}


def validate_sql(sql: str) -> str:
    sql = (sql or "").strip().rstrip(";").strip()
    if not sql:
        raise ValueError("empty SQL")
    if ";" in sql:
        raise ValueError("multiple statements are not allowed")
    if not re.match(r"(?is)^\s*select\s", sql):
        raise ValueError("only SELECT queries are allowed")
    if FORBIDDEN.search(sql):
        raise ValueError("forbidden keyword in query")
    tables = {t.lower() for t in re.findall(r"(?is)\b(?:from|join)\s+([a-z_][a-z0-9_]*)", sql)}
    bad = tables - ALLOWED_TABLES
    if bad:
        raise ValueError("table(s) not allowed: " + ", ".join(sorted(bad)))
    if not re.search(r"(?is)\blimit\b", sql):
        sql += " LIMIT 50"
    return sql


def run_sql(sql: str):
    sql = validate_sql(sql)
    with engine.connect() as conn:
        result = conn.execute(sql_text(sql))
        cols = list(result.keys())
        fetched = result.fetchmany(MAX_ROWS + 1)
    rows = [[(v.isoformat()[:19] if hasattr(v, "isoformat") else v) for v in row] for row in fetched]
    truncated = len(rows) > MAX_ROWS
    return cols, rows[:MAX_ROWS], truncated, sql


def _extract_sql(reply: str) -> str | None:
    m = re.search(r"```(?:sql)?\s*(.+?)```", reply, re.S)
    sql = (m.group(1) if m else reply).strip()
    sql = re.sub(r"(?is)^sql\b[:\s]*", "", sql).strip()
    if not sql.upper().lstrip("( ").startswith("SELECT"):
        return None
    return sql.rstrip(";")


def _money(v):
    try:
        return f"Rs {float(v):,.0f}"
    except (TypeError, ValueError):
        return str(v)


# ------------------------------------------------------------- fast-path rules

def _rules_answer(db, question: str):
    """Deterministic answers for the most common questions. Returns text or None."""
    q = (question or "").lower()
    has_items = analytics._has_line_items(db)
    if re.search(r"total (revenue|sales)|how much.*(revenue|sales)|revenue this month", q):
        ov = analytics.overview(db)
        return (f"Total revenue is {_money(ov['total_revenue'])} from {ov['total_invoices']} bills "
                f"(avg bill {_money(ov['avg_bill_value'])}). This month so far: {_money(ov['revenue_this_month'])} "
                f"vs {_money(ov['revenue_prev_month'])} last month.")
    if re.search(r"top|best|most sold|best.seller", q) and re.search(r"product|item|selling", q):
        rows = analytics.sales_by_product(db, limit=3)
        if rows:
            head = rows[0]
            basis = " (MRP basis)" if head.get("revenue_basis") == "mrp" else ""
            more = ", ".join(f"{r['item_name']} {_money(r['revenue'])}" for r in rows[1:3])
            return (f"Top seller{basis}: {head['item_name']} - {head['qty']:g} units, "
                    f"{_money(head['revenue'])}." + (f" Next: {more}." if more else ""))
    if re.search(r"low stock|stock of|current stock", q) and not has_items:
        st = analytics.current_stock(db, limit=200000)["rows"]
        low = [r for r in st if isinstance(r["net_qty"], (int, float)) and r["net_qty"] <= 5]
        low.sort(key=lambda r: r["net_qty"])
        if low:
            items = "; ".join(f"{r['item_name']} ({r['net_qty']:g})" for r in low[:5])
            return f"{len(low)} item(s) at or below 5 units. Lowest: {items}."
        return "No items are at or below 5 units of stock right now."
    if re.search(r"how many customers", q):
        ov = analytics.overview(db)
        return f"There are {ov['total_customers']} registered customers and {ov['total_invoices']} bills."
    return None


_FALLBACK = (
    "I could not work that out. Try asking about sales, revenue, products, customers, "
    "stock, purchases or branches - e.g. 'What was my revenue in July?', "
    "'Which items are low in stock?', 'Top 5 customers by revenue'."
)


# --------------------------------------------------------------------- public

def answer_question(db, question: str, history: list | None = None) -> dict:
    import time as _time
    _t0 = _time.monotonic()

    def _out(payload):
        payload["elapsed_ms"] = int((_time.monotonic() - _t0) * 1000)
        return payload

    # 1) fast path
    rules = _rules_answer(db, question)
    if rules:
        return _out({"answer": rules, "mode": "rules", "model": None, "sql": None,
                "rows": None, "data": None})

    # 2) LLM writes SQL
    if _ollama_available():
        today = date.today().isoformat()
        sys1 = (
            "You are the SQL assistant of a retail shop analytics app. "
            "Write ONE MySQL SELECT query that answers the user's question. "
            "Use ONLY these tables:\n\n" + SCHEMA_DOC +
            f"\nToday is {today}. Respond with the SQL in one ```sql code block and nothing else. "
            "Always include a LIMIT (max 50). Prefer readable column aliases.\n\n"
            "CRITICAL RULES:\n"
            "- If the question does NOT mention a specific month/year, DO NOT add any date "
            "filter - query ALL data. The data may be from any past period.\n"
            "- Never guess column names; use exactly the ones listed.\n\n"
            "Examples:\n"
            "Q: Which supplier did I purchase the most from?\n"
            "```sql\nSELECT supplier_name, SUM(bill_amount) AS total_purchased "
            "FROM purchases GROUP BY supplier_name ORDER BY total_purchased DESC LIMIT 5\n```\n"
            "Q: How many bills were more than 10000?\n"
            "```sql\nSELECT COUNT(*) AS bills_over_10000 FROM invoices WHERE total_amount > 10000\n```\n"
            "Q: Top 5 customers by revenue?\n"
            "```sql\nSELECT customer_name, SUM(total_amount) AS revenue FROM invoices "
            "WHERE customer_name IS NOT NULL GROUP BY customer_name ORDER BY revenue DESC LIMIT 5\n```\n"
            "Q: Which items are low in stock?\n"
            "```sql\nSELECT item_name, stock_qty FROM products WHERE stock_qty IS NOT NULL AND stock_qty <= 5 ORDER BY stock_qty LIMIT 20\n```"
        )
        hist = ""
        for h in (history or [])[-4:]:
            role = "Q" if h.get("role") == "user" else "A"
            hist += f"{role}: {str(h.get('content'))[:200]}\n"
        user1 = f"Recent conversation:\n{hist}\nQuestion: {question}"
        reply = _ollama_chat(sys1, user1)
        sql = _extract_sql(reply) if reply else None
        if sql:
            try:
                cols, rows, truncated, safe_sql = run_sql(sql)
            except Exception as e:
                user2 = (f"Question: {question}\n\nYour previous SQL failed: {e}\n"
                         "Write a corrected single SELECT (one ```sql block).")
                reply2 = _ollama_chat(sys1, user2)
                sql2 = _extract_sql(reply2) if reply2 else None
                if not sql2:
                    return _out({"answer": f"I could not build a safe query for that ({e}). Try rephrasing.",
                            "mode": "ai-sql", "model": config.OLLAMA_MODEL, "sql": sql,
                            "rows": None, "data": None})
                try:
                    cols, rows, truncated, safe_sql = run_sql(sql2)
                except Exception as e2:
                    return _out({"answer": f"Still could not run that query ({e2}). Try a simpler question.",
                            "mode": "ai-sql", "model": config.OLLAMA_MODEL, "sql": sql2,
                            "rows": None, "data": None})

            # 3) answer directly from the rows — no second LLM round trip (~2x faster)
            def _fmt(v):
                if isinstance(v, bool):
                    return str(v)
                if isinstance(v, int):
                    return f"{v:,}"
                if isinstance(v, float):
                    return f"{v:,.2f}"
                return str(v)

            if not rows:
                answer = "No matching records were found in your data for that question."
            elif len(rows) == 1 and len(cols) == 1:
                answer = f"{cols[0].replace('_', ' ').title()}: {_fmt(rows[0][0])}"
            elif len(rows) == 1:
                answer = "; ".join(f"{c.replace('_', ' ').title()}: {_fmt(v)}"
                                   for c, v in zip(cols, rows[0]))
            else:
                lines = [f"Top {min(len(rows), 5)} result(s):"]
                for r in rows[:5]:
                    lines.append("- " + ", ".join(_fmt(v) for v in r[:2]))
                if len(rows) > 5:
                    lines.append(f"...and {len(rows) - 5} more (see the table below).")
                answer = "\n".join(lines)
            return _out({
                "answer": answer,
                "mode": "ai-sql",
                "model": config.OLLAMA_MODEL,
                "sql": safe_sql,
                "rows": {"columns": cols, "rows": rows, "truncated": truncated},
                "data": None,
            })

        # LLM reachable but no SQL extracted -> answer from the data snapshot locally
        # (no extra LLM round trip: speed matters more than phrasing)
        facts = {
            "overview": analytics.overview(db),
            "branches": analytics.branch_summary(db),
            "top_products": analytics.sales_by_product(db, limit=3),
        }
        ov = facts["overview"]
        top0 = facts["top_products"][0] if facts["top_products"] else None
        answer = (f"Here's a quick snapshot: revenue {_money(ov['total_revenue'])} across "
                  f"{ov['total_invoices']} bills"
                  + (f"; top product {top0['item_name']} at {_money(top0['revenue'])}" if top0 else "")
                  + ". Ask more specifically (e.g. 'revenue in July', 'top 5 customers', "
                    "'low stock items') for a detailed answer.")
        return _out({"answer": answer, "mode": "ai",
                "model": config.OLLAMA_MODEL, "sql": None,
                "rows": None, "data": None})

    # 4) no LLM
    return _out({"answer": _FALLBACK, "mode": "rules", "model": None, "sql": None,
            "rows": None, "data": None})
