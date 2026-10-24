from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class LoginIn(BaseModel):
    login: str
    password: str


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
    sku: str
    name: str
    stock: int = 0
    price: float = 0


class OrderIn(BaseModel):
    product_id: int
    qty: int
    customer_name: str
    contact: str = ""
    note: str = ""


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
    status: str
    reason: str = ""
