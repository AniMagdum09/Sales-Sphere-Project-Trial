"""Patch v2: item analytics fallback to item_monthly_sales (report imports)."""
import pathlib
import ast

p = pathlib.Path("app/services/analytics.py")
s = p.read_text(encoding="utf-8")

# current_stock: prefer authoritative stock from the Stock Report import
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
    # Authoritative stock (Stock Report import) overrides movement-derived stock
    report_stock = {}
    try:
        for r0 in db.execute(
            select(products.c.item_code, products.c.stock_qty, products.c.purchase_price)
            .where(products.c.stock_qty.isnot(None))
        ):
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
if old in s:
    s = s.replace(old, new)
else:
    print("stock block already patched, skipping")

# fallback helpers + by-product dispatch
old = """def sales_by_product(db: Session, from_=None, to=None, limit=10, branch=None):
    conds = [invoice_items.c.item_code.isnot(None), invoice_items.c.item_code != ""]"""
new = """def _has_line_items(db: Session) -> bool:
    try:
        n = db.execute(select(func.count()).select_from(invoice_items)).scalar()
        return int(n or 0) > 0
    except Exception:
        return False


def _product_sales_from_monthly(db: Session, from_=None, to=None, limit=10):
    \"\"\"Report-imported data: per-item qty per month; value estimated at MRP.\"\"\"
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
    )
    conds = []
    if from_:
        conds.append(ims.c.ym >= _coerce(from_))
    if to:
        conds.append(ims.c.ym <= _coerce(to) + timedelta(days=31))
    if conds:
        q = q.having(func.max(ims.c.ym) >= func.coalesce(*conds[:1])) if False else q
    # date filters apply to the month aggregation window
    if conds:
        q2 = q.subquery()
        # simple approach: filter in outer query on last_sold when single-window
        pass
    rows_out = []
    for r in db.execute(q):
        last = r.last_sold
        if from_ and last and last < _coerce(from_):
            continue
        if to and last and last > _coerce(to) + timedelta(days=31):
            continue
        rows_out.append(r)
    # apply limit after in-Python windowing
    return [
        {
            "item_code": r.item_code,
            "item_name": r.item_name or r.item_code,
            "qty": float(r.qty or 0),
            "revenue": round(float(r.revenue or 0), 2),
            "orders": 0,
            "last_sold": r.last_sold.isoformat()[:10] if r.last_sold else None,
            "revenue_basis": "mrp",
        }
        for r in rows_out[:limit]
    ]


def sales_by_product(db: Session, from_=None, to=None, limit=10, branch=None):
    if not _has_line_items(db):
        return _product_sales_from_monthly(db, from_, to, limit)
    conds = [invoice_items.c.item_code.isnot(None), invoice_items.c.item_code != ""]"""
assert old in s, "by-product block"
s = s.replace(old, new)

ast.parse(s)
p.write_text(s, encoding="utf-8")
print("analytics v2 patched")
