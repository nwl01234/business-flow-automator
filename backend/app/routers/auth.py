import time
from collections import defaultdict, deque

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..security import create_token, get_current_user, verify_password
from ..services import audit

router = APIRouter(prefix="/auth", tags=["auth"])

# Наивный рейт-лимит на попытки входа: 5 неудач в минуту на IP.
# Для одного процесса этого достаточно; за балансировщиком — на уровне nginx.
_login_tries: dict[str, deque] = defaultdict(deque)
_MAX_TRIES = 5
_WINDOW = 60.0


def _too_many(ip: str) -> bool:
    now = time.time()
    d = _login_tries[ip]
    while d and d[0] < now - _WINDOW:
        d.popleft()
    return len(d) >= _MAX_TRIES


def _register_fail(ip: str) -> None:
    _login_tries[ip].append(time.time())


@router.post("/login", response_model=schemas.TokenOut)
def login(body: schemas.LoginIn, request: Request, db: Session = Depends(get_db)):
    ip = request.client.host if request.client else "?"
    if _too_many(ip):
        raise HTTPException(429, "Слишком много попыток входа, подождите минуту")
    user = db.query(models.User).filter_by(login=body.login).first()
    if not user or not verify_password(body.password, user.password_hash):
        _register_fail(ip)
        audit.log_op(db, actor=ip, action="login_failed", entity="auth",
                     entity_id=body.login, details="неверный логин или пароль")
        raise HTTPException(401, "Неверный логин или пароль")
    return schemas.TokenOut(access_token=create_token(user), user=schemas.UserOut.model_validate(user))


@router.get("/me", response_model=schemas.UserOut)
def me(user: models.User = Depends(get_current_user)):
    return user
