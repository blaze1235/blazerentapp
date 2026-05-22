import asyncio
import logging
from datetime import datetime, timedelta
from typing import List

import pytz
from fastapi import APIRouter, Depends, HTTPException

from ..auth import get_admin_user
from ..models import (
    AdminClient,
    AdminDashboard,
    AdjustBalanceRequest,
    KickRequest,
    NotifyRequest,
    UserOut,
)
from ..services import sheets as sh

log = logging.getLogger("router.admin")
router = APIRouter(prefix="/admin", tags=["admin"])

TZ = pytz.timezone("Asia/Tashkent")


@router.get("/dashboard", response_model=AdminDashboard)
async def get_dashboard(admin: UserOut = Depends(get_admin_user)):
    loop = asyncio.get_event_loop()

    # Run all sheet queries concurrently
    customers_task = loop.run_in_executor(None, sh.list_all_customers)
    accounts_task = loop.run_in_executor(None, sh.list_all_accounts)
    orders_task = loop.run_in_executor(None, sh.list_all_orders)
    transactions_task = loop.run_in_executor(None, sh.list_all_transactions, 1000)
    price_task = loop.run_in_executor(None, sh.get_price_currency)

    customers, accounts, orders, transactions, (pph, currency) = await asyncio.gather(
        customers_task, accounts_task, orders_task, transactions_task, price_task
    )

    # Active sessions
    active_sessions = sum(1 for o in orders if o.get("status", "").lower() == "active")

    # Available accounts
    available_accounts = sum(
        1 for a in accounts if a.get("status", "").strip().lower() in ("available", "free")
    )

    # Revenue calculations
    today = datetime.now(TZ).date()
    month_start = today.replace(day=1)

    revenue_today = 0
    revenue_month = 0
    for tx in transactions:
        if tx.get("type") == "rental" and tx.get("status") == "done":
            try:
                amount = abs(int(str(tx.get("amount", "0") or "0").strip().lstrip("'")))
            except Exception:
                continue
            ts_str = tx.get("ts", "")
            try:
                ts = datetime.fromisoformat(ts_str)
                if ts.tzinfo is None:
                    ts = TZ.localize(ts)
                ts_date = ts.date()
                if ts_date == today:
                    revenue_today += amount
                if ts_date >= month_start:
                    revenue_month += amount
            except Exception:
                pass

    # Pending topups from transactions
    pending_topups = sum(
        1 for tx in transactions if tx.get("type") == "topup" and tx.get("status") == "pending"
    )

    return AdminDashboard(
        total_clients=len(customers),
        active_sessions=active_sessions,
        total_revenue_today=revenue_today,
        total_revenue_month=revenue_month,
        available_accounts=available_accounts,
        total_accounts=len(accounts),
        pending_topups=pending_topups,
        currency=currency,
    )


@router.get("/clients", response_model=List[AdminClient])
async def get_clients(admin: UserOut = Depends(get_admin_user)):
    loop = asyncio.get_event_loop()
    customers, orders = await asyncio.gather(
        loop.run_in_executor(None, sh.list_all_customers),
        loop.run_in_executor(None, sh.list_all_orders),
    )

    # Build session count + total spent per customer
    sessions_by_cust: dict = {}
    spent_by_cust: dict = {}
    last_active_by_cust: dict = {}
    for o in orders:
        cid = o.get("customer_id", "")
        if not cid:
            continue
        sessions_by_cust[cid] = sessions_by_cust.get(cid, 0) + 1
        try:
            amount = int(str(o.get("paid_amount", "0") or "0").strip().lstrip("'"))
            spent_by_cust[cid] = spent_by_cust.get(cid, 0) + amount
        except Exception:
            pass
        ts = o.get("created_at", "")
        if ts > last_active_by_cust.get(cid, ""):
            last_active_by_cust[cid] = ts

    result = []
    for c in customers:
        cid = c.get("id", "")
        try:
            balance = int(str(c.get("balance", "0") or "0").strip().lstrip("'"))
        except Exception:
            balance = 0
        try:
            total_spent = int(str(c.get("total_spent", "0") or "0").strip().lstrip("'"))
        except Exception:
            total_spent = spent_by_cust.get(cid, 0)

        tier = "bronze"
        if total_spent >= 500000:
            tier = "gold"
        elif total_spent >= 150000:
            tier = "silver"

        result.append(AdminClient(
            id=cid,
            name=c.get("name", ""),
            phone=c.get("phone", ""),
            balance=balance,
            sessions=sessions_by_cust.get(cid, 0),
            total_spent=total_spent,
            last_active=last_active_by_cust.get(cid) or c.get("created_at"),
            tg_chat_id=c.get("tg_user_id") or c.get("tg_chat_id") or None,
            tier=tier,
            language=c.get("language", "ru"),
        ))

    result.sort(key=lambda x: x.total_spent, reverse=True)
    return result


@router.get("/clients/{client_id}", response_model=AdminClient)
async def get_client(client_id: str, admin: UserOut = Depends(get_admin_user)):
    loop = asyncio.get_event_loop()
    customer = await loop.run_in_executor(None, sh.get_customer_by_id, client_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Client not found")

    orders = await loop.run_in_executor(None, lambda: sh.list_orders_for_customer(client_id))
    sessions_count = len(orders)
    total_spent = sum(
        int(str(o.get("paid_amount", "0") or "0").strip().lstrip("'"))
        for o in orders
        if o.get("status") not in ("cancelled",)
    )

    try:
        balance = int(str(customer.get("balance", "0") or "0").strip().lstrip("'"))
    except Exception:
        balance = 0

    tier = "bronze"
    if total_spent >= 500000:
        tier = "gold"
    elif total_spent >= 150000:
        tier = "silver"

    return AdminClient(
        id=client_id,
        name=customer.get("name", ""),
        phone=customer.get("phone", ""),
        balance=balance,
        sessions=sessions_count,
        total_spent=total_spent,
        last_active=orders[0].get("created_at") if orders else customer.get("created_at"),
        tg_chat_id=customer.get("tg_user_id") or customer.get("tg_chat_id") or None,
        tier=tier,
        language=customer.get("language", "ru"),
    )


@router.patch("/clients/{client_id}/balance")
async def adjust_balance(
    client_id: str,
    req: AdjustBalanceRequest,
    admin: UserOut = Depends(get_admin_user),
):
    loop = asyncio.get_event_loop()
    customer = await loop.run_in_executor(None, sh.get_customer_by_id, client_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Client not found")

    new_balance = await loop.run_in_executor(
        None,
        lambda: sh.adjust_customer_balance(client_id, req.delta),
    )
    if new_balance is None:
        raise HTTPException(status_code=500, detail="Failed to adjust balance")

    # Record transaction
    ttype = "topup" if req.delta > 0 else "adjustment"
    await loop.run_in_executor(
        None,
        lambda: sh.record_transaction(
            customer_id=client_id,
            ttype=ttype,
            amount=req.delta,
            status="done",
            note=f"Admin adjustment: {req.reason or 'manual'}",
        ),
    )

    return {"client_id": client_id, "delta": req.delta, "new_balance": new_balance}


@router.get("/finance")
async def get_finance(period: str = "7d", admin: UserOut = Depends(get_admin_user)):
    """Return daily revenue breakdown from ORDERS (all history) + TRANSACTIONS (topups)."""
    loop = asyncio.get_event_loop()

    orders_task = loop.run_in_executor(None, sh.list_all_orders)
    transactions_task = loop.run_in_executor(None, sh.list_all_transactions, 2000)
    price_task = loop.run_in_executor(None, sh.get_price_currency)
    orders, transactions, (_, currency) = await asyncio.gather(orders_task, transactions_task, price_task)

    days = {"1d": 1, "7d": 7, "30d": 30, "90d": 90}.get(period, 7)
    now = datetime.now(TZ)
    cutoff = now - timedelta(days=days)

    daily: dict = {}

    # Revenue + session count from ORDERS (covers all historical bot sessions)
    for o in orders:
        status = o.get("status", "").lower()
        if status not in ("finished", "active", "done", "completed"):
            continue
        ts_str = o.get("paid_at") or o.get("created_at", "")
        try:
            ts = datetime.fromisoformat(ts_str)
            if ts.tzinfo is None:
                ts = TZ.localize(ts)
        except Exception:
            continue
        if ts < cutoff:
            continue
        date_key = ts.date().isoformat()
        if date_key not in daily:
            daily[date_key] = {"date": date_key, "revenue": 0, "sessions": 0, "topups": 0}
        try:
            amount = int(str(o.get("paid_amount", "0") or "0").strip().lstrip("'"))
        except Exception:
            amount = 0
        daily[date_key]["revenue"] += amount
        daily[date_key]["sessions"] += 1

    # Top-up count from TRANSACTIONS
    for tx in transactions:
        if tx.get("type") != "topup" or tx.get("status") != "done":
            continue
        ts_str = tx.get("ts", "")
        try:
            ts = datetime.fromisoformat(ts_str)
            if ts.tzinfo is None:
                ts = TZ.localize(ts)
        except Exception:
            continue
        if ts < cutoff:
            continue
        date_key = ts.date().isoformat()
        if date_key not in daily:
            daily[date_key] = {"date": date_key, "revenue": 0, "sessions": 0, "topups": 0}
        daily[date_key]["topups"] += 1

    result = [
        daily.get(
            (now - timedelta(days=days - 1 - i)).date().isoformat(),
            {"date": (now - timedelta(days=days - 1 - i)).date().isoformat(), "revenue": 0, "sessions": 0, "topups": 0},
        )
        for i in range(days)
    ]

    total_revenue = sum(r["revenue"] for r in result)
    total_sessions = sum(r["sessions"] for r in result)
    total_topups = sum(r["topups"] for r in result)

    return {
        "period": period,
        "currency": currency,
        "total_revenue": total_revenue,
        "total_sessions": total_sessions,
        "total_topups": total_topups,
        "data": result,
    }


@router.get("/stats")
async def get_stats(admin: UserOut = Depends(get_admin_user)):
    """Return aggregated stats for analytics page."""
    loop = asyncio.get_event_loop()
    customers, orders, accounts = await asyncio.gather(
        loop.run_in_executor(None, sh.list_all_customers),
        loop.run_in_executor(None, sh.list_all_orders),
        loop.run_in_executor(None, sh.list_all_accounts),
    )

    # Revenue by day (last 7 days) — from ORDERS so historical bot sessions are included
    now = datetime.now(TZ)
    rev_7d = []
    for i in range(7):
        d = (now - timedelta(days=6 - i)).date()
        day_revenue = 0
        for o in orders:
            if o.get("status", "").lower() not in ("finished", "active", "done", "completed"):
                continue
            ts_str = o.get("paid_at") or o.get("created_at", "")
            try:
                ts = datetime.fromisoformat(ts_str)
                if ts.tzinfo is None:
                    ts = TZ.localize(ts)
                if ts.date() == d:
                    day_revenue += int(str(o.get("paid_amount", "0") or "0").strip().lstrip("'"))
            except Exception:
                pass
        rev_7d.append({"date": d.isoformat(), "revenue": day_revenue})

    # Top clients by spending
    spent_by_cust: dict = {}
    name_by_cust: dict = {}
    for c in customers:
        cid = c.get("id", "")
        name_by_cust[cid] = c.get("name", "")
        try:
            spent_by_cust[cid] = int(str(c.get("total_spent", "0") or "0").strip().lstrip("'"))
        except Exception:
            spent_by_cust[cid] = 0

    top_clients = sorted(
        [{"id": k, "name": name_by_cust.get(k, ""), "total_spent": v} for k, v in spent_by_cust.items()],
        key=lambda x: x["total_spent"],
        reverse=True,
    )[:10]

    # Sessions by hour of day
    sessions_by_hour = [0] * 24
    for o in orders:
        ts_str = o.get("created_at", "")
        try:
            ts = datetime.fromisoformat(ts_str)
            if ts.tzinfo is None:
                ts = TZ.localize(ts)
            sessions_by_hour[ts.hour] += 1
        except Exception:
            pass

    # Account utilization
    acc_util = []
    for a in accounts:
        try:
            total_sum = int(str(a.get("total_orders_sum", "0") or "0").strip().lstrip("'"))
        except Exception:
            total_sum = 0
        acc_util.append({
            "id": a.get("id", ""),
            "login": a.get("steam_login", ""),
            "status": a.get("status", ""),
            "total_revenue": total_sum,
        })

    return {
        "revenue_7d": rev_7d,
        "top_clients": top_clients,
        "sessions_by_hour": [{"hour": i, "count": c} for i, c in enumerate(sessions_by_hour)],
        "account_utilization": sorted(acc_util, key=lambda x: x["total_revenue"], reverse=True),
    }


@router.post("/sessions/{session_id}/kick")
async def kick_session(
    session_id: str,
    req: KickRequest,
    admin: UserOut = Depends(get_admin_user),
):
    """Force-kick an active session."""
    loop = asyncio.get_event_loop()

    order = await loop.run_in_executor(None, sh.get_order, session_id)
    if not order:
        raise HTTPException(status_code=404, detail="Session not found")
    if order.get("status", "").lower() != "active":
        raise HTTPException(status_code=400, detail="Session is not active")

    # Cancel scheduled jobs
    from ..services.scheduler import cancel_session_jobs
    cancel_session_jobs(session_id)

    # Mark finished
    await loop.run_in_executor(
        None,
        lambda: sh.set_order_status(session_id, "finished"),
    )

    # Trigger force logout in background
    from ..services.steam import async_force_logout_for_order
    asyncio.create_task(async_force_logout_for_order(session_id))

    # Notify user
    customer = await loop.run_in_executor(
        None, sh.get_customer_by_id, order.get("customer_id", "")
    )
    if customer:
        chat_id = customer.get("tg_user_id") or customer.get("tg_chat_id")
        if chat_id:
            from ..services.bot_notify import notify_session_expired
            asyncio.create_task(
                notify_session_expired(chat_id, lang=customer.get("language", "ru"))
            )

    return {"status": "kicked", "session_id": session_id}


@router.post("/notify/{client_id}")
async def notify_client(
    client_id: str,
    req: NotifyRequest,
    admin: UserOut = Depends(get_admin_user),
):
    """Send a custom Telegram message to a client."""
    loop = asyncio.get_event_loop()
    customer = await loop.run_in_executor(None, sh.get_customer_by_id, client_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Client not found")

    chat_id = customer.get("tg_user_id") or customer.get("tg_chat_id")
    if not chat_id:
        raise HTTPException(status_code=400, detail="Client has no linked Telegram account")

    from ..services.bot_notify import notify_custom
    sent = await notify_custom(chat_id, req.message)
    if not sent:
        raise HTTPException(status_code=502, detail="Failed to send Telegram message")

    return {"status": "sent", "client_id": client_id}


@router.get("/topups/pending")
async def get_pending_topups(admin: UserOut = Depends(get_admin_user)):
    """Return all in-flight topups (pending + recently confirmed)."""
    from .wallet import _pending_topups
    import time as _time

    loop = asyncio.get_event_loop()
    customers = await loop.run_in_executor(None, sh.list_all_customers)
    name_map = {c["id"]: c.get("name") or c.get("phone") or c["id"] for c in customers}

    result = []
    for t in _pending_topups.values():
        # Check expiry
        status = t["status"]
        if status == "pending" and (_time.time() - t["created_at"]) > 15 * 60:
            status = "expired"

        result.append({
            "topup_id": t["topup_id"],
            "customer_id": t["customer_id"],
            "customer_name": name_map.get(t["customer_id"], t["customer_id"]),
            "amount": t["amount"],
            "card_last4": t.get("card_last4") or None,
            "card_bank": t.get("card_bank") or None,
            "card_label": t.get("card_label") or None,
            "pay_to": t.get("pay_to") or None,
            "status": status,
            "created_at": datetime.fromtimestamp(t["created_at"], tz=TZ).isoformat(),
            "confirmed_at": (
                datetime.fromtimestamp(t["confirmed_at"], tz=TZ).isoformat()
                if t.get("confirmed_at") else None
            ),
        })

    # Newest first
    result.sort(key=lambda x: x["created_at"], reverse=True)
    return result


@router.post("/topups/{topup_id}/confirm")
async def admin_confirm_topup(
    topup_id: str,
    admin: UserOut = Depends(get_admin_user),
):
    """Manually confirm a pending topup (e.g., when auto-detection failed)."""
    from .wallet import _pending_topups, _confirm_topup

    topup = _pending_topups.get(topup_id)
    if not topup:
        raise HTTPException(status_code=404, detail="Topup not found")
    if topup["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Topup is already {topup['status']}")

    await _confirm_topup(topup_id, topup["amount"])
    return {"status": "confirmed", "topup_id": topup_id, "amount": topup["amount"]}


@router.get("/sessions/active")
async def get_active_sessions(admin: UserOut = Depends(get_admin_user)):
    """Return all currently active rental sessions with customer details."""
    loop = asyncio.get_event_loop()
    orders, customers, accounts = await asyncio.gather(
        loop.run_in_executor(None, sh.list_all_orders),
        loop.run_in_executor(None, sh.list_all_customers),
        loop.run_in_executor(None, sh.list_all_accounts),
    )

    name_map = {c["id"]: c.get("name") or c.get("phone") or c["id"] for c in customers}
    phone_map = {c["id"]: c.get("phone", "") for c in customers}
    balance_map = {}
    for c in customers:
        try:
            balance_map[c["id"]] = int(str(c.get("balance", "0") or "0").strip().lstrip("'"))
        except Exception:
            balance_map[c["id"]] = 0

    account_login_map = {
        a.get("id", ""): a.get("steam_login", a.get("login", "")) for a in accounts
    }

    result = []
    now = datetime.now(TZ)
    for o in orders:
        if o.get("status", "").lower() != "active":
            continue
        cid = o.get("customer_id", "")
        ends_at_str = o.get("end_at") or o.get("ends_at", "")
        try:
            ends_at = datetime.fromisoformat(ends_at_str)
            if ends_at.tzinfo is None:
                ends_at = TZ.localize(ends_at)
            minutes_left = int((ends_at - now).total_seconds() / 60)
        except Exception:
            ends_at = None
            minutes_left = 0

        start_str = o.get("start_at") or o.get("started_at") or o.get("created_at", "")
        result.append({
            "session_id": o.get("id", ""),
            "customer_id": cid,
            "customer_name": name_map.get(cid, cid),
            "customer_phone": phone_map.get(cid, ""),
            "balance": balance_map.get(cid, 0),
            "account_id": o.get("account_id", ""),
            "account_login": account_login_map.get(o.get("account_id", ""), o.get("account_id", "")),
            "hours_total": o.get("hours", 0),
            "started_at": start_str,
            "ends_at": ends_at.isoformat() if ends_at else ends_at_str,
            "minutes_left": max(0, minutes_left),
        })

    result.sort(key=lambda x: x["ends_at"])
    return result


@router.get("/orders")
async def get_orders(limit: int = 50, admin: UserOut = Depends(get_admin_user)):
    """Return recent orders with customer names resolved."""
    loop = asyncio.get_event_loop()
    orders, customers = await asyncio.gather(
        loop.run_in_executor(None, sh.list_all_orders),
        loop.run_in_executor(None, sh.list_all_customers),
    )

    name_map = {c["id"]: c.get("name") or c.get("phone") or c["id"] for c in customers}

    result = []
    for o in orders[:limit]:
        result.append({
            "id": o.get("id"),
            "customer_id": name_map.get(o.get("customer_id", ""), o.get("customer_id", "—")),
            "account_id": o.get("account_id"),
            "status": o.get("status"),
            "hours": o.get("hours"),
            "paid_amount": o.get("paid_amount"),
            "created_at": o.get("created_at"),
            "paid_at": o.get("paid_at"),
            "start_at": o.get("start_at"),
            "end_at": o.get("end_at"),
        })
    return result


@router.get("/inventory")
async def get_inventory(admin: UserOut = Depends(get_admin_user)):
    """Return all Steam accounts with enriched stats."""
    loop = asyncio.get_event_loop()
    accounts, orders = await asyncio.gather(
        loop.run_in_executor(None, sh.list_all_accounts),
        loop.run_in_executor(None, sh.list_all_orders),
    )

    # Build per-account stats from orders
    session_counts: dict = {}
    revenue_map: dict = {}
    last_rented_map: dict = {}
    for o in orders:
        aid = o.get("account_id", "")
        if not aid:
            continue
        if o.get("status") in ("completed", "active"):
            session_counts[aid] = session_counts.get(aid, 0) + 1
            revenue_map[aid] = revenue_map.get(aid, 0) + float(o.get("paid_amount") or 0)
            ts = o.get("start_at") or o.get("created_at") or ""
            if ts and (not last_rented_map.get(aid) or ts > last_rented_map[aid]):
                last_rented_map[aid] = ts

    result = []
    for a in accounts:
        aid = a.get("id", "")
        login = a.get("steam_login") or a.get("login", "")
        status = a.get("status", "available").strip().lower()
        total_sessions = session_counts.get(aid, 0)
        # Simple health heuristic: starts at 100, minus 2 per session, min 10
        health_pct = max(10, 100 - total_sessions * 2)
        result.append({
            "id": aid,
            "login": login,
            "prime": True,  # default — add a "prime" column to sheet if needed
            "status": status if status in ("available", "rented", "cooldown", "blocked") else "available",
            "total_sessions": total_sessions,
            "revenue": revenue_map.get(aid, 0),
            "health_pct": health_pct,
            "last_rented": last_rented_map.get(aid),
            "note": a.get("note", ""),
        })

    result.sort(key=lambda x: (x["status"] != "rented", x["status"] != "available", x["login"]))
    return result


@router.patch("/inventory/{account_id}/status")
async def update_account_status(
    account_id: str,
    body: dict,
    admin: UserOut = Depends(get_admin_user),
):
    """Set an account's status (available / cooldown / blocked)."""
    new_status = body.get("status", "").lower()
    if new_status not in ("available", "cooldown", "blocked"):
        from fastapi import HTTPException
        raise HTTPException(400, "status must be available, cooldown, or blocked")

    loop = asyncio.get_event_loop()
    ok = await loop.run_in_executor(None, lambda: sh.set_account_status(account_id, new_status))
    if not ok:
        from fastapi import HTTPException
        raise HTTPException(404, "account not found in sheet")
    return {"ok": True}
