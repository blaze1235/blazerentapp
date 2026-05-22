"""
Google Sheets service layer — adapted from /tmp/steam-rent-bot/steam-rent-bot-main/app/sheets.py
for the BlazeRent web API. All blocking I/O; wrap calls in asyncio.run_in_executor where needed.
"""
import os, json, base64, time, re, logging
from typing import Optional, Dict, List, Tuple
from datetime import datetime, timedelta, timezone
import pytz
import gspread
from gspread.utils import rowcol_to_a1

log = logging.getLogger("sheets")

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]
GSHEET_ID = os.getenv("GOOGLE_SHEETS_ID", os.getenv("GSHEET_ID", ""))

# Sheet names
SHEET_SETTINGS = os.getenv("SHEET_SETTINGS", "SETTINGS")
SHEET_CUSTOMERS = os.getenv("SHEET_CUSTOMERS", "CUSTOMERS")
SHEET_ACCOUNTS = os.getenv("SHEET_ACCOUNTS", "ACCOUNTS")
SHEET_ORDERS = os.getenv("SHEET_ORDERS", "ORDERS")
SHEET_PROMOS = os.getenv("SHEET_PROMOS", "PROMOS")
SHEET_CARDS = os.getenv("SHEET_CARDS", "CARDS")
SHEET_KICKLOG = os.getenv("SHEET_KICKLOG", "KICK_LOG")
SHEET_TRANSACTIONS = os.getenv("SHEET_TRANSACTIONS", "TRANSACTIONS")

# Extended headers to match the web API's data model
CUSTOMERS_HEAD = [
    "id", "tg_user_id", "phone", "name", "password", "created_at",
    "balance", "total_spent", "language", "is_admin",
]
ACCOUNTS_HEAD = [
    "id", "steam_login", "steam_password", "email",
    "imap_host", "imap_port", "imap_user", "imap_pass",
    "status", "price1h", "last_order_id", "note",
    "total_orders_sum", "first_order_date",
]
ORDERS_HEAD = [
    "id", "customer_id", "account_id", "status",
    "hours", "price", "discount", "paid_amount",
    "last4", "currency", "created_at", "paid_at",
    "start_at", "end_at", "steam_code", "promo_code",
]
TRANSACTIONS_HEAD = [
    "id", "customer_id", "type", "amount", "card_last4",
    "session_id", "ts", "status", "note",
]
PROMOS_HEAD = ["code", "type", "value", "max_uses", "used_count", "max_uses_per_user", "expires_at", "note"]
SETTINGS_HEAD = ["key", "value"]
CARDS_HEAD = [
    "id", "label", "bank", "pay_to_text", "last4",
    "enabled", "status", "hold_until", "assigned_order_id", "updated_at", "note",
]
KICK_LOG_HEAD = [
    "ts", "order_id", "account_id", "steam_login",
    "result", "reason_code", "reason_detail", "artifacts",
]

# Caches
_SETTINGS_CACHE: Dict = {"ts": 0.0, "data": {}}
_ACCOUNTS_CACHE: Dict = {"ts": 0.0, "data": []}
_SETTINGS_TTL = 60
_ACCOUNTS_TTL = 60


def _load_credentials_dict() -> dict:
    b64 = (os.getenv("GOOGLE_SERVICE_ACCOUNT_BASE64", "") or "").strip().strip('"').strip("'")
    if b64:
        return json.loads(base64.b64decode(b64).decode("utf-8"))
    js = (os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON", "") or "").strip()
    if js:
        return json.loads(js)
    path = (
        os.getenv("GOOGLE_CREDENTIALS_PATH", "")
        or os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "")
    ).strip()
    if not path:
        raise RuntimeError(
            "Service account not configured: set GOOGLE_SERVICE_ACCOUNT_BASE64 or GOOGLE_CREDENTIALS_PATH"
        )
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _gc():
    return gspread.service_account_from_dict(_load_credentials_dict())


def _open():
    if not GSHEET_ID:
        raise RuntimeError("GOOGLE_SHEETS_ID env var is required")
    return _gc().open_by_key(GSHEET_ID)


def _ws(name: str, header: List[str]):
    sh = _open()
    try:
        ws = sh.worksheet(name)
    except gspread.WorksheetNotFound:
        ws = sh.add_worksheet(title=name, rows=1000, cols=max(30, len(header)))
        ws.append_row(header)
    first = ws.get_values("1:1")
    cur = first[0] if first else []
    if cur != header:
        # Expand columns if needed, don't overwrite extra columns
        ws.update(f"A1:{rowcol_to_a1(1, len(header))}", [header])
    return ws


# ---- TZ ----
TZ = pytz.timezone(os.getenv("TIMEZONE", "Asia/Tashkent"))


def now_iso() -> str:
    return datetime.now(TZ).isoformat()


# ---- SETTINGS ----

def get_setting(key: str, default: str = "") -> str:
    now = time.time()
    if now - _SETTINGS_CACHE["ts"] > _SETTINGS_TTL or not _SETTINGS_CACHE["data"]:
        try:
            ws = _ws(SHEET_SETTINGS, SETTINGS_HEAD)
            rows = ws.get_all_records()
            store = {}
            for r in rows:
                k = str(r.get("key") or "").strip().lower()
                if k:
                    store[k] = str(r.get("value") or "").strip()
            _SETTINGS_CACHE["data"] = store
            _SETTINGS_CACHE["ts"] = now
        except Exception as e:
            log.warning("Failed to load settings: %s", e)
            return default
    return _SETTINGS_CACHE["data"].get(key.lower(), default)


def get_price_currency() -> Tuple[int, str]:
    try:
        p = int(get_setting("price_per_hour", os.getenv("PAYMENT_RATE_PER_HOUR", "5000")))
    except Exception:
        p = 5000
    c = get_setting("currency", os.getenv("CURRENCY", "UZS"))
    return p, c


def get_limits() -> Tuple[int, int]:
    def _i(x, d):
        try:
            return int(x)
        except Exception:
            return d
    lo = _i(get_setting("min_rent_hours", os.getenv("MIN_RENT_HOURS", "1")), 1)
    hi = _i(get_setting("max_rent_hours", os.getenv("MAX_RENT_HOURS", "24")), 24)
    return lo, hi


# ---- CUSTOMERS ----

def _row_to_customer(r: list) -> dict:
    row = (r + [""] * len(CUSTOMERS_HEAD))[: len(CUSTOMERS_HEAD)]
    return dict(zip(CUSTOMERS_HEAD, row))


def find_customer_by_phone(phone: str) -> Optional[dict]:
    ws = _ws(SHEET_CUSTOMERS, CUSTOMERS_HEAD)
    for r in ws.get_all_values()[1:]:
        d = _row_to_customer(r)
        if d["phone"].strip() == str(phone).strip():
            return d
    return None


def find_customer_by_tg(tg_user_id) -> Optional[dict]:
    ws = _ws(SHEET_CUSTOMERS, CUSTOMERS_HEAD)
    for r in ws.get_all_values()[1:]:
        d = _row_to_customer(r)
        if d["tg_user_id"].strip() == str(tg_user_id):
            return d
    return None


def get_customer_by_id(customer_id: str) -> Optional[dict]:
    ws = _ws(SHEET_CUSTOMERS, CUSTOMERS_HEAD)
    for r in ws.get_all_values()[1:]:
        d = _row_to_customer(r)
        if d["id"].strip() == str(customer_id).strip():
            return d
    return None


def create_customer(tg_user_id, phone: str, name: str, password_hash: str, language: str = "ru") -> dict:
    ws = _ws(SHEET_CUSTOMERS, CUSTOMERS_HEAD)
    cid = f"cust_{int(time.time()*1000)}"
    row = [""] * len(CUSTOMERS_HEAD)
    row[0] = cid
    row[1] = str(tg_user_id or "")
    row[2] = phone
    row[3] = name
    row[4] = password_hash
    row[5] = now_iso()
    row[6] = "0"       # balance
    row[7] = "0"       # total_spent
    row[8] = language  # language
    row[9] = ""        # is_admin
    ws.append_row(row)
    return dict(zip(CUSTOMERS_HEAD, row))


def update_customer_balance(customer_id: str, new_balance: int) -> bool:
    ws = _ws(SHEET_CUSTOMERS, CUSTOMERS_HEAD)
    vals = ws.get_all_values()
    for rid, r in enumerate(vals[1:], start=2):
        row = (r + [""] * len(CUSTOMERS_HEAD))[: len(CUSTOMERS_HEAD)]
        if row[0].strip() == str(customer_id).strip():
            row[6] = str(new_balance)
            ws.update(f"A{rid}:{rowcol_to_a1(rid, len(CUSTOMERS_HEAD))}", [row])
            return True
    return False


def adjust_customer_balance(customer_id: str, delta: int) -> Optional[int]:
    """Add delta (can be negative) to customer balance. Returns new balance or None on error."""
    ws = _ws(SHEET_CUSTOMERS, CUSTOMERS_HEAD)
    vals = ws.get_all_values()
    for rid, r in enumerate(vals[1:], start=2):
        row = (r + [""] * len(CUSTOMERS_HEAD))[: len(CUSTOMERS_HEAD)]
        if row[0].strip() == str(customer_id).strip():
            try:
                cur = int(str(row[6]).strip().lstrip("'") or "0")
            except Exception:
                cur = 0
            new_bal = max(0, cur + delta)
            row[6] = str(new_bal)
            # Also update total_spent if delta is negative (payment)
            if delta < 0:
                try:
                    ts = int(str(row[7]).strip().lstrip("'") or "0")
                except Exception:
                    ts = 0
                row[7] = str(ts + abs(delta))
            ws.update(f"A{rid}:{rowcol_to_a1(rid, len(CUSTOMERS_HEAD))}", [row])
            return new_bal
    return None


def set_customer_password(customer_id: str, password_hash: str) -> bool:
    ws = _ws(SHEET_CUSTOMERS, CUSTOMERS_HEAD)
    vals = ws.get_all_values()
    for rid, r in enumerate(vals[1:], start=2):
        row = (r + [""] * len(CUSTOMERS_HEAD))[: len(CUSTOMERS_HEAD)]
        if row[0].strip() == str(customer_id).strip():
            row[4] = password_hash
            ws.update(f"A{rid}:{rowcol_to_a1(rid, len(CUSTOMERS_HEAD))}", [row])
            return True
    return False


def list_all_customers() -> List[dict]:
    ws = _ws(SHEET_CUSTOMERS, CUSTOMERS_HEAD)
    rows = ws.get_all_values()[1:]
    return [_row_to_customer(r) for r in rows if any(r)]


# ---- ACCOUNTS ----

def _invalidate_accounts_cache():
    _ACCOUNTS_CACHE["ts"] = 0.0


def _get_all_accounts_cached() -> List[dict]:
    now = time.time()
    if now - _ACCOUNTS_CACHE["ts"] < _ACCOUNTS_TTL and _ACCOUNTS_CACHE["data"]:
        return _ACCOUNTS_CACHE["data"]
    ws = _ws(SHEET_ACCOUNTS, ACCOUNTS_HEAD)
    rows = ws.get_all_values()[1:]
    accounts = []
    for r in rows:
        row = (r + [""] * len(ACCOUNTS_HEAD))[: len(ACCOUNTS_HEAD)]
        accounts.append(dict(zip(ACCOUNTS_HEAD, row)))
    _ACCOUNTS_CACHE["ts"] = now
    _ACCOUNTS_CACHE["data"] = accounts
    return accounts


def get_available_account(force_refresh: bool = True) -> Optional[dict]:
    import random
    if force_refresh:
        _invalidate_accounts_cache()
    accounts = _get_all_accounts_cached()
    available = [a for a in accounts if a.get("status", "").strip().lower() in ("available", "free")]
    if not available:
        return None
    return random.choice(available)


def get_account(account_id: str, force_refresh: bool = False) -> Optional[dict]:
    if force_refresh:
        _invalidate_accounts_cache()
    for acc in _get_all_accounts_cached():
        if acc.get("id") == account_id:
            return acc
    return None


def set_account_status(account_id: str, status: str, last_order_id: str = "") -> bool:
    ws = _ws(SHEET_ACCOUNTS, ACCOUNTS_HEAD)
    vals = ws.get_all_values()
    for rid, r in enumerate(vals[1:], start=2):
        row = (r + [""] * len(ACCOUNTS_HEAD))[: len(ACCOUNTS_HEAD)]
        if row[0] == account_id:
            row[8] = status
            row[10] = last_order_id
            ws.update(f"A{rid}:{rowcol_to_a1(rid, len(ACCOUNTS_HEAD))}", [row])
            _invalidate_accounts_cache()
            return True
    return False


def list_all_accounts() -> List[dict]:
    _invalidate_accounts_cache()
    return _get_all_accounts_cached()


# ---- ORDERS ----

def create_order(
    customer_id: str,
    account_id: str,
    hours: int,
    price: int,
    discount: int,
    amount: int,
    last4: str,
    currency: str,
    promo_code: str = "",
) -> dict:
    ws = _ws(SHEET_ORDERS, ORDERS_HEAD)
    oid = f"ord_{int(time.time()*1000)}"
    now = now_iso()
    end_at = (datetime.now(TZ) + timedelta(hours=hours)).isoformat()
    row = [""] * len(ORDERS_HEAD)
    row[0] = oid
    row[1] = customer_id
    row[2] = account_id
    row[3] = "active"
    row[4] = str(hours)
    row[5] = str(price)
    row[6] = str(discount)
    row[7] = str(amount)
    row[8] = last4
    row[9] = currency
    row[10] = now      # created_at
    row[11] = now      # paid_at
    row[12] = now      # start_at
    row[13] = end_at   # end_at
    row[14] = ""       # steam_code
    row[15] = promo_code
    ws.append_row(row)
    set_account_status(account_id, "in_use", oid)
    return dict(zip(ORDERS_HEAD, row))


def get_order(order_id: str) -> Optional[dict]:
    ws = _ws(SHEET_ORDERS, ORDERS_HEAD)
    for r in ws.get_all_values()[1:]:
        row = (r + [""] * len(ORDERS_HEAD))[: len(ORDERS_HEAD)]
        if row[0] == order_id:
            return dict(zip(ORDERS_HEAD, row))
    return None


def set_order_status(order_id: str, status: str, **fields) -> bool:
    ws = _ws(SHEET_ORDERS, ORDERS_HEAD)
    vals = ws.get_all_values()
    for rid, r in enumerate(vals[1:], start=2):
        row = (r + [""] * len(ORDERS_HEAD))[: len(ORDERS_HEAD)]
        if row[0] == order_id:
            row[3] = status
            for k, v in fields.items():
                if k in ORDERS_HEAD:
                    row[ORDERS_HEAD.index(k)] = str(v)
            ws.update(f"A{rid}:{rowcol_to_a1(rid, len(ORDERS_HEAD))}", [row])
            return True
    return False


def extend_order(order_id: str, extra_hours: int) -> Optional[dict]:
    """Extend an active order by adding hours to end_at."""
    ws = _ws(SHEET_ORDERS, ORDERS_HEAD)
    vals = ws.get_all_values()
    for rid, r in enumerate(vals[1:], start=2):
        row = (r + [""] * len(ORDERS_HEAD))[: len(ORDERS_HEAD)]
        if row[0] == order_id:
            try:
                end_at = datetime.fromisoformat(row[13])
                if end_at.tzinfo is None:
                    end_at = end_at.replace(tzinfo=TZ)
            except Exception:
                end_at = datetime.now(TZ)
            new_end = end_at + timedelta(hours=extra_hours)
            row[13] = new_end.isoformat()
            try:
                row[4] = str(int(row[4] or "0") + extra_hours)
            except Exception:
                pass
            ws.update(f"A{rid}:{rowcol_to_a1(rid, len(ORDERS_HEAD))}", [row])
            return dict(zip(ORDERS_HEAD, row))
    return None


def get_active_order_for_customer(customer_id: str) -> Optional[dict]:
    ws = _ws(SHEET_ORDERS, ORDERS_HEAD)
    for r in ws.get_all_values()[1:]:
        row = (r + [""] * len(ORDERS_HEAD))[: len(ORDERS_HEAD)]
        if row[1] == customer_id and row[3].strip().lower() == "active":
            return dict(zip(ORDERS_HEAD, row))
    return None


def list_orders_for_customer(customer_id: str) -> List[dict]:
    ws = _ws(SHEET_ORDERS, ORDERS_HEAD)
    out = []
    for r in ws.get_all_values()[1:]:
        row = (r + [""] * len(ORDERS_HEAD))[: len(ORDERS_HEAD)]
        if row[1] == customer_id:
            out.append(dict(zip(ORDERS_HEAD, row)))
    return sorted(out, key=lambda x: x.get("created_at", ""), reverse=True)


def list_active_orders() -> List[dict]:
    ws = _ws(SHEET_ORDERS, ORDERS_HEAD)
    out = []
    for r in ws.get_all_values()[1:]:
        row = (r + [""] * len(ORDERS_HEAD))[: len(ORDERS_HEAD)]
        if row[3].strip().lower() == "active":
            out.append(dict(zip(ORDERS_HEAD, row)))
    return out


def list_all_orders() -> List[dict]:
    ws = _ws(SHEET_ORDERS, ORDERS_HEAD)
    out = []
    for r in ws.get_all_values()[1:]:
        row = (r + [""] * len(ORDERS_HEAD))[: len(ORDERS_HEAD)]
        if any(row):
            out.append(dict(zip(ORDERS_HEAD, row)))
    return sorted(out, key=lambda x: x.get("created_at", ""), reverse=True)


# ---- TRANSACTIONS ----

def record_transaction(
    customer_id: str,
    ttype: str,
    amount: int,
    card_last4: str = "",
    session_id: str = "",
    status: str = "done",
    note: str = "",
) -> dict:
    ws = _ws(SHEET_TRANSACTIONS, TRANSACTIONS_HEAD)
    tid = f"tx_{int(time.time()*1000)}"
    row = [tid, customer_id, ttype, str(amount), card_last4, session_id, now_iso(), status, note]
    ws.append_row(row)
    return dict(zip(TRANSACTIONS_HEAD, row))


def list_transactions_for_customer(customer_id: str, limit: int = 50) -> List[dict]:
    ws = _ws(SHEET_TRANSACTIONS, TRANSACTIONS_HEAD)
    out = []
    for r in ws.get_all_values()[1:]:
        row = (r + [""] * len(TRANSACTIONS_HEAD))[: len(TRANSACTIONS_HEAD)]
        if row[1] == customer_id:
            out.append(dict(zip(TRANSACTIONS_HEAD, row)))
    out.sort(key=lambda x: x.get("ts", ""), reverse=True)
    return out[:limit]


def list_all_transactions(limit: int = 500) -> List[dict]:
    ws = _ws(SHEET_TRANSACTIONS, TRANSACTIONS_HEAD)
    out = []
    for r in ws.get_all_values()[1:]:
        row = (r + [""] * len(TRANSACTIONS_HEAD))[: len(TRANSACTIONS_HEAD)]
        if any(row):
            out.append(dict(zip(TRANSACTIONS_HEAD, row)))
    out.sort(key=lambda x: x.get("ts", ""), reverse=True)
    return out[:limit]


# ---- CARDS ----

def get_active_card() -> Optional[dict]:
    """Return the first active card from the CARDS sheet.
    Falls back gracefully if column names differ from CARDS_HEAD."""
    try:
        sh = _open()
        try:
            ws = sh.worksheet(SHEET_CARDS)
        except gspread.WorksheetNotFound:
            ws = sh.add_worksheet(title=SHEET_CARDS, rows=100, cols=len(CARDS_HEAD))
            ws.append_row(CARDS_HEAD)
            return None

        rows = ws.get_all_values()
        if not rows or len(rows) < 2:
            return None

        raw_header = rows[0]
        # Normalize header names to lowercase stripped
        header = [h.strip().lower() for h in raw_header]

        def _col(names: list) -> int:
            """Return index of first matching name, -1 if not found."""
            for n in names:
                n = n.lower()
                if n in header:
                    return header.index(n)
            return -1

        idx_id      = _col(["id"])
        idx_label   = _col(["label", "card_label", "name"])
        idx_bank    = _col(["bank", "card_bank"])
        idx_pay_to  = _col(["pay_to_text", "pay_to", "number", "card_number"])
        idx_last4   = _col(["last4", "card_last4", "last_4"])
        idx_enabled = _col(["enabled", "active"])
        idx_status  = _col(["status"])
        idx_note    = _col(["note", "notes"])

        def _get(row, idx, default=""):
            if idx < 0 or idx >= len(row):
                return default
            return str(row[idx]).strip()

        for row in rows[1:]:
            if not any(row):
                continue

            enabled_val = _get(row, idx_enabled, "1").lower()
            status_val  = _get(row, idx_status, "active").lower()

            # enabled: "1", "true", "yes", "да", "" (empty = assume yes), or missing column
            enabled_ok = enabled_val in ("1", "true", "yes", "да", "active", "") or idx_enabled < 0
            # status: "active", "available", "" or missing column
            status_ok  = status_val in ("active", "available", "") or idx_status < 0

            if enabled_ok and status_ok:
                pay_to = _get(row, idx_pay_to)
                last4  = _get(row, idx_last4)
                # If last4 not in dedicated column, extract from pay_to
                if not last4 and len(pay_to) >= 4:
                    last4 = pay_to[-4:]
                return {
                    "id":          _get(row, idx_id),
                    "label":       _get(row, idx_label),
                    "bank":        _get(row, idx_bank),
                    "pay_to_text": pay_to,
                    "last4":       last4,
                    "note":        _get(row, idx_note),
                }
    except Exception as e:
        import logging
        logging.getLogger("sheets").warning("get_active_card failed: %s", e)
    return None


# ---- PROMOS ----

def apply_promo(code: str, amount: int, customer_id: str = "") -> Tuple[bool, int, str, str]:
    """Returns (success, new_amount, discount_str, reject_reason)"""
    if not code:
        return False, amount, "", "not_found"
    ws = _ws(SHEET_PROMOS, PROMOS_HEAD)
    data = ws.get_all_values()
    if len(data) < 2:
        return False, amount, "", "not_found"
    header = data[0]

    def col_idx(name):
        try:
            return header.index(name)
        except ValueError:
            return -1

    idx_code = col_idx("code")
    idx_type = col_idx("type")
    idx_value = col_idx("value")
    idx_max_uses = col_idx("max_uses")
    idx_used_count = col_idx("used_count")
    idx_expires = col_idx("expires_at")

    for raw in data[1:]:
        row = (raw + [""] * len(header))[:len(header)]
        if idx_code < 0 or row[idx_code].strip().lower() != code.strip().lower():
            continue
        if idx_expires >= 0:
            expires = row[idx_expires].strip()
            if expires:
                try:
                    dt = datetime.fromisoformat(expires)
                    if dt.tzinfo is None:
                        dt = dt.replace(tzinfo=timezone.utc)
                    if dt < datetime.now(timezone.utc):
                        return False, amount, "", "expired"
                except Exception:
                    return False, amount, "", "expired"
        used = int(row[idx_used_count] or 0) if idx_used_count >= 0 else 0
        maxu = int(row[idx_max_uses] or 0) if idx_max_uses >= 0 else 0
        if maxu and used >= maxu:
            return False, amount, "", "limit_reached"
        t = row[idx_type].strip().lower() if idx_type >= 0 else ""
        val = float(row[idx_value] or 0) if idx_value >= 0 else 0
        disc = 0
        if t == "percent":
            disc = int(round(amount * (val / 100.0)))
        elif t == "flat":
            disc = int(val)
        new_amount = max(0, amount - disc)
        return True, new_amount, str(disc), ""
    return False, amount, "", "not_found"


def mark_promo_used(code: str, customer_id: str = "") -> bool:
    if not code:
        return False
    ws = _ws(SHEET_PROMOS, PROMOS_HEAD)
    data = ws.get_all_values()
    header = data[0]
    for rid, raw in enumerate(data[1:], start=2):
        if not raw:
            continue
        if raw[0].strip().lower() == code.strip().lower():
            row = (raw + [""] * len(header))[: len(header)]
            try:
                idx = header.index("used_count")
                row[idx] = str(int(row[idx] or "0") + 1)
                ws.update(f"A{rid}:{rowcol_to_a1(rid, len(header))}", [row])
                return True
            except Exception:
                return False
    return False


# ---- KICK LOG ----

def append_kick_log(
    order_id: str,
    account_id: str,
    steam_login: str,
    result: str,
    reason_code: str,
    reason_detail: str = "",
    artifacts: str = "",
) -> bool:
    try:
        ws = _ws(SHEET_KICKLOG, KICK_LOG_HEAD)
        row = [
            now_iso(), str(order_id), str(account_id), str(steam_login),
            str(result), str(reason_code), str(reason_detail)[:1000], str(artifacts),
        ]
        ws.append_row(row)
        return True
    except Exception as e:
        log.exception("append_kick_log failed: %s", e)
        return False
