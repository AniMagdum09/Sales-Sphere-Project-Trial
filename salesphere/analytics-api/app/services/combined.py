"""Combined-analytics additions: purchases, item performance, brand mix.

These make the dashboard reflect ALL imported files together — sales bills (SR),
purchase bills (PR) and the stock report's item master/monthly sales — instead of
only the invoice-centric view.
"""
from datetime import date, timedelta

from sqlalchemy import and_, desc, func, select
from sqlalchemy.orm import Session

from ..models import invoice_items, invoices, item_monthly_sales, products, purchases


def purchases_insights(db: Session, from_=None, to=None):
    def _d(v):
        return v if not isinstance(v, str) else date.fromisoformat(v[:10])

    conds = []
    if from_:
        conds.append(purchases.c.bill_date >= _d(from_))
    if to:
        conds.append(purchases.c.bill_date <= _d(to))

    total_q = select(
        func.coalesce(func.sum(purchases.c.bill_amount), 0),
        func.count(purchases.c.id),
        func.count(func.distinct(purchases.c.supplier_name)),
    ).where(*conds) if conds else select(
        func.coalesce(func.sum(purchases.c.bill_amount), 0),
        func.count(purchases.c.id),
        func.count(func.distinct(purchases.c.supplier_name)),
    )
    total, bills, suppliers = db.execute(total_q).one()
    total = float(total or 0)
    if bills == 0:
        return {"has_data": False, "summary": {}, "monthly": [], "top_suppliers": []}

    mb = func.date_format(purchases.c.bill_date, "%Y-%m").label("m")
    mq = (
        select(mb, func.coalesce(func.sum(purchases.c.bill_amount), 0).label("amount"))
        .group_by(mb).order_by(mb)
    )
    if conds:
        mq = mq.where(*conds)
    monthly = [{"month": r.m, "amount": round(float(r.amount or 0), 2)} for r in db.execute(mq)]

    sq = (
        select(
            purchases.c.supplier_name,
            func.coalesce(func.sum(purchases.c.bill_amount), 0).label("amount"),
            func.count(purchases.c.id).label("bills"),
        )
        .where(purchases.c.supplier_name.isnot(None))
        .group_by(purchases.c.supplier_name)
        .order_by(desc(func.sum(purchases.c.bill_amount)))
        .limit(10)
    )
    if conds:
        sq = sq.where(*conds)
    top = [
        {"supplier_name": r.supplier_name, "amount": round(float(r.amount or 0), 2), "bills": int(r.bills)}
        for r in db.execute(sq)
    ]
    return {
        "has_data": True,
        "summary": {
            "total": round(total, 2),
            "bills": int(bills),
            "suppliers": int(suppliers or 0),
            "top_supplier": top[0]["supplier_name"] if top else None,
        },
        "monthly": monthly,
        "top_suppliers": top,
    }


def item_performance(db: Session, limit: int = 25):
    """Per-item sold qty (from stock-report monthly history) valued at MRP, cost at
    purchase price, with current stock. Only meaningful when item_monthly_sales exists."""
    n = db.execute(select(func.count()).select_from(item_monthly_sales)).scalar()
    if not n:
        return {"has_data": False, "basis": "mrp", "rows": []}

    q = (
        select(
            item_monthly_sales.c.item_code,
            func.max(products.c.item_name).label("item_name"),
            func.max(products.c.category).label("category"),
            func.max(products.c.brand).label("brand"),
            func.sum(item_monthly_sales.c.qty).label("qty_sold"),
            func.sum(item_monthly_sales.c.qty * func.coalesce(products.c.mrp, products.c.purchase_price, 0)).label("revenue_est"),
            func.sum(item_monthly_sales.c.qty * func.coalesce(products.c.purchase_price, 0)).label("cost_est"),
            func.max(products.c.stock_qty).label("stock_qty"),
            func.max(item_monthly_sales.c.ym).label("last_sold"),
        )
        .select_from(item_monthly_sales.join(products, products.c.item_code == item_monthly_sales.c.item_code, isouter=True))
        .group_by(item_monthly_sales.c.item_code)
        .order_by(desc(func.sum(item_monthly_sales.c.qty * func.coalesce(products.c.mrp, products.c.purchase_price, 0))))
        .limit(limit)
    )
    rows = []
    for r in db.execute(q):
        rev = float(r.revenue_est or 0)
        cost = float(r.cost_est or 0)
        rows.append({
            "item_code": r.item_code,
            "item_name": r.item_name or r.item_code,
            "category": r.category,
            "brand": r.brand,
            "qty_sold": round(float(r.qty_sold or 0), 2),
            "revenue_est": round(rev, 2),
            "cost_est": round(cost, 2),
            "profit_est": round(rev - cost, 2),
            "stock_qty": float(r.stock_qty) if r.stock_qty is not None else None,
            "last_sold": r.last_sold.isoformat()[:10] if r.last_sold else None,
        })
    return {"has_data": True, "basis": "mrp", "rows": rows}


def brand_mix(db: Session, dimension: str = "brand"):
    """Item mix by brand or department, valued at MRP from monthly sales history."""
    dim_col = products.c.brand if dimension == "brand" else products.c.department
    n = db.execute(select(func.count()).select_from(item_monthly_sales)).scalar()
    if not n:
        return {"has_data": False, "rows": []}
    q = (
        select(
            dim_col.label("name"),
            func.count(func.distinct(item_monthly_sales.c.item_code)).label("items"),
            func.coalesce(func.sum(item_monthly_sales.c.qty), 0).label("qty_sold"),
            func.coalesce(func.sum(item_monthly_sales.c.qty * func.coalesce(products.c.mrp, products.c.purchase_price, 0)), 0).label("revenue_est"),
        )
        .select_from(item_monthly_sales.join(products, products.c.item_code == item_monthly_sales.c.item_code, isouter=True))
        .where(dim_col.isnot(None), dim_col != "")
        .group_by(dim_col)
        .order_by(desc(func.coalesce(func.sum(item_monthly_sales.c.qty * func.coalesce(products.c.mrp, products.c.purchase_price, 0)), 0)))
    )
    rows = [
        {
            "name": r.name,
            "items": int(r.items or 0),
            "qty_sold": round(float(r.qty_sold or 0), 2),
            "revenue_est": round(float(r.revenue_est or 0), 2),
        }
        for r in db.execute(q)
    ]
    return {"has_data": bool(rows), "rows": rows}


def purchases_total(db: Session, from_=None, to=None):
    def _d(v):
        return v if not isinstance(v, str) else date.fromisoformat(v[:10])

    q = select(func.coalesce(func.sum(purchases.c.bill_amount), 0), func.count(purchases.c.id))
    if from_:
        q = q.where(purchases.c.bill_date >= _d(from_))
    if to:
        q = q.where(purchases.c.bill_date <= _d(to) + timedelta(days=1))
    amount, bills = db.execute(q).one()
    return float(amount or 0), int(bills or 0)
