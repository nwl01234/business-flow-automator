from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..security import get_current_user, require
from ..services import excel, notify, orders as order_service, sheets, stock
from ..ws import hub

router = APIRouter(prefix="/orders", tags=["orders"])


def _order_out(order: models.Order) -> dict:
    data = jsonable_encoder(schemas.OrderOut.model_validate(order))
    data["created_by_name"] = (
        (order.creator.full_name or order.creator.login) if order.creator else "—"
    )
    return data


def _publish(background: BackgroundTasks, order: models.Order,
             sheet_push: tuple[str, int] | None) -> None:
    """Побочные эффекты только после commit: WS, Excel, уведомления, Sheets."""
    background.add_task(hub.broadcast, {"type": "orders_updated",
                                        "number": order.number, "status": order.status})
    background.add_task(excel.sync_in_background)
    if sheet_push:
        background.add_task(sheets.push_stock, *sheet_push)


@router.get("")
def list_orders(status: str = "", date_from: str = "", date_to: str = "", source: str = "",
                user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [_order_out(o) for o in order_service.list_orders(
        db, user, status=status, date_from=date_from, date_to=date_to, source=source)]


@router.post("", status_code=201)
def create_order(body: schemas.OrderIn, background: BackgroundTasks,
                 user: models.User = Depends(require("admin", "manager", "bot")),
                 db: Session = Depends(get_db)):
    try:
        order = order_service.create_order(db, user, body)
    except stock.InsufficientStock as e:
        raise HTTPException(409, {
            "error": "insufficient_stock",
            "message": f"Недостаточно остатка: доступно {e.available} шт, запрошено {e.requested} шт",
            "available": e.available,
        })
    except order_service.OrderNotFound:
        raise HTTPException(404, "Товар не найден")

    text = notify.order_created_text(order.number, order.customer_name, order.product.name,
                                     order.qty, order.amount, order.source)
    background.add_task(notify.fire_telegram, text)
    background.add_task(notify.send_email, f"[Business Flow] заявка {order.number}", text)
    _publish(background, order, None)
    return JSONResponse(status_code=201, content=_order_out(order))


@router.patch("/{order_id}/status")
def change_status(order_id: int, body: schemas.OrderStatusIn, background: BackgroundTasks,
                  user: models.User = Depends(require("admin", "manager")),
                  db: Session = Depends(get_db)):
    try:
        result = order_service.change_status(db, user, order_id, body.status, body.reason)
    except order_service.OrderNotFound:
        raise HTTPException(404, "Заявка не найдена")
    except order_service.OrderAccessDenied:
        raise HTTPException(403, "Доступны только свои заявки")
    except order_service.InvalidTransition as e:
        raise HTTPException(400, f"Недопустимый переход {e.current} → {e.target}")
    except stock.InsufficientStock as e:
        raise HTTPException(409, {
            "error": "insufficient_stock",
            "message": f"Остаток изменился: доступно {e.available} шт, нужно {e.requested} шт",
            "available": e.available,
        })
    except ValueError as e:
        raise HTTPException(400, str(e))

    order = result.order
    text = notify.status_changed_text(order.number, order.status, order.product.name,
                                      order.qty, body.reason)
    background.add_task(notify.fire_telegram, text)
    background.add_task(notify.send_email, f"[Business Flow] {order.number}: {order.status}", text)
    _publish(background, order, result.sheet_push)
    return _order_out(order)
