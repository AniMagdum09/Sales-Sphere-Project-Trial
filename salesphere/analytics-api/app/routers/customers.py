"""Customer analytics endpoints."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..db import get_db
from ..services import analytics

router = APIRouter(prefix="/api/customers", tags=["customers"])


@router.get("/top")
def top(limit: int = Query(10, ge=1, le=200), db: Session = Depends(get_db)):
    return {"rows": analytics.sales_by_customer(db, None, None, limit)}


@router.get("/{customer_id}")
def detail(customer_id: int, db: Session = Depends(get_db)):
    result = analytics.customer_detail(db, customer_id)
    if result is None:
        raise HTTPException(404, "Unknown customer")
    return result
