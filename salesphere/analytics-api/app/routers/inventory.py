"""Inventory analytics endpoints (current stock, FSN, dead stock, movement)."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import config
from ..db import get_db
from ..services import analytics

router = APIRouter(prefix="/api/inventory", tags=["inventory"])


@router.get("/current-stock")
def current_stock(
    search: str | None = None,
    limit: int = Query(50, ge=1, le=100000),
    db: Session = Depends(get_db),
):
    return analytics.current_stock(db, search, limit)


@router.get("/fsn")
def fsn(
    fast_days: int = Query(config.FSN_FAST_DAYS, ge=1),
    slow_days: int = Query(config.FSN_SLOW_DAYS, ge=1),
    db: Session = Depends(get_db),
):
    if fast_days >= slow_days:
        raise HTTPException(400, "fast_days must be smaller than slow_days")
    return analytics.fsn(db, fast_days, slow_days)


@router.get("/dead-stock")
def dead_stock(days: int = Query(90, ge=1), db: Session = Depends(get_db)):
    return analytics.dead_stock(db, days)


@router.get("/movement")
def movement(
    item_code: str,
    from_: str | None = Query(None, alias="from"),
    to: str | None = None,
    db: Session = Depends(get_db),
):
    result = analytics.movement(db, item_code, from_, to)
    if result is None:
        raise HTTPException(404, "Unknown item")
    return result
