import hashlib
import os
import time

import jwt
from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from .config import settings
from .database import get_db
from .models import User

_ROLES = {"admin", "manager", "bot"}


def hash_password(password: str) -> str:
    salt = os.urandom(16).hex()
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000).hex()
    return f"{salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, digest = stored.split("$", 1)
    except ValueError:
        return False
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000).hex() == digest


def create_token(user: User) -> str:
    payload = {
        "sub": str(user.id),
        "login": user.login,
        "role": user.role,
        "exp": int(time.time()) + settings.jwt_ttl_min * 60,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def get_current_user(
    authorization: str = Header(...),
    db: Session = Depends(get_db),
) -> User:
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Требуется Bearer-токен")
    try:
        payload = jwt.decode(authorization[7:], settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "Токен невалиден или истёк")
    user = db.get(User, int(payload["sub"]))
    if not user:
        raise HTTPException(401, "Пользователь не найден")
    return user


def require(*roles):
    def dep(user: User = Depends(get_current_user)) -> User:
        if roles and user.role not in roles:
            raise HTTPException(403, "Недостаточно прав")
        return user
    return dep
