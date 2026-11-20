from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

OrderStatus = Literal["new", "confirmed", "shipped", "cancelled"]


class LoginIn(BaseModel):
    login: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=128)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    login: str
    full_name: str
    role: str
    email: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    sku: str
    name: str
    stock: int
    price: float


class ProductIn(BaseModel):
    sku: str = Field(min_length=1, max_length=32)
    name: str = Field(min_length=1, max_length=128)
    stock: int = Field(default=0, ge=0)
    price: float = Field(default=0, ge=0)


class OrderIn(BaseModel):
    product_id: int = Field(gt=0)
    qty: int = Field(gt=0, le=10_000)
    customer_name: str = Field(min_length=1, max_length=128)
    contact: str = Field(default="", max_length=128)
    note: str = Field(default="", max_length=256)


class OrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    number: str
    customer_name: str
    contact: str
    note: str
    product: ProductOut
    qty: int
    price: float
    amount: float
    status: str
    source: str
    created_at: datetime
    updated_at: datetime


class OrderStatusIn(BaseModel):
    status: OrderStatus
    reason: str = Field(default="", max_length=500)
