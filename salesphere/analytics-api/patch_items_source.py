"""Patch: item analytics fall back to item_monthly_sales + products.stock_qty when
the shop's data comes from report imports (bills have no line items)."""
import pathlib
import ast

# ---------------------------------------------------------------- analytics.py
p = pathlib.Path("app/services/analytics.py")
s = p.read_text(encoding="utf-8")

# current_stock: prefer the authoritative stock from the Stock Report import
old = """    q = q.limit(limit)
    out = []
    total_value = 0.0
    for r in db.execute(q):
        purchased, sold = float(r.purchased or 0), float(r.sold or 0)
        cost = float(r.cost or 0)
        net = round(purchased - sold, 3)
        avg_cost = (cost / sold) if sold else 0.0
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
    return out"""
new = """    q = q.limit(limit)
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
    return out"""
assert old in s, "analytics _stock_rows"
s = s.replace(old, new)

# by-product: fall back to item_monthly_sales (MRP-basis revenue) when no line items
old = """def sales_by_product(db: Session, from_=None, to=None, limit=10, branch=None):
    conds = [invoice_items.c.item_code.isnot(None), invoice_items.c.item_code != ""]
    conds += _range_conds(invoices.c.invoice_date, from_, to)
    if branch and branch != "all":
        conds.append(invoices.c.source_branch_code == branch)"""
new = """def _has_line_items(db: Session) -> bool:
    try:
        n = db.execute(select(func.count()).select_from(invoice_items)).scalar()
        return int(n or 0) > 0
    except Exception:
        return False


def _product_sales_from_monthly(db: Session, from_=None, to=None, limit=10):
    # report-imported data: per-item qty per month; revenue estimated at MRP
    from .models import item_monthly_sales as ims
    conds = []
    if from_:
        conds.append(ims.c.ym >= _coerce(from_))
    if to:
        conds.append(ims.c.ym <= _coerce(to))
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
        .where(*conds) if conds else (
        select(
            ims.c.item_code,
            func.max(products.c.item_name).label("item_name"),
            func.sum(ims.c.qty).label("qty"),
            func.sum(ims.c.qty * func.coalesce(products.c.mrp, products.c.purchase_price, 0)).label("revenue"),
            func.sum(ims.c.qty * func.coalesce(products.c.purchase_price, 0)).label("cost"),
            func.max(ims.c.ym).label("last_sold"),
        )
        .select_from(ims.join(products, products.c.item_code == ims.c.item_code, isouter=True))
    )
    q = q.group_by(ims.c.item_code).order_by(desc(text("revenue"))).limit(limit)
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
        for r in db.execute(q)
    ]


def sales_by_product(db: Session, from_=None, to=None, limit=10, branch=None):
    if not _has_line_items(db):
        return _product_sales_from_monthly(db, from_, to, limit)
    conds = [invoice_items.c.item_code.isnot(None), invoice_items.c.item_code != ""]
    conds += _range_conds(invoices.c.invoice_date, from_, to)
    if branch and branch != "all":
        conds.append(invoices.c.source_branch_code == branch)"""
assert old in s, "by-product"
s = s.replace(old, new)

p.write_text(s, encoding="utf-8")
ast.parse(s)
print("analytics.py patched")
