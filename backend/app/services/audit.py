"""Audit log helper: каждое значимое действие пишется «кто / что / когда / почему»."""
import asyncio
import threading

from sqlalchemy.orm import Session

from ..models import Operation
from . import notify


def _notify_bg(notify_text: str) -> None:
    """Fire-and-forget Telegram из синхронного кода."""
    if notify_text:
        notify.fire_telegram(notify_text)


def log_op(db: Session, actor: str, action: str, entity: str, entity_id: str = "",
           details: str = "", reason: str = "", notify_text: str | None = None) -> None:
    db.add(Operation(actor=actor, action=action, entity=entity,
                     entity_id=str(entity_id), details=details, reason=reason))
    db.commit()
    _notify_bg(notify_text)
    notify.send_email(f"[Business Flow] {action}", notify_text)
