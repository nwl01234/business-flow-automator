"""Адаптер остатков: Google Sheets (источник правды) + локальное зеркало в БД.

Если ключи Sheets не заданы — работаем только с локальной таблицей products.
Это позволяет демку запускать без внешних зависимостей.
"""
from sqlalchemy.orm import Session

from ..config import settings
from ..models import Product, utcnow

_HEADERS = ("SKU", "Name", "Stock", "Price")  # A, B, C, D


def sheets_configured() -> bool:
    return bool(settings.google_credentials_file and settings.google_sheet_id)


def _worksheet():
    import gspread

    gc = gspread.service_account(filename=settings.google_credentials_file)
    sh = gc.open_by_key(settings.google_sheet_id)
    return sh.worksheet(settings.google_sheet_name)


def pull_from_sheet(db: Session) -> int:
    """Тянет остатки из Sheets в локальное зеркало. Возвращает кол-во обновлённых позиций."""
    ws = _worksheet()
    updated = 0
    for row in ws.get_all_records():
        sku = str(row.get("SKU", "")).strip()
        if not sku:
            continue
        product = db.query(Product).filter_by(sku=sku).first()
        if not product:
            product = Product(sku=sku, name=str(row.get("Name", sku)))
            db.add(product)
        product.name = str(row.get("Name", product.name))
        product.stock = int(row.get("Stock", 0) or 0)
        product.price = float(row.get("Price", product.price) or 0)
        product.updated_at = utcnow()
        updated += 1
    db.commit()
    return updated


def push_stock(sku: str, new_stock: int) -> None:
    """Списывает/обновляет остаток в Sheets (колонка C)."""
    if not sheets_configured():
        return
    try:
        ws = _worksheet()
        cell = ws.find(sku, in_column=1)
        if cell:
            ws.update_cell(cell.row, 3, new_stock)
    except Exception:
        pass  # Sheets не должен ронять заказ; зеркало в БД уже обновлено


def deduct(db: Session, product: Product, qty: int, actor: str) -> int:
    """Списывает qty единиц: Sheets (если настроен) + локальное зеркало. Возвращает новый остаток."""
    product.stock = max(0, product.stock - qty)
    product.updated_at = utcnow()
    db.commit()
    push_stock(product.sku, product.stock)
    return product.stock


def restock(db: Session, product: Product, qty: int) -> int:
    """Возвращает товар на остаток (при отмене списанного заказа)."""
    product.stock += qty
    product.updated_at = utcnow()
    db.commit()
    push_stock(product.sku, product.stock)
    return product.stock
