from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime


# ---- Auth ----

class LoginRequest(BaseModel):
    phone: str
    password: str


class RegisterRequest(BaseModel):
    name: str
    phone: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"


# ---- User ----

class UserOut(BaseModel):
    id: str
    name: str
    phone: str
    balance: int
    tier: Literal["bronze", "silver", "gold"] = "bronze"
    tg_chat_id: Optional[str] = None
    language: Literal["en", "uz", "ru"] = "ru"
    is_admin: bool = False
    created_at: Optional[str] = None


# ---- Session ----

class RentalSession(BaseModel):
    id: str
    account_login: str
    account_password: str
    started_at: str
    ends_at: str
    hours_total: int
    cost: int
    status: Literal["active", "completed", "expired", "pending"]


class RentRequest(BaseModel):
    hours: int
    promo_code: Optional[str] = None


class ExtendRequest(BaseModel):
    hours: int
    promo_code: Optional[str] = None


class RentQuote(BaseModel):
    hours: int
    price_per_hour: int
    original_cost: int
    discount: int
    final_cost: int
    currency: str
    promo_applied: bool
    promo_discount_str: str
    balance_after: int
    can_afford: bool


# ---- Wallet ----

class Transaction(BaseModel):
    id: str
    type: Literal["topup", "rental", "refund", "adjustment"]
    amount: int
    card: Optional[str] = None
    session_id: Optional[str] = None
    ts: str
    status: Literal["pending", "done", "failed"]
    note: Optional[str] = None


class TopupInitRequest(BaseModel):
    amount: int
    card_last4: Optional[str] = None


class TopupInitResponse(BaseModel):
    topup_id: str
    amount: int
    card_last4: Optional[str] = None
    card_bank: Optional[str] = None
    card_label: Optional[str] = None
    card_info: Optional[str] = None
    pay_to: Optional[str] = None
    expires_in_minutes: int


class TopupStatusResponse(BaseModel):
    topup_id: str
    status: Literal["pending", "confirmed", "expired", "failed"]
    amount: int
    pay_to: Optional[str] = None
    card_last4: Optional[str] = None
    card_bank: Optional[str] = None
    card_label: Optional[str] = None
    confirmed_at: Optional[str] = None


# ---- Steam Account ----

class SteamAccount(BaseModel):
    id: str
    login: str
    status: Literal["free", "in_use", "cooldown", "blocked", "available", "reserved"]
    health: int = 100
    total_uses: int = 0
    avg_hours: float = 0.0


# ---- Admin ----

class AdminClient(BaseModel):
    id: str
    name: str
    phone: str
    balance: int
    sessions: int
    total_spent: int
    last_active: Optional[str] = None
    tg_chat_id: Optional[str] = None
    tier: str = "bronze"
    language: str = "ru"


class AdjustBalanceRequest(BaseModel):
    delta: int
    reason: Optional[str] = None


class AdminDashboard(BaseModel):
    total_clients: int
    active_sessions: int
    total_revenue_today: int
    total_revenue_month: int
    available_accounts: int
    total_accounts: int
    pending_topups: int
    currency: str


class AdminFinanceEntry(BaseModel):
    date: str
    revenue: int
    sessions: int
    topups: int


class AdminStats(BaseModel):
    revenue_7d: list
    top_clients: list
    sessions_by_hour: list
    account_utilization: list


class KickRequest(BaseModel):
    reason: Optional[str] = "admin_kick"


class NotifyRequest(BaseModel):
    message: str
