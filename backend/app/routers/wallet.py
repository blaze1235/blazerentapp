import asyncio
import logging
import time
import uuid
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect

from ..auth import get_current_user
from ..models import (
    TopupInitRequest,
    TopupInitResponse,
    TopupStatusResponse,
    Transaction,
    UserOut,
)
from ..services import sheets as sh

log = logging.getLogger("router.wallet")
router = APIRouter(prefix="/wallet", tags=["wallet"])

# In-memory topup tracking (in production, persist to sheets or Redis)
_pending_topups: Dict[str, dict] = {}
# Active WebSocket connections per topup_id
_ws_connections: Dict[str, List[WebSocket]] = {}


@router.get("/balance")
async def get_balance(current_user: UserOut = Depends(get_current_user)):
    loop = asyncio.get_event_loop()
    customer = await loop.run_in_executor(None, sh.get_customer_by_id, current_user.id)
    if not customer:
        raise HTTPException(status_code=404, detail="User not found")
    try:
        balance = int(str(customer.get("balance", "0") or "0").strip().lstrip("'"))
    except Exception:
        balance = 0
    _, currency = await loop.run_in_executor(None, sh.get_price_currency)
    return {"balance": balance, "currency": currency}


@router.get("/transactions", response_model=List[Transaction])
async def get_transactions(
    limit: int = 50,
    current_user: UserOut = Depends(get_current_user),
):
    loop = asyncio.get_event_loop()
    txs = await loop.run_in_executor(
        None,
        lambda: sh.list_transactions_for_customer(current_user.id, limit=limit),
    )
    result = []
    for tx in txs:
        try:
            amount = int(str(tx.get("amount", "0") or "0").strip().lstrip("'"))
        except Exception:
            amount = 0
        result.append(
            Transaction(
                id=tx.get("id", ""),
                type=tx.get("type", "topup"),
                amount=amount,
                card=tx.get("card_last4") or None,
                session_id=tx.get("session_id") or None,
                ts=tx.get("ts", ""),
                status=tx.get("status", "done"),
                note=tx.get("note") or None,
            )
        )
    return result


@router.post("/topup/initiate", response_model=TopupInitResponse)
async def initiate_topup(
    req: TopupInitRequest,
    current_user: UserOut = Depends(get_current_user),
):
    """
    Create a pending top-up. Registers a Telethon payment watcher.
    Returns payment instructions for the user.
    """
    loop = asyncio.get_event_loop()
    _, currency = await loop.run_in_executor(None, sh.get_price_currency)

    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    topup_id = f"topup_{uuid.uuid4().hex[:12]}"
    card_last4 = (req.card_last4 or "").strip()

    # Get active card details from CARDS sheet
    card = await loop.run_in_executor(None, sh.get_active_card)
    card_info = None
    pay_to = None
    card_last4_from_sheet = ""
    card_bank = ""
    card_label = ""
    if card:
        pay_to = card.get("pay_to_text", "")
        card_last4_from_sheet = card.get("last4", "")
        card_label = card.get("label", "")
        card_bank = card.get("bank", "")
        card_info = f"{card_label} ({card_bank}) *{card_last4_from_sheet}" if card_last4_from_sheet else card_label
        # Use the card's last4 for payment matching
        if not card_last4:
            card_last4 = card_last4_from_sheet

    # Store pending topup (including card details for status endpoint)
    _pending_topups[topup_id] = {
        "topup_id": topup_id,
        "customer_id": current_user.id,
        "amount": req.amount,
        "card_last4": card_last4,
        "card_bank": card_bank,
        "card_label": card_label,
        "pay_to": pay_to,
        "status": "pending",
        "created_at": time.time(),
        "confirmed_at": None,
        "currency": currency,
        "chat_id": None,
    }

    # Fetch customer for tg_chat_id
    customer = await loop.run_in_executor(None, sh.get_customer_by_id, current_user.id)
    if customer:
        _pending_topups[topup_id]["chat_id"] = customer.get("tg_user_id") or customer.get("tg_chat_id")
        _pending_topups[topup_id]["lang"] = customer.get("language", "ru")

    # Register payment watcher
    from ..services.payments import watch_for

    async def _on_payment(payment: dict):
        log.info("Payment watcher triggered for topup %s: %s", topup_id, payment)
        await _confirm_topup(topup_id, payment.get("amount", req.amount))

    watch_for(
        amount=req.amount,
        last4=card_last4,
        cb=_on_payment,
        tol=int(req.amount * 0.01),  # 1% tolerance
    )

    # Record pending transaction
    await loop.run_in_executor(
        None,
        lambda: sh.record_transaction(
            customer_id=current_user.id,
            ttype="topup",
            amount=req.amount,
            card_last4=card_last4,
            session_id=topup_id,
            status="pending",
            note="Initiated topup",
        ),
    )

    timeout_min = int(sh.get_setting("payment_timeout_min", "15") or "15")

    return TopupInitResponse(
        topup_id=topup_id,
        amount=req.amount,
        card_last4=card_last4 or None,
        card_bank=card_bank or None,
        card_label=card_label or None,
        card_info=card_info or None,
        pay_to=pay_to or None,
        expires_in_minutes=timeout_min,
    )


async def _confirm_topup(topup_id: str, amount: int):
    """Called when payment is detected. Credits user balance."""
    topup = _pending_topups.get(topup_id)
    if not topup or topup["status"] != "pending":
        return

    topup["status"] = "confirmed"
    import time as _time
    topup["confirmed_at"] = _time.time()

    customer_id = topup["customer_id"]
    loop = asyncio.get_event_loop()

    # Credit balance
    new_balance = await loop.run_in_executor(
        None,
        lambda: sh.adjust_customer_balance(customer_id, amount),
    )

    # Update transaction status
    await loop.run_in_executor(
        None,
        lambda: sh.record_transaction(
            customer_id=customer_id,
            ttype="topup",
            amount=amount,
            session_id=topup_id,
            status="done",
            note="Payment confirmed",
        ),
    )

    # Notify user via Telegram
    chat_id = topup.get("chat_id")
    lang = topup.get("lang", "ru")
    if chat_id:
        from ..services.bot_notify import notify_topup_confirmed
        _, currency = await loop.run_in_executor(None, sh.get_price_currency)
        asyncio.create_task(notify_topup_confirmed(chat_id, amount, currency, lang))

    # Notify via WebSocket
    if topup_id in _ws_connections:
        for ws in list(_ws_connections[topup_id]):
            try:
                await ws.send_json({"status": "confirmed", "amount": amount, "balance": new_balance})
            except Exception:
                pass

    log.info("Topup %s confirmed: +%d for customer %s", topup_id, amount, customer_id)


@router.get("/topup/{topup_id}/status", response_model=TopupStatusResponse)
async def check_topup_status(
    topup_id: str,
    current_user: UserOut = Depends(get_current_user),
):
    topup = _pending_topups.get(topup_id)
    if not topup:
        raise HTTPException(status_code=404, detail="Topup not found")
    if topup["customer_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Not your topup")

    # Check expiry (15 min default)
    import time as _time
    timeout = 15 * 60
    if topup["status"] == "pending" and (_time.time() - topup["created_at"]) > timeout:
        topup["status"] = "expired"

    confirmed_at = None
    if topup.get("confirmed_at"):
        from datetime import datetime, timezone
        confirmed_at = datetime.fromtimestamp(topup["confirmed_at"], tz=timezone.utc).isoformat()

    return TopupStatusResponse(
        topup_id=topup_id,
        status=topup["status"],
        amount=topup["amount"],
        pay_to=topup.get("pay_to"),
        card_last4=topup.get("card_last4") or None,
        card_bank=topup.get("card_bank") or None,
        card_label=topup.get("card_label") or None,
        confirmed_at=confirmed_at,
    )


@router.websocket("/ws/topup/{topup_id}")
async def topup_websocket(websocket: WebSocket, topup_id: str):
    """Real-time WebSocket for payment confirmation."""
    await websocket.accept()
    if topup_id not in _ws_connections:
        _ws_connections[topup_id] = []
    _ws_connections[topup_id].append(websocket)

    try:
        # Send current status immediately
        topup = _pending_topups.get(topup_id)
        if topup:
            await websocket.send_json({"status": topup["status"], "amount": topup["amount"]})

        # Keep alive and wait for events
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30)
                if data == "ping":
                    await websocket.send_text("pong")
            except asyncio.TimeoutError:
                # Send heartbeat
                try:
                    await websocket.send_json({"type": "heartbeat"})
                except Exception:
                    break
    except WebSocketDisconnect:
        pass
    finally:
        if topup_id in _ws_connections:
            try:
                _ws_connections[topup_id].remove(websocket)
            except ValueError:
                pass
