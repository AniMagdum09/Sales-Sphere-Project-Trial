"""Deep-insight endpoints: profit, forecast, reorder, RFM, alerts, category, hourly,
plus the combined real-data views: purchases, item performance, brand mix."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..db import get_db
from ..services import combined, insights

router = APIRouter(prefix="/api/insights", tags=["insights"])


@router.get("/profit")
def profit(
    from_: str | None = Query(None, alias="from"),
    to: str | None = None,
    branch: str | None = None,
    db: Session = Depends(get_db),
):
    return insights.profit(db, from_, to, branch)


@router.get("/forecast")
def forecast(periods: int = Query(3, ge=1, le=12), db: Session = Depends(get_db)):
    return insights.forecast(db, periods)


@router.get("/reorder")
def reorder(
    window_days: int = Query(30, ge=7, le=180),
    coverage_days: int = Query(21, ge=7, le=90),
    branch: str | None = None,
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
):
    return insights.reorder(db, window_days, coverage_days, branch, limit)


@router.get("/rfm")
def rfm(
    from_: str | None = Query(None, alias="from"),
    to: str | None = None,
    db: Session = Depends(get_db),
):
    return insights.rfm(db, from_, to)


@router.get("/alerts")
def alerts(db: Session = Depends(get_db)):
    return insights.alerts(db)


@router.get("/category-sales")
def category_sales(
    from_: str | None = Query(None, alias="from"),
    to: str | None = None,
    branch: str | None = None,
    db: Session = Depends(get_db),
):
    return {"rows": insights.category_sales(db, from_, to, branch)}


@router.get("/hourly")
def hourly(
    from_: str | None = Query(None, alias="from"),
    to: str | None = None,
    branch: str | None = None,
    db: Session = Depends(get_db),
):
    return {"rows": insights.hourly(db, from_, to, branch)}


@router.get("/mom-growth")
def mom_growth(months: int = Query(12, ge=2, le=36), db: Session = Depends(get_db)):
    return {"rows": insights.mom_growth(db, months)}


@router.get("/purchases")
def purchases_insights(
    from_: str | None = Query(None, alias="from"),
    to: str | None = None,
    db: Session = Depends(get_db),
):
    return combined.purchases_insights(db, from_, to)


@router.get("/item-performance")
def item_performance(limit: int = Query(25, ge=1, le=500), db: Session = Depends(get_db)):
    return combined.item_performance(db, limit)


@router.get("/brand-mix")
def brand_mix(dimension: str = Query("brand", pattern="^(brand|department)$"),
              db: Session = Depends(get_db)):
    return combined.brand_mix(db, dimension)
