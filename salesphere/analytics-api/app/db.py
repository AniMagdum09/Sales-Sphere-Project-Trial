"""SQLAlchemy engine/session for the SalesSphere target database (read-only usage)."""
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from . import config

engine = create_engine(config.DB_URL, pool_pre_ping=True, pool_recycle=1800, future=True)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False, future=True)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def db_name() -> str:
    try:
        with engine.connect() as c:
            return str(c.execute(text("SELECT DATABASE()")).scalar())
    except Exception:
        return "unavailable"


def db_ok() -> bool:
    try:
        with engine.connect() as c:
            c.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
