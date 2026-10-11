"""Sales analytics endpoints."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..db import get_db
from ..services import analytics

router = APIRouter(prefix="/api/sales", tags=["sales"])


@router.get("/trends")
def trends(
    granularity: str = Query("month", pattern="^(day|month)$"),
    from_: str | None = Query(None, alias="from"),
    to: str | None = None,
    branch: str | None = None,
    db: Session = Depends(get_db),
):
    return {"points": analytics.sales_trends(db, granularity, from_, to, branch)}


@router.get("/by-product")
def by_product(
    from_: str | None = Query(None, alias="from"),
    to: str | None = None,
    branch: str | None = None,
    limit: int = Query(10, ge=1, le=200),
    db: Session = Depends(get_db),
):
    return {"rows": analytics.sales_by_product(db, from_, to, limit, branch)}


@router.get("/by-customer")
def by_customer(
    from_: str | None = Query(None, alias="from"),
    to: str | None = None,
    branch: str | None = None,
    limit: int = Query(10, ge=1, le=200),
    db: Session = Depends(get_db),
):
    return {"rows": analytics.sales_by_customer(db, from_, to, limit, branch)}


@router.get("/summary")
def summary(
    from_: str | None = Query(None, alias="from"),
    to: str | None = None,
    branch: str | None = None,
    db: Session = Depends(get_db),
):
    return analytics.sales_summary(db, from_, to, branch)
