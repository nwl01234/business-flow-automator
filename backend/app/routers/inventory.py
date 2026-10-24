from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..security import get_current_user, require
from ..services import sheets

router = APIRouter(prefix="/inventory", tags=["inventory"])


@router.get("")
def list_inventory(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(models.Product).order_by(models.Product.stock.asc()).all()


@router.post("")
def upsert_product(body: schemas.ProductIn, user: models.User = Depends(require("admin")),
                   db: Session = Depends(get_db)):
    """Добавить/обновить позицию вручную (Админ)."""
    product = db.query(models.Product).filter_by(sku=body.sku).first()
    if product:
        product.name, product.stock, product.price = body.name, body.stock, body.price
    else:
        product = models.Product(**body.model_dump())
        db.add(product)
    db.commit()
    return product


@router.post("/sync")
def sync_from_sheets(user: models.User = Depends(require("admin")), db: Session = Depends(get_db)):
    """Ручная синхронизация остатков из Google Sheets → локальное зеркало."""
    if not sheets.sheets_configured():
        raise HTTPException(400, "Google Sheets не настроен (задайте GOOGLE_CREDENTIALS_FILE и GOOGLE_SHEET_ID)")
    updated = sheets.pull_from_sheet(db)
    return {"updated": updated}
