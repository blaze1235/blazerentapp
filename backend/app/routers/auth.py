import logging
from fastapi import APIRouter, Depends, HTTPException, status

from ..auth import (
    hash_password,
    verify_password,
    is_plain_text_password,
    create_access_token,
    get_current_user,
    _customer_to_user,
)
from ..models import LoginRequest, RegisterRequest, TokenResponse, UserOut
from ..services import sheets as sh

log = logging.getLogger("router.auth")
router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest):
    import asyncio

    loop = asyncio.get_event_loop()

    # Look up customer in sheets (blocking I/O in executor)
    customer = await loop.run_in_executor(None, sh.find_customer_by_phone, req.phone.strip())

    if not customer:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Phone number not registered",
        )

    stored_pw = customer.get("password", "")
    if not verify_password(req.password, stored_pw):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid password",
        )

    # Silently upgrade plain-text bot passwords to bcrypt on first web login
    if is_plain_text_password(stored_pw):
        new_hash = hash_password(req.password)
        await loop.run_in_executor(
            None, lambda: sh.set_customer_password(customer["id"], new_hash)
        )

    user = _customer_to_user(customer)
    token = create_access_token({"sub": user.id})
    return TokenResponse(access_token=token, user=user)


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(req: RegisterRequest):
    import asyncio

    loop = asyncio.get_event_loop()

    # Check for existing customer
    existing = await loop.run_in_executor(None, sh.find_customer_by_phone, req.phone.strip())
    if existing:
        stored_pw = existing.get("password", "").strip()
        if stored_pw and not is_plain_text_password(stored_pw):
            # Already has a bcrypt hash — must use Sign In
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Phone number already registered. Use Sign In.",
            )
        # No password or plain-text (bot-registered) — set bcrypt hash now
        password_hash = hash_password(req.password)
        await loop.run_in_executor(
            None, lambda: sh.set_customer_password(existing["id"], password_hash)
        )
        existing["password"] = password_hash
        if req.name.strip():
            existing["name"] = existing.get("name") or req.name.strip()
        user = _customer_to_user(existing)
        token = create_access_token({"sub": user.id})
        return TokenResponse(access_token=token, user=user)

    # Validate name and phone
    name = req.name.strip()
    phone = req.phone.strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Name is required")
    if len(req.password) < 6:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Password must be at least 6 characters",
        )

    password_hash = hash_password(req.password)

    # Create customer in sheets
    customer = await loop.run_in_executor(
        None,
        lambda: sh.create_customer(
            tg_user_id=None,
            phone=phone,
            name=name,
            password_hash=password_hash,
            language="ru",
        ),
    )

    user = _customer_to_user(customer)
    token = create_access_token({"sub": user.id})
    return TokenResponse(access_token=token, user=user)


@router.get("/me", response_model=UserOut)
async def get_me(current_user: UserOut = Depends(get_current_user)):
    """Return the currently authenticated user's profile."""
    import asyncio

    loop = asyncio.get_event_loop()
    # Re-fetch to get fresh balance etc.
    customer = await loop.run_in_executor(None, sh.get_customer_by_id, current_user.id)
    if not customer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return _customer_to_user(customer)
