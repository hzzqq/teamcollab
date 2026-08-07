"""认证路由：注册 / 登录(OAuth2 Password) / 刷新。"""

from fastapi import APIRouter, Depends
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.schemas.auth import (
    AuthResponse,
    RefreshRequest,
    RefreshResponse,
    RegisterRequest,
)
from app.services.auth_service import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=AuthResponse, status_code=201)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    data = auth_service.register(db, payload.email, payload.password, payload.display_name)
    return {"code": 0, "data": data, "message": ""}


@router.post("/login", response_model=AuthResponse)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    data = auth_service.login(db, form.username, form.password)
    return {"code": 0, "data": data, "message": ""}


@router.post("/refresh", response_model=RefreshResponse)
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)):
    data = auth_service.refresh(db, payload.refresh_token)
    return {"code": 0, "data": data, "message": ""}
