"""CSV report exports: /api/export/report.csv?kind=..."""
import csv
import io

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from ..db import get_db
from ..services import analytics, insights

router = APIRouter(prefix="/api/export", tags=["export"])


def _csv_response(filename: str, header: list, rows: list) -> Response:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(header)
    w.writerows(rows)
    return Response(
        buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/report.csv")
def report(
    kind: str = Query(...),
    from_: str | None = Query(None, alias="from"),
    to: str | None = None,
    branch: str | None = None,
    db: Session = Depends(get_db),
):
    stamp = (to or str(analytics.data_window(db)[1] or "")).replace("-", "")
    suffix = f"_{branch}" if branch else ""

    if kind == "sales_summary":
        s = analytics.sales_summary(db, from_, to, branch)
        return _csv_response(f"sales_summary{suffix}.csv",
                             ["Revenue", "Invoices", "Items Sold", "Avg Bill", "Discount Total"],
                             [[s["revenue"], s["invoices"], s["items_sold"], s["avg_bill"], s["discount_total"]]])

    if kind == "product_sales":
        rows = analytics.sales_by_product(db, from_, to, branch=branch, limit=10000)
        return _csv_response(f"product_sales{suffix}_{stamp}.csv",
                             ["Item Code", "Item Name", "Qty Sold", "Revenue", "Orders", "Last Sold"],
                             [[r["item_code"], r["item_name"], r["qty"], r["revenue"], r["orders"], r["last_sold"] or ""] for r in rows])

    if kind == "customer_sales":
        rows = analytics.sales_by_customer(db, from_, to, branch=branch, limit=10000)
        return _csv_response(f"customer_sales{suffix}_{stamp}.csv",
                             ["Customer ID", "Customer", "Orders", "Revenue", "Last Purchase"],
                             [[r["customer_id"] if r["customer_id"] is not None else "WALK-IN", r["customer_name"], r["orders"], r["revenue"], r["last_purchase"] or ""] for r in rows])

    if kind == "inventory":
        data = analytics.current_stock(db, None, 100000)
        return _csv_response(f"inventory_stock{suffix}_{stamp}.csv",
                             ["Item Code", "Item Name", "Purchased", "Sold", "Net Qty", "Stock Value", "Last Sold"],
                             [[r["item_code"], r["item_name"], r["purchased"], r["sold"], r["net_qty"], r.get("stock_value", ""), r["last_sold"] or ""] for r in data["rows"]])

    if kind == "dead_stock":
        days = 90
        rows = analytics.dead_stock(db, days)["rows"]
        return _csv_response(f"dead_stock_{days}d{suffix}_{stamp}.csv",
                             ["Item Code", "Item Name", "Days Since Last Sale", "Last Sold", "Net Qty", "Total Ever Sold"],
                             [[r["item_code"], r["item_name"], r["days_since_last_sale"] if r["days_since_last_sale"] is not None else "never", r["last_sold"] or "", r["net_qty"], r["total_ever_sold"]] for r in rows])

    if kind == "reorder":
        rows = insights.reorder(db, branch=branch, limit=1000)["rows"]
        return _csv_response(f"reorder_suggestions{suffix}_{stamp}.csv",
                             ["Priority", "Item Code", "Item Name", "Net Qty", "Avg Daily Sales", "Days of Cover", "Suggested Qty"],
                             [[r["priority"], r["item_code"], r["item_name"], r["net_qty"], r["avg_daily_sales"], r["coverage_days_left"] if r["coverage_days_left"] is not None else "", r["suggested_qty"]] for r in rows])

    if kind == "profit":
        p = insights.profit(db, from_, to, branch)
        return _csv_response(f"profit_by_product{suffix}_{stamp}.csv",
                             ["Item Code", "Item Name", "Qty", "Revenue", "Cost", "Profit", "Margin %"],
                             [[r["item_code"], r["item_name"], r["qty"], r["revenue"], r["cost"], r["profit"], r["margin_pct"] if r["margin_pct"] is not None else ""] for r in p["top_products"]])

    raise HTTPException(400, f"Unknown report kind '{kind}'")
