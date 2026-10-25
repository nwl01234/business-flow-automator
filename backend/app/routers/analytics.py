"""Аналитика и история операций. Агрегация в Python — БД-независимо (SQLite/Postgres)."""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..models import utcnow
from ..security import get_current_user
from ..services import excel, sheets

router = APIRouter(prefix="/analytics", tags=["analytics"])

PAID_STATUSES = ("confirmed", "shipped")


def _in_range(db: Session, date_from: str, date_to: str):
    q = db.query(models.Order).order_by(models.Order.created_at)
    if date_from:
        q = q.filter(models.Order.created_at >= datetime.fromisoformat(date_from))
    if date_to:
        q = q.filter(models.Order.created_at <= datetime.fromisoformat(date_to) + timedelta(days=1))
    return q.all()


@router.get("/metrics")
def metrics(date_from: str = "", date_to: str = "",
            user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    filters = {}
    if date_from:
        filters["from"] = datetime.fromisoformat(date_from)
    if date_to:
        filters["to"] = datetime.fromisoformat(date_to) + timedelta(days=1)

    orders = _in_range(db, date_from, date_to)
    today = utcnow().date()
    week_ago = today - timedelta(days=7)

    today_orders = [o for o in orders if o.created_at.date() == today]
    week_orders = [o for o in orders if o.created_at.date() >= week_ago]
    revenue_week = sum(o.amount for o in week_orders if o.status in PAID_STATUSES)
    revenue_total = sum(o.amount for o in orders if o.status in PAID_STATUSES)

    valid = [o for o in orders if o.status != "cancelled"]
    won = [o for o in valid if o.status in PAID_STATUSES]
    conversion = round(len(won) / len(valid) * 100, 1) if valid else 0.0
    avg_check = round(sum(o.amount for o in won) / len(won)) if won else 0

    low_stock = [
        {"sku": p.sku, "name": p.name, "stock": p.stock}
        for p in db.query(models.Product)
        .filter(models.Product.stock <= 5).order_by(models.Product.stock).limit(8).all()
    ]

    # Динамика по дням
    series = {}
    for o in orders:
        key = o.created_at.strftime("%d.%m")
        d = series.setdefault(key, {"date": key, "count": 0, "revenue": 0})
        d["count"] += 1
        if o.status in PAID_STATUSES:
            d["revenue"] += o.amount

    products_count = {}
    for o in won:
        name = o.product.name
        d = products_count.setdefault(name, {"name": name, "qty": 0, "revenue": 0})
        d["qty"] += o.qty
        d["revenue"] += o.amount
    top_products = sorted(products_count.values(), key=lambda x: -x["qty"])[:5]

    # Среднее время подтверждение → отгрузка (по отгруженным за период)
    shipped = [o for o in orders if o.status == "shipped"]
    avg_ship_hours = round(
        sum((o.updated_at - o.created_at).total_seconds() for o in shipped) / len(shipped) / 3600, 1
    ) if shipped else None

    return {
        "orders_today": len(today_orders),
        "orders_week": len(week_orders),
        "orders_total": len(orders),
        "revenue_week": revenue_week,
        "revenue_total": revenue_total,
        "conversion": conversion,
        "avg_check": avg_check,
        "avg_ship_hours": avg_ship_hours,
        "low_stock": low_stock,
        "series": list(series.values()),
        "top_products": top_products,
        "by_source": {
            s: len([o for o in orders if o.source == s])
            for s in ("telegram", "web")
        },
        "status_counts": {
            s: len([o for o in orders if o.status == s])
            for s in ("new", "confirmed", "shipped", "cancelled")
        },
    }


@router.get("/operations")
def operations(limit: int = 60, entity: str = "",
               user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Лента истории: кто, что, когда, почему."""
    q = db.query(models.Operation).order_by(models.Operation.ts.desc())
    if entity:
        q = q.filter(models.Operation.entity == entity)
    return [
        {"id": op.id, "ts": op.ts.isoformat(), "actor": op.actor, "action": op.action,
         "entity": op.entity, "entity_id": op.entity_id, "details": op.details, "reason": op.reason}
        for op in q.limit(min(limit, 200)).all()
    ]


@router.get("/export/excel")
def export_excel(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Живое Excel-зеркало данных: Orders / Stock / Operations."""
    path = excel.sync_mirror(db)
    return FileResponse(path, media_type=excel.XLSX_MEDIA, filename="business_flow.xlsx")


@router.get("/integrations")
def integrations(user: models.User = Depends(get_current_user)):
    """Статус внешних выгрузок: Google Sheets и Excel-зеркало."""
    return {
        "sheets_configured": sheets.sheets_configured(),
        "excel_mirror": excel.mirror_path().exists(),
    }
