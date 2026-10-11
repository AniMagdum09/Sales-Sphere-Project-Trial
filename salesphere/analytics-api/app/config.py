"""Runtime configuration for the SalesSphere analytics API (environment variables)."""
import os

# Target MySQL (SalesSphere-owned). Point at a different DB name to switch datasets,
# e.g. salessphere_demo for the synthetic demo data.
DB_URL = os.environ.get(
    "SALESSPHERE_DB_URL",
    "mysql+pymysql://root:root@127.0.0.1:3306/salessphere_local?charset=utf8mb4",
)

# Local LLM (Ollama) for the chatbot. Falls back to rule-based answers when unreachable.
OLLAMA_URL = os.environ.get("SALESSPHERE_OLLAMA_URL", "http://127.0.0.1:11434")
OLLAMA_MODEL = os.environ.get("SALESSPHERE_OLLAMA_MODEL", "qwen3:8b")

# FSN classification thresholds (days since last sale)
FSN_FAST_DAYS = int(os.environ.get("SALESSPHERE_FSN_FAST_DAYS", "30"))
FSN_SLOW_DAYS = int(os.environ.get("SALESSPHERE_FSN_SLOW_DAYS", "90"))

# CORS: desktop app (Electron file origin), vite dev (5173) and preview (4173)
CORS_ORIGINS = os.environ.get(
    "SALESSPHERE_CORS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173"
).split(",")
# any local origin (any port) is allowed — this app only ever listens on 127.0.0.1
CORS_ORIGIN_REGEX = r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"
