"""Журнал операций: кто, что, когда, почему.

record() только добавляет запись в текущую транзакцию. Commit делает вызвавший
сервис — так бизнес-изменение и его аудит-след фиксируются атомарно.
"""
from sqlalchemy.orm import Session

from ..models import Operation


def record(db: Session, actor: str, action: str, entity: str, entity_id: str = "",
           details: str = "", reason: str = "") -> None:
    db.add(Operation(actor=actor, action=action, entity=entity,
                     entity_id=str(entity_id), details=details, reason=reason))
