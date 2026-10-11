"""SalesSphere Analytics API — serves the desktop dashboard from the synced MySQL data.

Run:  uvicorn app.main:app --host 127.0.0.1 --port 8000
Docs: http://127.0.0.1:8000/docs
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import config, db
from .routers import chat, customers, export_csv, importer, insights, inventory, overview, sales
from .services.chat_engine import is_ollama_available

app = FastAPI(
    title="SalesSphere Analytics API",
    description="Sales, inventory, customer and chatbot analytics over the SalesSphere target database.",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    # "null" covers the Electron file:// origin, which Chromium reports as Origin: null
    allow_origins=config.CORS_ORIGINS + ["null"],
    allow_origin_regex=config.CORS_ORIGIN_REGEX,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(overview.router)
app.include_router(sales.router)
app.include_router(inventory.router)
app.include_router(customers.router)
app.include_router(insights.router)
app.include_router(export_csv.router)
app.include_router(importer.router)
app.include_router(chat.router)


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "database": db.db_name(),
        "database_ok": db.db_ok(),
        "ollama": is_ollama_available(),
        "ollama_model": config.OLLAMA_MODEL,
    }
