"""По расписанию: ежедневный отчёт + периодическая проверка низких остатков."""
import logging
from collections import Counter
from datetime import datetime, timedelta, timezone

from apscheduler.schedulers.background import BackgroundScheduler

from ..config import settings
from ..database import SessionLocal
from ..models import Operation, Order, Product, utcnow
from . import notify

log = logging.getLogger("scheduler")
scheduler = BackgroundScheduler(timezone="UTC")


def daily_report() -> None:
    """Каждый день в daily_report_hour: сводка по заявкам за сутки."""
    db = SessionLocal()
    try:
        since = utcnow() - timedelta(days=1)
        orders = db.query(Order).filter(Order.created_at >= since).all()
        if orders:
            revenue = sum(o.amount for o in orders if o.status in ("confirmed", "shipped"))
            top = Counter(o.product.name for o in orders).most_common(1)
            top_line = f"🏆 Лидер: {top[0][0]} ({top[0][1]} шт)" if top else ""
            text = (
                f"📊 <b>Дневной отчёт</b>\n"
                f"Заявок за сутки: {len(orders)}\n"
                f"Выручка: {revenue:,.0f} ₽\n{top_line}".replace(",", " ")
            )
        else:
            text = "📊 За последние 24 часа заявок не было."
        notify.fire_telegram(text)
        db.add(Operation(actor="scheduler", action="daily_report", entity="system",
                         details=f"orders={len(orders)}"))
        db.commit()
    finally:
        db.close()


def stock_check() -> None:
    """Проверяет низкие остатки и алертит."""
    db = SessionLocal()
    try:
        low = db.query(Product).filter(Product.stock <= settings.low_stock_threshold).all()
        if low:
            lines = "\n".join(f"• {p.name} ({p.sku}) — {p.stock} шт" for p in low[:10])
            notify.fire_telegram(f"⚠️ <b>Низкие остатки</b> ({len(low)} позиций):\n{lines}")
            db.add(Operation(actor="scheduler", action="low_stock_alert", entity="system",
                             details=f"low={len(low)}"))
            db.commit()
    finally:
        db.close()


def start() -> None:
    scheduler.add_job(daily_report, "cron", hour=settings.daily_report_hour, minute=0, id="daily_report")
    scheduler.add_job(stock_check, "interval", hours=settings.stock_check_hours, id="stock_check")
    scheduler.start()
    log.info("scheduler started")
