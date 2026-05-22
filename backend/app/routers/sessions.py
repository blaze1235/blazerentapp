import asyncio
import logging
from datetime import datetime
from typing import List, Optional

import pytz
from fastapi import APIRouter, Depends, HTTPException, status

from ..auth import get_current_user, _customer_to_user
from ..models import (
    ExtendRequest,
    RentQuote,
    RentRequest,
    RentalSession,
    UserOut,
)
from ..services import sheets as sh
from ..services import bot_notify
from ..services.scheduler import schedule_session_jobs, cancel_session_jobs

log = logging.getLogger("router.sessions")
router = APIRouter(prefix="/sessions", tags=["sessions"])

TZ = pytz.timezone("Asia/Tashkent")


def _order_to_session(order: dict, account: Optional[dict] = None) -> RentalSession:
    acc_login = ""
    acc_password = ""
    if account:
        acc_login = account.get("steam_login", "")
        acc_password = account.get("steam_password", "")
    elif order.get("account_id"):
        acc = sh.get_account(order["account_id"])
        if acc:
            acc_login = acc.get("steam_login", "")
            acc_password = acc.get("steam_password", "")

    status_map = {
        "active": "active",
        "finished": "completed",
        "expired": "expired",
        "pending": "active",
        "pending_payment": "active",
    }
    raw_status = order.get("status", "active").lower()
    mapped = status_map.get(raw_status, "completed")

    try:
        cost = int(str(order.get("paid_amount", 0) or 0).strip().lstrip("'"))
    except Exception:
        cost = 0
    try:
        hours = int(str(order.get("hours", 1) or 1))
    except Exception:
        hours = 1

    return RentalSession(
        id=order["id"],
        account_login=acc_login,
        account_password=acc_password,
        started_at=order.get("start_at") or order.get("created_at", ""),
        ends_at=order.get("end_at", ""),
        hours_total=hours,
        cost=cost,
        status=mapped,
    )


@router.get("/active", response_model=Optional[RentalSession])
async def get_active_session(current_user: UserOut = Depends(get_current_user)):
    """Return the user's currently active session, or null."""
    loop = asyncio.get_event_loop()
    order = await loop.run_in_executor(None, sh.get_active_order_for_customer, current_user.id)
    if not order:
        return None

    # Check if the session has actually expired
    end_at_str = order.get("end_at", "")
    if end_at_str:
        try:
            end_at = datetime.fromisoformat(end_at_str)
            if end_at.tzinfo is None:
                end_at = TZ.localize(end_at)
            if end_at < datetime.now(pytz.utc):
                # Mark as expired
                await loop.run_in_executor(
                    None,
                    lambda: sh.set_order_status(order["id"], "expired"),
                )
                return None
        except Exception:
            pass

    return _order_to_session(order)


@router.post("/quote", response_model=RentQuote)
async def quote_rent(req: RentRequest, current_user: UserOut = Depends(get_current_user)):
    """Get price quote for a rental without creating it."""
    loop = asyncio.get_event_loop()

    lo, hi = await loop.run_in_executor(None, sh.get_limits)
    if req.hours < lo or req.hours > hi:
        raise HTTPException(
            status_code=400,
            detail=f"Hours must be between {lo} and {hi}",
        )

    pph, currency = await loop.run_in_executor(None, sh.get_price_currency)
    original_cost = pph * req.hours
    discount = 0
    promo_applied = False
    promo_discount_str = ""

    if req.promo_code:
        ok, new_cost, disc_str, reason = await loop.run_in_executor(
            None,
            lambda: sh.apply_promo(req.promo_code, original_cost, current_user.id),
        )
        if ok:
            discount = original_cost - new_cost
            promo_applied = True
            promo_discount_str = disc_str
        else:
            raise HTTPException(status_code=400, detail=f"Promo code invalid: {reason}")

    final_cost = original_cost - discount
    balance_after = current_user.balance - final_cost

    return RentQuote(
        hours=req.hours,
        price_per_hour=pph,
        original_cost=original_cost,
        discount=discount,
        final_cost=final_cost,
        currency=currency,
        promo_applied=promo_applied,
        promo_discount_str=promo_discount_str,
        balance_after=balance_after,
        can_afford=current_user.balance >= final_cost,
    )


@router.post("/rent", response_model=RentalSession, status_code=status.HTTP_201_CREATED)
async def start_rental(req: RentRequest, current_user: UserOut = Depends(get_current_user)):
    """Start a new rental session. Deducts balance, assigns account, schedules logout."""
    loop = asyncio.get_event_loop()

    # Check for existing active session
    existing = await loop.run_in_executor(None, sh.get_active_order_for_customer, current_user.id)
    if existing:
        raise HTTPException(status_code=409, detail="You already have an active rental session")

    lo, hi = await loop.run_in_executor(None, sh.get_limits)
    if req.hours < lo or req.hours > hi:
        raise HTTPException(status_code=400, detail=f"Hours must be between {lo} and {hi}")

    pph, currency = await loop.run_in_executor(None, sh.get_price_currency)
    original_cost = pph * req.hours
    discount = 0
    promo_code = req.promo_code or ""

    if promo_code:
        ok, new_cost, disc_str, reason = await loop.run_in_executor(
            None,
            lambda: sh.apply_promo(promo_code, original_cost, current_user.id),
        )
        if ok:
            discount = original_cost - new_cost
        else:
            raise HTTPException(status_code=400, detail=f"Promo code invalid: {reason}")

    final_cost = original_cost - discount

    # Re-fetch user balance (fresh from sheets)
    customer = await loop.run_in_executor(None, sh.get_customer_by_id, current_user.id)
    try:
        balance = int(str(customer.get("balance", "0") or "0").strip().lstrip("'"))
    except Exception:
        balance = 0

    if balance < final_cost:
        raise HTTPException(
            status_code=402,
            detail=f"Insufficient balance. Need {final_cost} {currency}, have {balance} {currency}",
        )

    # Find available account
    account = await loop.run_in_executor(None, sh.get_available_account, True)
    if not account:
        raise HTTPException(status_code=503, detail="No Steam accounts available right now. Try again shortly.")

    # Deduct balance
    new_balance = await loop.run_in_executor(
        None,
        lambda: sh.adjust_customer_balance(current_user.id, -final_cost),
    )
    if new_balance is None:
        raise HTTPException(status_code=500, detail="Failed to deduct balance")

    # Create order
    order = await loop.run_in_executor(
        None,
        lambda: sh.create_order(
            customer_id=current_user.id,
            account_id=account["id"],
            hours=req.hours,
            price=pph,
            discount=discount,
            amount=final_cost,
            last4="",
            currency=currency,
            promo_code=promo_code,
        ),
    )

    # Record transaction
    await loop.run_in_executor(
        None,
        lambda: sh.record_transaction(
            customer_id=current_user.id,
            ttype="rental",
            amount=-final_cost,
            session_id=order["id"],
            status="done",
            note=f"{req.hours}h rental",
        ),
    )

    # Mark promo as used
    if promo_code:
        await loop.run_in_executor(None, lambda: sh.mark_promo_used(promo_code, current_user.id))

    # Schedule expiry + warnings
    end_at_str = order.get("end_at", "")
    try:
        end_at = datetime.fromisoformat(end_at_str)
        if end_at.tzinfo is None:
            end_at = TZ.localize(end_at)
        schedule_session_jobs(
            order_id=order["id"],
            customer_id=current_user.id,
            ends_at=end_at,
            lang=customer.get("language", "ru"),
            chat_id=customer.get("tg_user_id") or customer.get("tg_chat_id"),
        )
    except Exception as e:
        log.warning("Failed to schedule jobs for order %s: %s", order["id"], e)

    # Fire-and-forget: notify user via Telegram
    chat_id = customer.get("tg_user_id") or customer.get("tg_chat_id")
    if chat_id:
        asyncio.create_task(
            bot_notify.notify_session_started(
                chat_id=chat_id,
                login=account.get("steam_login", ""),
                password=account.get("steam_password", ""),
                ends_at=end_at_str,
                lang=customer.get("language", "ru"),
            )
        )

    return _order_to_session(order, account)


@router.post("/{order_id}/extend", response_model=RentalSession)
async def extend_session(
    order_id: str,
    req: ExtendRequest,
    current_user: UserOut = Depends(get_current_user),
):
    loop = asyncio.get_event_loop()

    order = await loop.run_in_executor(None, sh.get_order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Session not found")
    if order.get("customer_id") != current_user.id:
        raise HTTPException(status_code=403, detail="Not your session")
    if order.get("status", "").lower() != "active":
        raise HTTPException(status_code=400, detail="Session is not active")

    lo, hi = await loop.run_in_executor(None, sh.get_limits)
    if req.hours < 1 or req.hours > hi:
        raise HTTPException(status_code=400, detail=f"Extension hours must be between 1 and {hi}")

    pph, currency = await loop.run_in_executor(None, sh.get_price_currency)
    original_cost = pph * req.hours
    discount = 0
    promo_code = req.promo_code or ""

    if promo_code:
        ok, new_cost, disc_str, reason = await loop.run_in_executor(
            None,
            lambda: sh.apply_promo(promo_code, original_cost, current_user.id),
        )
        if ok:
            discount = original_cost - new_cost
        else:
            raise HTTPException(status_code=400, detail=f"Promo code invalid: {reason}")

    final_cost = original_cost - discount

    # Re-fetch fresh balance
    customer = await loop.run_in_executor(None, sh.get_customer_by_id, current_user.id)
    try:
        balance = int(str(customer.get("balance", "0") or "0").strip().lstrip("'"))
    except Exception:
        balance = 0

    if balance < final_cost:
        raise HTTPException(
            status_code=402,
            detail=f"Insufficient balance. Need {final_cost} {currency}, have {balance} {currency}",
        )

    # Deduct balance
    await loop.run_in_executor(
        None,
        lambda: sh.adjust_customer_balance(current_user.id, -final_cost),
    )

    # Extend order
    updated_order = await loop.run_in_executor(
        None,
        lambda: sh.extend_order(order_id, req.hours),
    )
    if not updated_order:
        raise HTTPException(status_code=500, detail="Failed to extend session")

    # Record transaction
    await loop.run_in_executor(
        None,
        lambda: sh.record_transaction(
            customer_id=current_user.id,
            ttype="rental",
            amount=-final_cost,
            session_id=order_id,
            status="done",
            note=f"+{req.hours}h extension",
        ),
    )

    # Reschedule expiry jobs with new end time
    end_at_str = updated_order.get("end_at", "")
    cancel_session_jobs(order_id)
    try:
        end_at = datetime.fromisoformat(end_at_str)
        if end_at.tzinfo is None:
            end_at = TZ.localize(end_at)
        schedule_session_jobs(
            order_id=order_id,
            customer_id=current_user.id,
            ends_at=end_at,
            lang=customer.get("language", "ru"),
            chat_id=customer.get("tg_user_id") or customer.get("tg_chat_id"),
        )
    except Exception as e:
        log.warning("Failed to reschedule jobs for order %s: %s", order_id, e)

    # Notify
    chat_id = customer.get("tg_user_id") or customer.get("tg_chat_id")
    if chat_id:
        asyncio.create_task(
            bot_notify.notify_session_extended(
                chat_id=chat_id,
                ends_at=end_at_str,
                lang=customer.get("language", "ru"),
            )
        )

    return _order_to_session(updated_order)


@router.post("/{order_id}/end", response_model=dict)
async def end_session(
    order_id: str,
    current_user: UserOut = Depends(get_current_user),
):
    """End a session early (triggers force logout in background)."""
    loop = asyncio.get_event_loop()

    order = await loop.run_in_executor(None, sh.get_order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Session not found")
    if order.get("customer_id") != current_user.id:
        raise HTTPException(status_code=403, detail="Not your session")
    if order.get("status", "").lower() != "active":
        raise HTTPException(status_code=400, detail="Session is not active")

    # Cancel scheduled jobs
    cancel_session_jobs(order_id)

    # Mark order finished
    await loop.run_in_executor(
        None,
        lambda: sh.set_order_status(order_id, "finished"),
    )

    # Trigger force logout in background
    from ..services.steam import async_force_logout_for_order
    asyncio.create_task(async_force_logout_for_order(order_id))

    return {"status": "ended", "order_id": order_id}


@router.get("/history", response_model=List[RentalSession])
async def get_session_history(
    limit: int = 20,
    current_user: UserOut = Depends(get_current_user),
):
    loop = asyncio.get_event_loop()
    orders = await loop.run_in_executor(
        None,
        lambda: sh.list_orders_for_customer(current_user.id),
    )
    sessions = []
    for o in orders[:limit]:
        sessions.append(_order_to_session(o))
    return sessions
