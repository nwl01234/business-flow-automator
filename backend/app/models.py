from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    """Naive UTC — чтобы не смешивать aware/naive при сравнениях."""
    from datetime import datetime as _dt, timezone
    return _dt.now(timezone.utc).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    login: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(256))
    full_name: Mapped[str] = mapped_column(String(128), default="")
    role: Mapped[str] = mapped_column(String(16), default="manager")  # admin | manager | bot
    email: Mapped[str] = mapped_column(String(128), default="")
    telegram_id: Mapped[int] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sku: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(128))
    stock: Mapped[int] = mapped_column(Integer, default=0)
    price: Mapped[float] = mapped_column(Float, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    number: Mapped[str] = mapped_column(String(24), unique=True, index=True)
    customer_name: Mapped[str] = mapped_column(String(128))
    contact: Mapped[str] = mapped_column(String(128), default="")
    note: Mapped[str] = mapped_column(String(256), default="")

    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    product: Mapped["Product"] = relationship(lazy="joined")
    qty: Mapped[int] = mapped_column(Integer)
    price: Mapped[float] = mapped_column(Float)  # цена на момент создания
    amount: Mapped[float] = mapped_column(Float)

    status: Mapped[str] = mapped_column(String(16), default="new", index=True)
    source: Mapped[str] = mapped_column(String(16), default="web")  # web | telegram
    deducted: Mapped[bool] = mapped_column(Boolean, default=False)

    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=True)
    creator: Mapped["User"] = relationship(lazy="joined")

    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class Operation(Base):
    """Audit log: кто, что, когда, почему."""
    __tablename__ = "operations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ts: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    actor: Mapped[str] = mapped_column(String(64))          # login / telegram-bot / scheduler / system
    action: Mapped[str] = mapped_column(String(32))         # order_created / status_changed / stock_deducted ...
    entity: Mapped[str] = mapped_column(String(16))         # order | product | system
    entity_id: Mapped[str] = mapped_column(String(32), default="")
    details: Mapped[str] = mapped_column(Text, default="")
    reason: Mapped[str] = mapped_column(Text, default="")

    def human(self) -> str:
        return f"[{self.ts:%d.%m %H:%M}] {self.actor}: {self.action} {self.entity}={self.entity_id} {self.details}" + (
            f" (причина: {self.reason})" if self.reason else "")
