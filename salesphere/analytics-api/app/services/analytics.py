"""Shared analytics queries against the synced target schema.

All revenue figures come from invoice totals (invoices.total_amount); per-item revenue
is quantity * sales_price from invoice_items. Current stock is DERIVED
(purchased - sold within the synced window) because Im_Remaining_Qty in the source
has not been verified as authoritative (handover step 06).

NOTE: date-range conditions are collected into lists and applied via where(*conds) —
in SQLAlchemy 2.0, and_(None) / where(None) compile to SQL NULL and silently empty
every query.
"""
from datetime import date, timedelta

from sqlalchemy import and_, desc, func, select, text
from sqlalchemy.orm import Session

from ..models import customers, day_end, invoice_items, invoices, products, purchases, sync_metadata


def _coerce(d):
    return d if isinstance(d, date) else date.fromisoformat(str(d)[:10])


def _range_conds(col, from_, to):
    """Date-range conditions as a list (possibly empty) for .where(*conds)."""
    conds = []
    if from_:
        conds.append(col >= _coerce(from_))
    if to:
        conds.append(col < _coerce(to) + timedelta(days=1))
    return conds


def _apply_where(q, conds):
    return q.where(*conds) if conds else q


def data_window(db: Session):
    row = db.execute(
        select(func.min(invoices.c.invoice_date), func.max(invoices.c.invoice_date))
    ).one()
    lo, hi = row[0], row[1]
    return (
        _coerce(lo).isoformat() if lo else None,
        _coerce(hi).isoformat() if hi else None,
    )


def overview(db: Session, branch=None):
    month_start = date.today().replace(day=1)
    prev_start = (month_start - timedelta(days=1)).replace(day=1)
    b_conds = [invoices.c.source_branch_code == branch] if branch and branch != "all" else []

    totals = db.execute(
        select(
            func.coalesce(func.sum(invoices.c.total_amount), 0),
            func.count(invoices.c.id),
            func.coalesce(func.sum(invoices.c.total_qty), 0),
        ).where(*b_conds)
    ).one()

    this_month = db.execute(
        select(func.coalesce(func.sum(invoices.c.total_amount), 0), func.count(invoices.c.id))
        .where(invoices.c.invoice_date >= month_start, *b_conds)
    ).one()
    prev_month = db.execute(
        select(func.coalesce(func.sum(invoices.c.total_amount), 0))
        .where(invoices.c.invoice_date >= prev_start, invoices.c.invoice_date < month_start, *b_conds)
    ).scalar()

    # gross profit over the whole window (item-level cost basis)
    profit_row = db.execute(
        select(
            func.coalesce(func.sum(invoice_items.c.quantity * invoice_items.c.sales_price), 0),
            func.coalesce(func.sum(invoice_items.c.quantity * func.coalesce(invoice_items.c.purchase_price, 0)), 0),
        )
        .select_from(invoice_items.join(invoices, invoices.c.id == invoice_items.c.invoice_id))
        .where(*b_conds)
    ).one()
    rev_items, cost_items = float(profit_row[0] or 0), float(profit_row[1] or 0)
    gross_profit = round(rev_items - cost_items, 2)

    n_customers = db.execute(select(func.count(customers.c.id))).scalar()
    n_products = db.execute(select(func.count(products.c.id))).scalar()
    last_sync = db.execute(
        select(sync_metadata.c.finished_at)
        .where(sync_metadata.c.status == "SUCCESS")
        .order_by(desc(sync_metadata.c.id))
        .limit(1)
    ).scalar()

    total_revenue = float(totals[0] or 0)
    total_invoices = int(totals[1] or 0)

    # combined real-data figures: purchases (PR import) and stock value (stock report)
    from .combined import purchases_total
    total_purchases, p_bills = purchases_total(db)
    total_purchases = round(total_purchases, 2) if p_bills else None
    stock_value = None
    sv = db.execute(
        select(func.coalesce(func.sum(products.c.stock_qty * func.coalesce(products.c.purchase_price, 0)), 0))
        .where(products.c.stock_qty.isnot(None))
    ).scalar()
    if sv and float(sv) > 0:
        stock_value = round(float(sv), 2)

    lo, hi = data_window(db)
    return {
        "total_revenue": total_revenue,
        "total_cost": round(cost_items, 2),
        "gross_profit": gross_profit,
        "total_purchases": total_purchases,
        "stock_value": stock_value,
        "net_profit": round(total_revenue - total_purchases, 2) if total_purchases is not None else None,
        "margin_pct": round(gross_profit / rev_items * 100, 2) if rev_items else None,
        "total_invoices": total_invoices,
        "total_customers": int(n_customers or 0),
        "total_products": int(n_products or 0),
        "avg_bill_value": round(total_revenue / total_invoices, 2) if total_invoices else 0,
        "items_sold": float(totals[2] or 0),
        "revenue_this_month": float(this_month[0] or 0),
        "revenue_prev_month": float(prev_month or 0),
        "invoices_this_month": int(this_month[1] or 0),
        "last_synced_at": last_sync.isoformat() if last_sync else None,
        "date_min": lo,
        "date_max": hi,
    }


def sales_trends(db: Session, granularity="month", from_=None, to=None, branch=None):
    fmt = "%Y-%m" if granularity == "month" else "%Y-%m-%d"
    bucket = func.date_format(invoices.c.invoice_date, fmt).label("bucket")
    q = (
        select(
            bucket,
            func.coalesce(func.sum(invoices.c.total_amount), 0).label("revenue"),
            func.count(invoices.c.id).label("invoices"),
            func.coalesce(func.sum(invoices.c.total_qty), 0).label("items"),
        )
        .group_by(bucket)
        .order_by(bucket)
    )
    q = _apply_where(q, _range_conds(invoices.c.invoice_date, from_, to))
    if branch and branch != "all":
        q = q.where(invoices.c.source_branch_code == branch)
    return [
        {"date": r.bucket, "revenue": float(r.revenue), "invoices": int(r.invoices), "items": float(r.items)}
        for r in db.execute(q)
    ]


def _has_line_items(db: Session) -> bool:
    try:
        n = db.execute(select(func.count()).select_from(invoice_items)).scalar()
        return int(n or 0) > 0
    except Exception:
        return False


def _product_sales_from_monthly(db: Session, from_=None, to=None, limit=10):
    # report-imported data: per-item qty per month; revenue estimated at MRP
    from ..models import item_monthly_sales as ims
    q = (
        select(
            ims.c.item_code,
            func.max(products.c.item_name).label("item_name"),
            func.sum(ims.c.qty).label("qty"),
            func.sum(ims.c.qty * func.coalesce(products.c.mrp, products.c.purchase_price, 0)).label("revenue"),
            func.sum(ims.c.qty * func.coalesce(products.c.purchase_price, 0)).label("cost"),
            func.max(ims.c.ym).label("last_sold"),
        )
        .select_from(ims.join(products, products.c.item_code == ims.c.item_code, isouter=True))
        .group_by(ims.c.item_code)
        .order_by(desc(text("revenue")))
    )
    rows_out = []
    for r in db.execute(q):
        last = r.last_sold
        if from_ and last and last < _coerce(from_):
            continue
        if to and last and last > _coerce(to) + timedelta(days=31):
            continue
        rows_out.append(r)
    return [
        {
            "item_code": r.item_code,
            "item_name": r.item_name or r.item_code,
            "qty": float(r.qty or 0),
            "revenue": round(float(r.revenue or 0), 2),
            "orders": 0,
            "last_sold": r.last_sold.isoformat()[:10] if r.last_sold else None,
            "revenue_basis": "mrp",
            "cost": round(float(r.cost or 0), 2),
        }
        for r in rows_out[:limit]
    ]


def sales_by_product(db: Session, from_=None, to=None, limit=10, branch=None):
    if not _has_line_items(db):
        return _product_sales_from_monthly(db, from_, to, limit)
    conds = [invoice_items.c.item_code.isnot(None), invoice_items.c.item_code != ""]
    conds += _range_conds(invoices.c.invoice_date, from_, to)
    if branch and branch != "all":
        conds.append(invoices.c.source_branch_code == branch)
    q = (
        select(
            invoice_items.c.item_code,
            func.max(invoice_items.c.item_name).label("item_name"),
            func.sum(invoice_items.c.quantity).label("qty"),
            func.sum(invoice_items.c.quantity * invoice_items.c.sales_price).label("revenue"),
            func.count(func.distinct(invoice_items.c.invoice_id)).label("orders"),
            func.max(func.date(invoices.c.invoice_date)).label("last_sold"),
        )
        .select_from(invoice_items.join(invoices, invoices.c.id == invoice_items.c.invoice_id))
        .where(*conds)
        .group_by(invoice_items.c.item_code)
        .order_by(desc(func.sum(invoice_items.c.quantity * invoice_items.c.sales_price)))
        .limit(limit)
    )
    return [
        {
            "item_code": r.item_code,
            "item_name": r.item_name or r.item_code,
            "qty": float(r.qty or 0),
            "revenue": float(r.revenue or 0),
            "orders": int(r.orders or 0),
            "last_sold": r.last_sold.isoformat() if r.last_sold else None,
        }
        for r in db.execute(q)
    ]


def sales_by_customer(db: Session, from_=None, to=None, limit=10, branch=None):
    q = (
        select(
            invoices.c.customer_id,
            func.max(invoices.c.customer_name).label("customer_name"),
            func.count(invoices.c.id).label("orders"),
            func.coalesce(func.sum(invoices.c.total_amount), 0).label("revenue"),
            func.max(func.date(invoices.c.invoice_date)).label("last_purchase"),
        )
        .group_by(invoices.c.customer_id)
        .order_by(desc(func.coalesce(func.sum(invoices.c.total_amount), 0)))
        .limit(limit)
    )
    q = _apply_where(q, _range_conds(invoices.c.invoice_date, from_, to))
    if branch and branch != "all":
        q = q.where(invoices.c.source_branch_code == branch)
    rows = []
    for r in db.execute(q):
        name = (r.customer_name or "").strip()
        if not name and r.customer_id is None:
            name = "Walk-in / Cash"
        elif not name:
            name = f"Customer #{r.customer_id}"
        rows.append(
            {
                "customer_id": r.customer_id,
                "customer_name": name,
                "orders": int(r.orders or 0),
                "revenue": float(r.revenue or 0),
                "last_purchase": r.last_purchase.isoformat() if r.last_purchase else None,
            }
        )
    return rows


def sales_summary(db: Session, from_=None, to=None, branch=None):
    q = select(
        func.coalesce(func.sum(invoices.c.total_amount), 0),
        func.count(invoices.c.id),
        func.coalesce(func.sum(invoices.c.total_qty), 0),
        func.coalesce(func.sum(invoices.c.doc_discount), 0),
    )
    q = _apply_where(q, _range_conds(invoices.c.invoice_date, from_, to))
    if branch and branch != "all":
        q = q.where(invoices.c.source_branch_code == branch)
    row = db.execute(q).one()
    revenue, n = float(row[0] or 0), int(row[1] or 0)
    return {
        "revenue": revenue,
        "invoices": n,
        "items_sold": float(row[2] or 0),
        "avg_bill": round(revenue / n, 2) if n else 0,
        "discount_total": float(row[3] or 0),
    }


def branch_summary(db: Session):
    q = (
        select(
            invoices.c.source_branch_code,
            func.count(invoices.c.id).label("invoices"),
            func.coalesce(func.sum(invoices.c.total_amount), 0).label("revenue"),
        )
        .group_by(invoices.c.source_branch_code)
        .order_by(desc(func.coalesce(func.sum(invoices.c.total_amount), 0)))
    )
    return [
        {
            "branch_code": r.source_branch_code or "-",
            "invoices": int(r.invoices or 0),
            "revenue": float(r.revenue or 0),
        }
        for r in db.execute(q)
    ]


def _stock_rows(db: Session, search=None, limit=50):
    """Per item: total purchased, total sold, net qty, last sale date (derived stock)."""
    q = (
        select(
            products.c.item_code,
            func.max(products.c.item_name).label("item_name"),
            func.coalesce(func.sum(invoice_items.c.purchase_qty), 0).label("purchased"),
            func.coalesce(func.sum(invoice_items.c.quantity), 0).label("sold"),
            func.coalesce(func.sum(invoice_items.c.quantity * func.coalesce(invoice_items.c.purchase_price, 0)), 0).label("cost"),
            func.max(func.date(invoices.c.invoice_date)).label("last_sold"),
        )
        .select_from(products)
        .join(
            invoice_items,
            and_(
                invoice_items.c.item_code == products.c.item_code,
                invoice_items.c.invoice_id.isnot(None),
            ),
            isouter=True,
        )
        .join(invoices, invoices.c.id == invoice_items.c.invoice_id, isouter=True)
        .group_by(products.c.item_code)
        .order_by(products.c.item_code)
    )
    if search:
        like = f"%{search}%"
        q = q.where(products.c.item_code.like(like) | products.c.item_name.like(like))
    q = q.limit(limit)
    out = []
    total_value = 0.0
    # Authoritative stock (from a Stock Report import) overrides derived movement stock
    report_stock = {}
    try:
        rp = db.execute(
            select(products.c.item_code, products.c.stock_qty, products.c.purchase_price)
            .where(products.c.stock_qty.isnot(None))
        ).all()
        for r0 in rp:
            report_stock[r0.item_code] = (float(r0.stock_qty), float(r0.purchase_price or 0))
    except Exception:
        report_stock = {}
    for r in db.execute(q):
        purchased, sold = float(r.purchased or 0), float(r.sold or 0)
        cost = float(r.cost or 0)
        net = round(purchased - sold, 3)
        avg_cost = (cost / sold) if sold else 0.0
        if r.item_code in report_stock:
            net = report_stock[r.item_code][0]
            avg_cost = report_stock[r.item_code][1] or avg_cost
        value = round(net * avg_cost, 2)
        total_value += value
        out.append(
            {
                "item_code": r.item_code,
                "item_name": r.item_name or r.item_code,
                "purchased": purchased,
                "sold": sold,
                "net_qty": net,
                "stock_value": value,
                "last_sold": r.last_sold.isoformat() if r.last_sold else None,
            }
        )
    _stock_rows.total_value = round(total_value, 2)
    return out


def current_stock(db: Session, search=None, limit=50):
    rows = _stock_rows(db, search, limit)
    # grand total over the WHOLE catalog (page-independent): Stock-Report items valued
    # at their cost; others at derived average cost
    total = 0.0
    try:
        for r in db.execute(
            select(
                products.c.stock_qty,
                products.c.purchase_price,
            ).where(products.c.stock_qty.isnot(None))
        ):
            total += float(r.stock_qty or 0) * float(r.purchase_price or 0)
    except Exception:
        total = 0.0
    if total <= 0:
        total = getattr(_stock_rows, "total_value", 0.0)
    return {"rows": rows, "total_stock_value": round(total, 2)}


def movement(db: Session, item_code: str, from_=None, to=None):
    name = db.execute(
        select(products.c.item_name).where(products.c.item_code == item_code)
    ).scalar()
    if name is None:
        return None
    conds = [invoice_items.c.item_code == item_code]
    conds += _range_conds(invoices.c.invoice_date, from_, to)
    q = (
        select(
            func.date(invoices.c.invoice_date).label("d"),
            func.coalesce(func.sum(invoice_items.c.quantity), 0).label("sold"),
            func.coalesce(func.sum(invoice_items.c.purchase_qty), 0).label("purchased"),
        )
        .select_from(invoice_items.join(invoices, invoices.c.id == invoice_items.c.invoice_id))
        .where(*conds)
        .group_by(func.date(invoices.c.invoice_date))
        .order_by(func.date(invoices.c.invoice_date))
    )
    return {
        "item_code": item_code,
        "item_name": name,
        "points": [
            {"date": r.d.isoformat(), "sold": float(r.sold), "purchased": float(r.purchased)}
            for r in db.execute(q)
        ],
    }


def _last_sale_per_item(db: Session):
    q = (
        select(
            invoice_items.c.item_code,
            func.max(func.date(invoices.c.invoice_date)).label("last_sold"),
            func.sum(invoice_items.c.quantity).label("total_sold"),
        )
        .select_from(invoice_items.join(invoices, invoices.c.id == invoice_items.c.invoice_id))
        .where(invoice_items.c.item_code.isnot(None), invoice_items.c.item_code != "")
        .group_by(invoice_items.c.item_code)
    )
    return {r.item_code: r for r in db.execute(q)}


def fsn(db: Session, fast_days=30, slow_days=90):
    """FSN classification by recency of sale: F fast (<fast_days), S slow (<slow_days), N non-moving."""
    stock = {r["item_code"]: r for r in _stock_rows(db, None, 100000)}
    last_sales = _last_sale_per_item(db)
    today = date.today()
    rows, counts = [], {"fast": 0, "slow": 0, "non_moving": 0}
    for code, s in stock.items():
        ls = last_sales.get(code)
        last_sold = ls.last_sold if ls is not None else None
        days = (today - last_sold).days if last_sold else None
        total_sold = float(ls.total_sold) if ls is not None else 0.0
        if days is None or days > slow_days:
            cat = "N"
            counts["non_moving"] += 1
        elif days <= fast_days:
            cat = "F"
            counts["fast"] += 1
        else:
            cat = "S"
            counts["slow"] += 1
        rows.append(
            {
                "item_code": code,
                "item_name": s["item_name"],
                "days_since_last_sale": days,
                "total_qty_sold": total_sold,
                "avg_daily_qty": round(total_sold / days, 3) if days else 0,
                "net_qty": s["net_qty"],
                "category": cat,
            }
        )
    rows.sort(key=lambda r: (r["category"], -(r["days_since_last_sale"] or 9999)))
    return {"summary": counts, "rows": rows}


def dead_stock(db: Session, days=90):
    stock = {r["item_code"]: r for r in _stock_rows(db, None, 100000)}
    last_sales = _last_sale_per_item(db)
    today = date.today()
    rows = []
    for code, s in stock.items():
        ls = last_sales.get(code)
        last_sold = ls.last_sold if ls is not None else None
        dsi = (today - last_sold).days if last_sold else None
        if dsi is None or dsi >= days:
            rows.append(
                {
                    "item_code": code,
                    "item_name": s["item_name"],
                    "days_since_last_sale": dsi,
                    "last_sold": last_sold.isoformat() if last_sold else None,
                    "net_qty": s["net_qty"],
                    "total_ever_sold": float(ls.total_sold) if ls is not None else 0.0,
                }
            )
    rows.sort(key=lambda r: -(r["days_since_last_sale"] or 9999))
    return {"days": days, "rows": rows}


def customer_detail(db: Session, customer_id: int):
    c = db.execute(
        select(
            customers.c.id, customers.c.party_name, customers.c.phone,
            customers.c.city, customers.c.state, customers.c.credit_limit,
        ).where(customers.c.id == customer_id)
    ).first()
    if c is None:
        return None
    agg = db.execute(
        select(
            func.count(invoices.c.id),
            func.coalesce(func.sum(invoices.c.total_amount), 0),
            func.min(func.date(invoices.c.invoice_date)),
            func.max(func.date(invoices.c.invoice_date)),
        ).where(invoices.c.customer_id == customer_id)
    ).one()
    recent = db.execute(
        select(
            invoices.c.bill_no,
            func.date(invoices.c.invoice_date),
            invoices.c.total_amount,
            invoices.c.total_qty,
        )
        .where(invoices.c.customer_id == customer_id)
        .order_by(desc(invoices.c.invoice_date))
        .limit(15)
    ).all()
    orders = int(agg[0] or 0)
    revenue = float(agg[1] or 0)
    return {
        "customer": {
            "customer_id": c.id,
            "customer_name": c.party_name,
            "phone": c.phone,
            "city": c.city,
            "state": c.state,
            "credit_limit": float(c.credit_limit) if c.credit_limit is not None else None,
        },
        "summary": {
            "orders": orders,
            "revenue": revenue,
            "avg_bill": round(revenue / orders, 2) if orders else 0,
            "first_purchase": agg[2].isoformat() if agg[2] else None,
            "last_purchase": agg[3].isoformat() if agg[3] else None,
        },
        "recent": [
            {
                "bill_no": r[0],
                "date": r[1].isoformat() if r[1] else None,
                "amount": float(r[2] or 0),
                "items": int(r[3] or 0),
            }
            for r in recent
        ],
    }
