"""Уведомления: Telegram + Email. Все вызовы fail-safe: ошибка не ломает бизнес-логику."""
import asyncio
import logging
import smtplib
import threading
from email.mime.text import MIMEText

import httpx

from ..config import settings

log = logging.getLogger("notify")


def fire_telegram(text: str) -> None:
    """Sync fire-and-forget вызов async send_telegram (демон-поток со своей петлёй)."""
    if not (settings.telegram_bot_token and settings.notify_chat_id):
        return
    threading.Thread(target=lambda: asyncio.run(send_telegram(text)), daemon=True).start()


async def send_telegram(text: str) -> None:
    if not (settings.telegram_bot_token and settings.notify_chat_id):
        return
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(
                f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage",
                json={"chat_id": settings.notify_chat_id, "text": text, "parse_mode": "HTML"},
            )
    except Exception as e:
        log.warning("telegram notify failed: %s", e)


def send_email(subject: str, body: str) -> None:
    if not (settings.smtp_host and settings.email_to):
        return
    try:
        msg = MIMEText(body, "plain", "utf-8")
        msg["Subject"] = subject
        msg["From"] = settings.email_from or settings.smtp_user
        msg["To"] = settings.email_to
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as server:
            server.starttls()
            if settings.smtp_user:
                server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(msg)
    except Exception as e:
        log.warning("email notify failed: %s", e)


def order_created_text(number, customer, product, qty, amount, source) -> str:
    icon = "🌐" if source == "web" else "✈️"
    return (
        f"{icon} <b>Новая заявка {number}</b>\n"
        f"👤 {customer}\n"
        f"📦 {product} × {qty}\n"
        f"💰 {amount:,.0f} ₽".replace(",", " ")
    )


def status_changed_text(number, status, product, qty, reason) -> str:
    emoji = {"confirmed": "✅", "shipped": "🚚", "cancelled": "❌"}.get(status, "ℹ️")
    text = f"{emoji} Заявка {number} → <b>{status.upper()}</b>\n📦 {product} × {qty}"
    return text + (f"\n📝 Причина: {reason}" if reason else "")
