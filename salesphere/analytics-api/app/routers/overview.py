"""Overview + branch endpoints."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..db import get_db
from ..services import analytics

router = APIRouter(prefix="/api", tags=["overview"])


@router.get("/overview")
def overview(
    from_: str | None = Query(None, alias="from"),
    to: str | None = None,
    branch: str | None = None,
    db: Session = Depends(get_db),
):
    return analytics.overview(db, branch)


@router.get("/branches")
def branches(db: Session = Depends(get_db)):
    return {"rows": analytics.branch_summary(db)}
