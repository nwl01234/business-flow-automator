from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..models import utcnow
from ..security import get_current_user, require
from ..services import audit, excel, sheets
from ..ws import hub

router = APIRouter(prefix="/orders", tags=["orders"])

ALLOWED_TRANSITIONS = {
    "new": {"confirmed", "cancelled"},
    "confirmed": {"shipped", "cancelled"},
    "shipped": set(),
    "cancelled": set(),
}


def _order_out(order: models.Order) -> dict:
    data = jsonable_encoder(schemas.OrderOut.model_validate(order))
    data["created_by_name"] = order.creator.full_name or order.creator.login if order.creator else "—"
    return data


def get_order_scoped(order_id: int, user: models.User, db: Session) -> models.Order:
    order = db.get(models.Order, order_id)
    if not order:
        raise HTTPException(404, "Заявка не найдена")
    if user.role == "manager" and order.created_by_id != user.id:
        raise HTTPException(403, "Доступны только свои заявки")
    return order


@router.get("")
def list_orders(status: str = "", date_from: str = "", date_to: str = "", source: str = "",
                user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Список заявок. Менеджер видит только свои. Фильтры: статус, даты, канал."""
    from datetime import datetime, timedelta

    q = db.query(models.Order).order_by(models.Order.created_at.desc())
    if user.role == "manager":
        q = q.filter(or_(models.Order.created_by_id == user.id, models.Order.created_by_id.is_(None)))
    if status:
        q = q.filter(models.Order.status == status)
    if source:
        q = q.filter(models.Order.source == source)
    if date_from:
        q = q.filter(models.Order.created_at >= datetime.fromisoformat(date_from))
    if date_to:
        q = q.filter(models.Order.created_at <= datetime.fromisoformat(date_to) + timedelta(days=1))
    return [_order_out(o) for o in q.limit(300).all()]


@router.post("", status_code=201)
def create_order(body: schemas.OrderIn, background: BackgroundTasks,
                 user: models.User = Depends(require("admin", "manager", "bot")),
                 db: Session = Depends(get_db)):
    """Создание заявки (форма дашборда или бот) + автопроверка остатка."""
    product = db.get(models.Product, body.product_id)
    if not product:
        raise HTTPException(404, "Товар не найден")
    if body.qty <= 0:
        raise HTTPException(400, "Количество должно быть больше 0")
    if product.stock < body.qty:
        raise HTTPException(409, {
            "error": "insufficient_stock",
            "message": f"Недостаточно остатка: доступно {product.stock} шт, запрошено {body.qty} шт",
            "available": product.stock,
        })

    seq = (db.query(models.Order).count() + 1001)
    order = models.Order(
        number=f"BF-{utcnow():%Y%m%d}-{seq}",
        customer_name=body.customer_name, contact=body.contact, note=body.note,
        product_id=product.id, qty=body.qty, price=product.price,
        amount=product.price * body.qty, status="new",
        source="telegram" if user.role == "bot" else "web",
        created_by_id=user.id,
    )
    db.add(order)
    db.commit()
    from ..services.notify import order_created_text
    audit.log_op(
        db, actor=user.login, action="order_created", entity="order", entity_id=order.number,
        details=f"{product.name} × {order.qty} = {order.amount:,.0f} ₽ | остаток: {product.stock} шт",
        notify_text=order_created_text(order.number, order.customer_name, product.name,
                                       order.qty, order.amount, order.source),
    )
    background.add_task(hub.broadcast, {"type": "orders_updated",
                                        "number": order.number, "status": order.status})
    background.add_task(excel.sync_in_background)
    return JSONResponse(status_code=201, content=_order_out(order))


@router.patch("/{order_id}/status")
def change_status(order_id: int, body: schemas.OrderStatusIn, background: BackgroundTasks,
                  user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Смена статуса вручную. Подтверждение списывает остаток, отмена — возвращает его."""
    order = get_order_scoped(order_id, user, db)
    if body.status not in ALLOWED_TRANSITIONS.get(order.status, set()):
        raise HTTPException(400, f"Недопустимый переход {order.status} → {body.status}")
    if body.status == "cancelled" and not body.reason:
        raise HTTPException(400, "Для отмены укажите причину")

    details = []
    from ..services.notify import status_changed_text
    if body.status == "confirmed" and not order.deducted:
        new_stock = sheets.deduct(db, order.product, order.qty, user.login)
        order.deducted = True
        details.append(f"списано {order.qty} шт, остаток: {new_stock}")
    elif body.status == "cancelled" and order.deducted:
        new_stock = sheets.restock(db, order.product, order.qty)
        order.deducted = False
        details.append(f"возврат {order.qty} шт на остаток ({new_stock} шт)")

    order.status = body.status
    db.commit()
    audit.log_op(
        db, actor=user.login, action=f"status_{body.status}", entity="order",
        entity_id=order.number, details="; ".join(details), reason=body.reason,
        notify_text=status_changed_text(order.number, body.status, order.product.name,
                                        order.qty, body.reason),
    )
    background.add_task(hub.broadcast, {"type": "orders_updated",
                                        "number": order.number, "status": body.status})
    background.add_task(excel.sync_in_background)
    return _order_out(order)
