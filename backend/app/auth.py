import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import bcrypt
from jose import JWTError, jwt

from .config import settings
from .models import UserOut

log = logging.getLogger("auth")

bearer_scheme = HTTPBearer(auto_error=False)

ADMIN_PHONES = set()  # populated from env or sheets at startup


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, stored: str) -> bool:
    if not stored:
        return False
    # Bcrypt hashes start with $2b$ or $2a$
    if stored.startswith("$2"):
        try:
            return bcrypt.checkpw(plain.encode(), stored.encode())
        except Exception:
            return False
    # Legacy: bot stored passwords as plain text
    return plain == stored


def is_plain_text_password(stored: str) -> bool:
    return bool(stored) and not stored.startswith("$2")


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.access_token_expire_minutes)
    )
    to_encode["exp"] = expire
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        return payload
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from e


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> UserOut:
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_token(credentials.credentials)
    customer_id: str = payload.get("sub")
    if not customer_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    # Import here to avoid circular imports
    from .services import sheets as sh

    customer = sh.get_customer_by_id(customer_id)
    if not customer:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return _customer_to_user(customer)


async def get_admin_user(user: UserOut = Depends(get_current_user)) -> UserOut:
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user


def _customer_to_user(customer: dict) -> UserOut:
    """Convert a sheets customer dict to UserOut model."""
    from .services import sheets as sh

    cid = customer.get("id", "")
    phone = customer.get("phone", "")
    balance_raw = customer.get("balance", "0")
    try:
        balance = int(str(balance_raw).strip().lstrip("'") or "0")
    except Exception:
        balance = 0

    # Determine tier based on total spent
    total_spent_raw = customer.get("total_spent", "0")
    try:
        total_spent = int(str(total_spent_raw).strip().lstrip("'") or "0")
    except Exception:
        total_spent = 0

    tier = "bronze"
    if total_spent >= 500000:
        tier = "gold"
    elif total_spent >= 150000:
        tier = "silver"

    # Check admin
    is_admin = phone in ADMIN_PHONES or customer.get("is_admin", "").lower() in ("1", "true", "yes")

    return UserOut(
        id=cid,
        name=customer.get("name", ""),
        phone=phone,
        balance=balance,
        tier=tier,
        tg_chat_id=customer.get("tg_user_id") or customer.get("tg_chat_id") or None,
        language=customer.get("language", "ru") or "ru",
        is_admin=is_admin,
        created_at=customer.get("created_at"),
    )
