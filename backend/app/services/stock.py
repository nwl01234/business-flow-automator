"""Складские операции.

Запись остатка идёт одним атомарным UPDATE ... WHERE stock >= qty:
два параллельных подтверждения не могут увести остаток в минус.
Транзакцией управляет вызывающий сервис — commit здесь не делается.
"""
from sqlalchemy import update
from sqlalchemy.orm import Session

from ..models import Product, utcnow


class InsufficientStock(Exception):
    def __init__(self, available: int, requested: int):
        self.available = available
        self.requested = requested
        super().__init__(f"available={available}, requested={requested}")


def available(db: Session, product_id: int) -> int:
    return db.query(Product.stock).filter(Product.id == product_id).scalar() or 0


def write_off(db: Session, product_id: int, qty: int) -> int:
    """Списать qty со склада. Возвращает новый остаток, либо InsufficientStock."""
    if qty <= 0:
        raise ValueError("qty must be positive")
    result = db.execute(
        update(Product)
        .where(Product.id == product_id, Product.stock >= qty)
        .values(stock=Product.stock - qty, updated_at=utcnow())
        .execution_options(synchronize_session=False)
    )
    if result.rowcount != 1:
        raise InsufficientStock(available(db, product_id), qty)
    return available(db, product_id)


def restock(db: Session, product_id: int, qty: int) -> int:
    """Вернуть qty на склад. Возвращает новый остаток."""
    if qty <= 0:
        raise ValueError("qty must be positive")
    db.execute(
        update(Product)
        .where(Product.id == product_id)
        .values(stock=Product.stock + qty, updated_at=utcnow())
        .execution_options(synchronize_session=False)
    )
    return available(db, product_id)
