"""Доменный сервис заявок: создание и смена статуса.

Здесь живут правила, которые нельзя доверять UI:
- проверка остатка и допустимых переходов;
- проверка доступа к конкретной заявке (admin — все, manager — свои
  и нераспределённые, bot — только созданные им);
- списание/возврат остатка, флаг deducted и аудит в одной транзакции.

Роутеры остаются тонкими: валидация схемы → вызов сервиса → HTTP-ошибка.
"""
from datetime import datetime, timedelta
from uuid import uuid4

from sqlalchemy import or_, update
from sqlalchemy.orm import Session

from .. import models
from ..models import utcnow
from . import audit, stock

ALLOWED_TRANSITIONS = {
    "new": {"confirmed", "cancelled"},
    "confirmed": {"shipped", "cancelled"},
    "shipped": set(),
    "cancelled": set(),
}

STATUS_LABELS = {
    "new": "создана",
    "confirmed": "подтверждена",
    "shipped": "отгружена",
    "cancelled": "отменена",
}


class OrderNotFound(Exception):
    pass


class OrderAccessDenied(Exception):
    pass


class InvalidTransition(Exception):
    def __init__(self, current: str, target: str):
        self.current = current
        self.target = target
        super().__init__(f"{current} -> {target}")


class StatusResult:
    def __init__(self, order: models.Order, details: str = "",
                 sheet_push: tuple[str, int] | None = None):
        self.order = order
        self.details = details
        self.sheet_push = sheet_push


def get_order(db: Session, user: models.User, order_id: int) -> models.Order:
    """Object-level access check."""
    order = db.get(models.Order, order_id)
    if not order:
        raise OrderNotFound
    if user.role == "admin":
        return order
    if order.created_by_id == user.id:
        return order
    # Нераспределённые заявки (бот/импорт) — общий пул менеджеров.
    if user.role == "manager" and order.created_by_id is None:
        return order
    raise OrderAccessDenied


def list_orders(db: Session, user: models.User, status: str = "", date_from: str = "",
                date_to: str = "", source: str = "") -> list[models.Order]:
    query = db.query(models.Order).order_by(models.Order.created_at.desc())
    if user.role != "admin":
        query = query.filter(or_(models.Order.created_by_id == user.id,
                                 models.Order.created_by_id.is_(None)))
    if status:
        query = query.filter(models.Order.status == status)
    if source:
        query = query.filter(models.Order.source == source)
    if date_from:
        query = query.filter(models.Order.created_at >= datetime.fromisoformat(date_from))
    if date_to:
        query = query.filter(models.Order.created_at <= datetime.fromisoformat(date_to) + timedelta(days=1))
    return query.limit(300).all()


def create_order(db: Session, user: models.User, data) -> models.Order:
    product = db.get(models.Product, data.product_id)
    if not product:
        raise OrderNotFound("Товар не найден")
    if product.stock < data.qty:
        raise stock.InsufficientStock(product.stock, data.qty)

    now = utcnow()
    order = models.Order(
        number=f"tmp-{uuid4().hex[:12]}",
        customer_name=data.customer_name.strip(),
        contact=data.contact.strip(),
        note=data.note.strip(),
        product_id=product.id,
        qty=data.qty,
        price=product.price,
        amount=product.price * data.qty,
        status="new",
        source="telegram" if user.role == "bot" else "web",
        # Заявка бота — нераспределённый входящий поток, а не собственность бота.
        created_by_id=None if user.role == "bot" else user.id,
        created_at=now,
        updated_at=now,
    )
    db.add(order)
    try:
        db.flush()
        order.number = f"BF-{now:%Y%m%d}-{1000 + order.id}"
        audit.record(
            db, actor=user.login, action="order_created", entity="order",
            entity_id=order.number,
            details=f"{product.name} × {order.qty} = {order.amount:,.0f} ₽ | остаток: {product.stock} шт",
        )
        db.commit()
    except Exception:
        db.rollback()
        raise
    return order


def change_status(db: Session, user: models.User, order_id: int, target: str,
                  reason: str = "") -> StatusResult:
    order = get_order(db, user, order_id)

    # Повтор того же статуса — идемпотентный no-op, остаток не трогаем.
    if order.status == target:
        return StatusResult(order, details="повторное применение статуса, изменений нет")

    if target not in ALLOWED_TRANSITIONS.get(order.status, set()):
        raise InvalidTransition(order.status, target)
    if target == "cancelled" and not reason.strip():
        raise ValueError("Для отмены укажите причину")

    actor = user.login
    product = order.product
    details: list[str] = []
    sheet_push: tuple[str, int] | None = None

    try:
        if target == "confirmed":
            # Захват флага deducted — защита от двойного списания даже при гонке.
            claimed = db.execute(
                update(models.Order)
                .where(models.Order.id == order.id, models.Order.deducted.is_(False))
                .values(deducted=True)
                .execution_options(synchronize_session=False)
            )
            if claimed.rowcount == 1:
                new_stock = stock.write_off(db, order.product_id, order.qty)
                details.append(f"списано {order.qty} шт, остаток: {new_stock}")
                audit.record(db, actor=actor, action="stock_write_off", entity="product",
                             entity_id=product.sku,
                             details=f"-{order.qty} шт по заявке {order.number}, остаток: {new_stock}")
                sheet_push = (product.sku, new_stock)
            else:
                details.append("остаток уже был списан ранее")

        elif target == "cancelled" and order.deducted:
            new_stock = stock.restock(db, order.product_id, order.qty)
            db.execute(
                update(models.Order)
                .where(models.Order.id == order.id)
                .values(deducted=False)
                .execution_options(synchronize_session=False)
            )
            details.append(f"возврат {order.qty} шт на остаток ({new_stock} шт)")
            audit.record(db, actor=actor, action="stock_restock", entity="product",
                         entity_id=product.sku,
                         details=f"+{order.qty} шт по заявке {order.number}, остаток: {new_stock}")
            sheet_push = (product.sku, new_stock)

        order.status = target
        order.updated_at = utcnow()
        order.deducted = target in ("confirmed", "shipped")
        audit.record(
            db, actor=actor, action=f"status_{target}", entity="order",
            entity_id=order.number, details="; ".join(details), reason=reason.strip(),
        )
        db.commit()
    except Exception:
        db.rollback()
        raise

    db.refresh(order)
    return StatusResult(order, details="; ".join(details), sheet_push=sheet_push)
