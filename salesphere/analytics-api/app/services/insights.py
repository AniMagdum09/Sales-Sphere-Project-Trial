"""Deeper business insights on top of the synced data: profit, demand forecast,
reorder suggestions, RFM customer segmentation, alert feed, category and hourly
sales patterns.

Revenue  = invoice totals (invoices.total_amount)
Item rev = quantity * sales_price, item cost = quantity * purchase_price (from the
line items the shop's exports/sync provide).
"""
import statistics
from datetime import date, datetime, timedelta

from sqlalchemy import and_, desc, func, select
from sqlalchemy.orm import Session

from .. import config
from ..models import customers, invoice_items, invoices, products


def _d(v):
    return v if isinstance(v, date) else date.fromisoformat(str(v)[:10])


def _range_conds(col, from_, to):
    conds = []
    if from_:
        conds.append(col >= _d(from_))
    if to:
        conds.append(col < _d(to) + timedelta(days=1))
    return conds


def _branch_conds(col, branch):
    return [col == branch] if branch and branch != "all" else []


# ------------------------------------------------------------------ profit

def profit(db: Session, from_=None, to=None, branch=None):
    conds = _range_conds(invoices.c.invoice_date, from_, to) + _branch_conds(invoices.c.source_branch_code, branch)
    base = (
        invoice_items.join(invoices, invoices.c.id == invoice_items.c.invoice_id)
        if True else None
    )
    q = (
        select(
            func.coalesce(func.sum(invoice_items.c.quantity * invoice_items.c.sales_price), 0).label("revenue"),
            func.coalesce(func.sum(invoice_items.c.quantity * func.coalesce(invoice_items.c.purchase_price, 0)), 0).label("cost"),
        )
        .select_from(base)
        .where(*conds)
    )
    row = db.execute(q).one()
    revenue, cost = float(row.revenue or 0), float(row.cost or 0)
    gross = revenue - cost
    margin = round(gross / revenue * 100, 2) if revenue else None

    # by branch
    q2 = (
        select(
            invoices.c.source_branch_code,
            func.coalesce(func.sum(invoice_items.c.quantity * invoice_items.c.sales_price), 0).label("revenue"),
            func.coalesce(func.sum(invoice_items.c.quantity * func.coalesce(invoice_items.c.purchase_price, 0)), 0).label("cost"),
        )
        .select_from(base)
        .where(*conds)
        .group_by(invoices.c.source_branch_code)
    )
    by_branch = []
    for r in db.execute(q2):
        rev, c = float(r.revenue or 0), float(r.cost or 0)
        by_branch.append({
            "branch_code": r.source_branch_code or "-", "revenue": rev, "cost": c,
            "profit": round(rev - c, 2),
            "margin_pct": round((rev - c) / rev * 100, 2) if rev else None,
        })
    by_branch.sort(key=lambda x: -x["profit"])

    # top profit products
    conds_p = [invoice_items.c.item_code.isnot(None), invoice_items.c.item_code != ""] + conds
    q3 = (
        select(
            invoice_items.c.item_code,
            func.max(invoice_items.c.item_name).label("item_name"),
            func.sum(invoice_items.c.quantity).label("qty"),
            func.sum(invoice_items.c.quantity * invoice_items.c.sales_price).label("revenue"),
            func.sum(invoice_items.c.quantity * func.coalesce(invoice_items.c.purchase_price, 0)).label("cost"),
        )
        .select_from(base)
        .where(*conds_p)
        .group_by(invoice_items.c.item_code)
        .order_by(desc(func.sum(invoice_items.c.quantity * (invoice_items.c.sales_price - func.coalesce(invoice_items.c.purchase_price, 0)))))
        .limit(10)
    )
    top = []
    for r in db.execute(q3):
        rev, c = float(r.revenue or 0), float(r.cost or 0)
        top.append({
            "item_code": r.item_code, "item_name": r.item_name or r.item_code,
            "qty": float(r.qty or 0), "revenue": rev, "cost": round(c, 2),
            "profit": round(rev - c, 2),
            "margin_pct": round((rev - c) / rev * 100, 2) if rev else None,
        })

    return {
        "summary": {
            "revenue": round(revenue, 2), "cost": round(cost, 2),
            "gross_profit": round(gross, 2), "margin_pct": margin,
        },
        "by_branch": by_branch,
        "top_products": top,
    }


# ------------------------------------------------------------------ forecast

def forecast(db: Session, periods: int = 3):
    bucket = func.date_format(invoices.c.invoice_date, "%Y-%m").label("bucket")
    q = (
        select(bucket, func.coalesce(func.sum(invoices.c.total_amount), 0).label("revenue"))
        .group_by(bucket)
        .order_by(bucket)
    )
    hist = [{"date": r.bucket, "revenue": float(r.revenue)} for r in db.execute(q)]
    if len(hist) < 3:
        return {"history": hist, "forecast": [], "method": "needs at least 3 months of data"}

    ys = [h["revenue"] for h in hist]
    xs = list(range(len(ys)))
    n = len(xs)
    mean_x, mean_y = statistics.mean(xs), statistics.mean(ys)
    slope = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys)) / sum((x - mean_x) ** 2 for x in xs)
    intercept = mean_y - slope * mean_x
    residuals = [y - (intercept + slope * x) for x, y in zip(xs, ys)]
    stdev = statistics.pstdev(residuals) or (mean_y * 0.05 or 1.0)

    last_y, last_m = map(int, hist[-1]["date"].split("-"))
    out = []
    for i in range(1, periods + 1):
        m = last_m + i
        y = last_y + (m - 1) // 12
        m = (m - 1) % 12 + 1
        x = n - 1 + i
        base = intercept + slope * x
        out.append({
            "date": f"{y:04d}-{m:02d}",
            "revenue": round(max(base, 0), 2),
            "lower": round(max(base - stdev, 0), 2),
            "upper": round(base + stdev, 2),
        })
    return {
        "history": hist,
        "forecast": out,
        "method": "least-squares linear trend on monthly revenue, +/-1 std-dev band",
    }


# ------------------------------------------------------------------ reorder

def reorder(db: Session, window_days: int = 30, coverage_days: int = 21, branch=None, limit: int = 50):
    today = date.today()
    win_start = today - timedelta(days=window_days)
    conds = [
        invoice_items.c.item_code.isnot(None), invoice_items.c.item_code != "",
        invoices.c.invoice_date >= win_start,
    ] + _branch_conds(invoices.c.source_branch_code, branch)
    sold_q = (
        select(
            invoice_items.c.item_code,
            func.max(invoice_items.c.item_name).label("item_name"),
            func.sum(invoice_items.c.quantity).label("sold"),
        )
        .select_from(invoice_items.join(invoices, invoices.c.id == invoice_items.c.invoice_id))
        .where(*conds)
        .group_by(invoice_items.c.item_code)
    )
    sold_map = {r.item_code: float(r.sold or 0) for r in db.execute(sold_q)}

    stock_q = (
        select(
            invoice_items.c.item_code,
            func.max(invoice_items.c.item_name).label("item_name"),
            func.coalesce(func.sum(invoice_items.c.purchase_qty), 0).label("purchased"),
            func.coalesce(func.sum(invoice_items.c.quantity), 0).label("sold_total"),
        )
        .select_from(invoice_items.join(invoices, invoices.c.id == invoice_items.c.invoice_id))
        .where(invoice_items.c.item_code.isnot(None), invoice_items.c.item_code != "")
        .group_by(invoice_items.c.item_code)
    )
    rows = []
    for r in db.execute(stock_q):
        code = r.item_code
        net = float(r.purchased or 0) - float(r.sold_total or 0)
        sold_recent = sold_map.get(code, 0.0)
        avg_daily = sold_recent / window_days
        cover = round(net / avg_daily, 1) if avg_daily > 0 else None
        if avg_daily <= 0:
            continue  # not selling: not a reorder candidate (dead-stock handles it)
        suggested = max(0.0, round(avg_daily * coverage_days - net, 1))
        if cover is not None and cover > coverage_days * 1.5:
            continue
        priority = "HIGH" if (cover is None or cover < 7) else ("MEDIUM" if cover < coverage_days else "LOW")
        rows.append({
            "item_code": code, "item_name": r.item_name or code,
            "net_qty": round(net, 2), "avg_daily_sales": round(avg_daily, 3),
            "coverage_days_left": cover, "suggested_qty": suggested, "priority": priority,
        })
    prio_rank = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
    rows.sort(key=lambda r: (prio_rank[r["priority"]], r["coverage_days_left"] if r["coverage_days_left"] is not None else 9999))
    return {"rows": rows[:limit]}


# ------------------------------------------------------------------ RFM

def rfm(db: Session, from_=None, to=None):
    today = date.today()
    conds = [
        invoices.c.customer_id.isnot(None),
    ] + _range_conds(invoices.c.invoice_date, from_, to)
    q = (
        select(
            invoices.c.customer_id,
            func.max(invoices.c.customer_name).label("customer_name"),
            func.max(func.date(invoices.c.invoice_date)).label("last_purchase"),
            func.count(invoices.c.id).label("frequency"),
            func.coalesce(func.sum(invoices.c.total_amount), 0).label("monetary"),
        )
        .where(*conds)
        .group_by(invoices.c.customer_id)
    )
    rows = []
    for r in db.execute(q):
        last = r.last_purchase
        rec = (today - last).days if last else 9999
        rows.append({
            "customer_id": int(r.customer_id),
            "customer_name": (r.customer_name or f"Customer #{r.customer_id}"),
            "recency_days": rec, "frequency": int(r.frequency or 0),
            "monetary": round(float(r.monetary or 0), 2),
        })
    if not rows:
        return {"summary": {}, "rows": []}

    def score(value, points, reverse=False):
        # quintile 1..5
        s = sorted(points)
        n = len(s)
        if n == 1:
            return 3
        import bisect
        idx = bisect.bisect_left(s, value)
        quint = min(4, idx * 5 // n) + 1
        return quint

    recencies = [r["recency_days"] for r in rows]
    freqs = [r["frequency"] for r in rows]
    mons = [r["monetary"] for r in rows]
    for r in rows:
        r["r_score"] = 6 - score(r["recency_days"], recencies)   # lower recency = better
        r["f_score"] = score(r["frequency"], freqs)
        r["m_score"] = score(r["monetary"], mons)
        rs, fs, ms = r["r_score"], r["f_score"], r["m_score"]
        if rs >= 4 and fs >= 4 and ms >= 4:
            seg = "Champions"
        elif fs >= 3 and ms >= 3:
            seg = "Loyal"
        elif rs >= 4 and fs <= 2:
            seg = "New"
        elif rs <= 2 and fs >= 3:
            seg = "At Risk"
        else:
            seg = "Hibernating"
        r["segment"] = seg
    rows.sort(key=lambda r: -r["monetary"])
    summary = {}
    for r in rows:
        summary[r["segment"]] = summary.get(r["segment"], 0) + 1
    return {"summary": summary, "rows": rows}


# ------------------------------------------------------------------ alerts

def alerts(db: Session):
    today = date.today()
    out = []

    # low stock: net qty <= 5 and item sells
    q = (
        select(
            invoice_items.c.item_code,
            func.max(invoice_items.c.item_name).label("item_name"),
            func.coalesce(func.sum(invoice_items.c.purchase_qty), 0).label("purchased"),
            func.coalesce(func.sum(invoice_items.c.quantity), 0).label("sold"),
            func.max(func.date(invoices.c.invoice_date)).label("last_sold"),
        )
        .select_from(invoice_items.join(invoices, invoices.c.id == invoice_items.c.invoice_id))
        .where(invoice_items.c.item_code.isnot(None), invoice_items.c.item_code != "")
        .group_by(invoice_items.c.item_code)
    )
    for r in db.execute(q):
        net = float(r.purchased or 0) - float(r.sold or 0)
        last_sold = r.last_sold
        days_since = (today - last_sold).days if last_sold else None
        if net <= 5 and (days_since is None or days_since <= 30):
            out.append({
                "id": f"low-stock:{r.item_code}", "type": "low_stock",
                "severity": "critical" if net <= 0 else "warning",
                "title": f"Low stock: {r.item_name or r.item_code}",
                "detail": f"{net:g} units left (purchased {r.purchased:g}, sold {r.sold:g}).",
                "item_code": r.item_code, "value": round(net, 2),
            })
        if days_since is not None and days_since >= 90:
            out.append({
                "id": f"dead-stock:{r.item_code}", "type": "dead_stock",
                "severity": "warning" if days_since < 180 else "critical",
                "title": f"Dead stock: {r.item_name or r.item_code}",
                "detail": f"No sale in {days_since} days. {net:g} units still on hand.",
                "item_code": r.item_code, "value": round(net, 2),
            })

    # revenue drop: this month vs previous
    month_start = today.replace(day=1)
    prev_start = (month_start - timedelta(days=1)).replace(day=1)
    this_m = db.execute(
        select(func.coalesce(func.sum(invoices.c.total_amount), 0))
        .where(invoices.c.invoice_date >= month_start)
    ).scalar()
    prev_m = db.execute(
        select(func.coalesce(func.sum(invoices.c.total_amount), 0))
        .where(invoices.c.invoice_date >= prev_start, invoices.c.invoice_date < month_start)
    ).scalar()
    this_m, prev_m = float(this_m or 0), float(prev_m or 0)
    if prev_m > 0 and this_m < prev_m:
        drop_pct = round((prev_m - this_m) / prev_m * 100, 1)
        out.append({
            "id": "revenue-drop:this-month", "type": "revenue_drop",
            "severity": "info" if drop_pct < 40 else "warning",
            "title": f"Revenue down {drop_pct}% vs last month",
            "detail": f"This month: {this_m:,.0f} vs {prev_m:,.0f} last month (month-to-date comparison).",
            "item_code": None, "value": round(this_m - prev_m, 2),
        })

    sev_rank = {"critical": 0, "warning": 1, "info": 2}
    out.sort(key=lambda a: sev_rank[a["severity"]])
    return {"alerts": out}


# ------------------------------------------------------------------ category & hourly

def category_sales(db: Session, from_=None, to=None, branch=None):
    conds = [invoice_items.c.category.isnot(None), invoice_items.c.category != ""]
    conds += _range_conds(invoices.c.invoice_date, from_, to)
    conds += _branch_conds(invoices.c.source_branch_code, branch)
    q = (
        select(
            invoice_items.c.category,
            func.sum(invoice_items.c.quantity).label("qty"),
            func.sum(invoice_items.c.quantity * invoice_items.c.sales_price).label("revenue"),
            func.sum(invoice_items.c.quantity * (invoice_items.c.sales_price - func.coalesce(invoice_items.c.purchase_price, 0))).label("profit"),
        )
        .select_from(invoice_items.join(invoices, invoices.c.id == invoice_items.c.invoice_id))
        .where(*conds)
        .group_by(invoice_items.c.category)
        .order_by(desc(func.sum(invoice_items.c.quantity * invoice_items.c.sales_price)))
    )
    return [
        {"category": r.category, "qty": float(r.qty or 0),
         "revenue": round(float(r.revenue or 0), 2), "profit": round(float(r.profit or 0), 2)}
        for r in db.execute(q)
    ]


def hourly(db: Session, from_=None, to=None, branch=None):
    conds = _range_conds(invoices.c.invoice_date, from_, to)
    conds += _branch_conds(invoices.c.source_branch_code, branch)
    q = (
        select(
            func.hour(invoices.c.invoice_date).label("hr"),
            func.count(invoices.c.id).label("invoices"),
            func.coalesce(func.sum(invoices.c.total_amount), 0).label("revenue"),
        )
        .where(*conds)
        .group_by(func.hour(invoices.c.invoice_date))
        .order_by(func.hour(invoices.c.invoice_date))
    )
    return [{"hour": int(r.hr), "invoices": int(r.invoices), "revenue": round(float(r.revenue or 0), 2)}
            for r in db.execute(q)]


# ------------------------------------------------------------------ month-over-month

def mom_growth(db: Session, months: int = 12):
    bucket = func.date_format(invoices.c.invoice_date, "%Y-%m").label("bucket")
    q = (
        select(bucket,
               func.coalesce(func.sum(invoices.c.total_amount), 0).label("revenue"),
               func.count(invoices.c.id).label("invoices"))
        .group_by(bucket)
        .order_by(bucket)
    )
    pts = [{"date": r.bucket, "revenue": float(r.revenue), "invoices": int(r.invoices)} for r in db.execute(q)]
    rows = []
    for i, p in enumerate(pts):
        growth = None
        if i > 0 and pts[i - 1]["revenue"]:
            growth = round((p["revenue"] - pts[i - 1]["revenue"]) / pts[i - 1]["revenue"] * 100, 1)
        rows.append({**p, "growth_pct": growth})
    return rows[-months:]
