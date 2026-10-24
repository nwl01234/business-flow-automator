import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import settings
from .database import Base, SessionLocal, engine
from .routers import analytics, auth, inventory, orders
from .services import seed
from .services import sheets as sheets_svc
from .services.scheduler import scheduler as aps_scheduler
from .ws import ws_endpoint

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(engine)
    db = SessionLocal()
    try:
        if sheets_svc.sheets_configured():
            try:
                n = sheets_svc.pull_from_sheet(db)
                logging.info("Google Sheets synced: %s позиций", n)
            except Exception as e:
                logging.warning("Sheets sync failed: %s", e)
        seed.seed(db)
    finally:
        db.close()
    aps_scheduler.start()
    yield
    aps_scheduler.shutdown()


app = FastAPI(title=settings.app_name, version="1.0.0", lifespan=lifespan,
              description="Автоматизация заявок, остатков, уведомлений и истории операций")

app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


@app.get("/health", include_in_schema=False)
def health():
    """Healthcheck для Railway/Render/VPS-мониторинга."""
    return {"status": "ok", "service": settings.app_name}

app.include_router(auth.router, prefix="/api")
app.include_router(orders.router, prefix="/api")
app.include_router(inventory.router, prefix="/api")
app.include_router(analytics.router, prefix="/api")
app.add_api_websocket_route("/api/ws", ws_endpoint)

# React-сборка (frontend/dist) приоритетнее; без неё раздаём zero-build Alpine-версию
_here = Path(__file__).resolve()
for _base in (_here.parents[2], _here.parents[1]):  # локальный запуск и Docker /app
    for _sd in ("dist", "alpine"):
        _d = _base / "frontend" / _sd
        if (_d / "index.html").exists():
            app.mount("/", StaticFiles(directory=str(_d), html=True), name="static")
            break
    else:
        continue
    break
