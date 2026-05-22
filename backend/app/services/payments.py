"""
Telethon payment detection service — adapted from the original bot's payments.py.
Exposes start_client(), watch_for(), and find_payment() for the FastAPI backend.
"""
import os, re, asyncio, logging, pathlib
from datetime import datetime, timezone
from typing import List, Dict, Optional, Callable, Awaitable

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("payments")
logger.setLevel(getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO))

SESS_DIR = pathlib.Path(".sessions")
SESS_DIR.mkdir(exist_ok=True)

API_ID = int(os.getenv("TG_API_ID") or 0)
API_HASH = os.getenv("TG_API_HASH", "")
CHATS_RAW = (os.getenv("TG_PAYMENT_CHATS", "") or "").strip()


def _parse_chats(env: str):
    if not env:
        return None
    out = []
    for token in re.split(r"[\s,;]+", env):
        if not token:
            continue
        if re.fullmatch(r"-?\d+", token):
            out.append(int(token))
        else:
            out.append(token)
    return out or None


CHATS = _parse_chats(CHATS_RAW)

IN_KEYS = re.compile(
    os.getenv("PAYMENT_IN_KEYWORDS", r"поступлен[ие]|пополнени[ея]|credited|deposit|\+|➕"),
    re.I,
)
OUT_BLOCK = re.compile(
    os.getenv("PAYMENT_OUT_BLOCKLIST", r"\b(списани[ея]|оплат[аи]|вывод|withdraw|payment|debit)\b"),
    re.I,
)
AMOUNT_RE = re.compile(r"([\d\s\.,]+)\s*(UZS|SUM|SO[''`]?M)?", re.I)

CLIENT = None
_CLIENT_LOCK = asyncio.Lock()
PAYMENTS: List[Dict] = []
WATCHERS: List[Dict] = []
START_TS: Optional[datetime] = None

MAX_PAY = int(os.getenv("PAYMENTS_BUFFER_MAX", "2000"))
TRIM_TO = int(os.getenv("PAYMENTS_BUFFER_TRIM_TO", "1200"))
MAX_WATCH = int(os.getenv("PAYMENTS_WATCHERS_MAX", "1000"))


def is_incoming(text: str) -> bool:
    if not text:
        return False
    if OUT_BLOCK.search(text):
        return False
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    if any("➕" in ln for ln in lines):
        return True
    return any(IN_KEYS.search(ln) for ln in lines)


def parse_amount(text: str) -> Optional[int]:
    text = text or ""
    plus_re = re.compile(r"➕\s*([\d\s\.,]+)\s*UZS", re.I)
    m = plus_re.search(text)
    if m:
        num = m.group(1).strip()
        raw = num.replace(" ", "").replace(".", "").replace(",", ".")
        try:
            val = int(round(float(raw)))
            return val if val > 0 else None
        except Exception:
            pass
    best = 0
    for ln in text.splitlines():
        ln = ln.replace(" ", " ").strip()
        if not IN_KEYS.search(ln):
            continue
        for num, _cur in AMOUNT_RE.findall(ln):
            raw = num.strip().replace(" ", "").replace(".", "").replace(",", ".")
            try:
                val = int(round(float(raw)))
                if val > best:
                    best = val
            except Exception:
                pass
    return best if best > 0 else None


def parse_last4(text: str) -> Optional[str]:
    text = text or ""
    patterns = [
        r"(?:\*|•|∙|·|x|X){2,}\s*(\d{4})(?!\d)",
        r"(?:card|карта|karta|plastik)\s*(?:№|#|:)?\s*(\d{4})(?!\d)",
        r"\*(\d{4})\b",
    ]
    for pat in patterns:
        m = re.findall(pat, text, re.I)
        if m:
            return m[-1]
    return None


async def start_client():
    global START_TS, CLIENT
    if not API_ID or not API_HASH:
        logger.warning("Telethon not configured (TG_API_ID/TG_API_HASH missing). Payment detection disabled.")
        return None
    try:
        from telethon import TelegramClient, events
    except ImportError:
        logger.warning("telethon not installed. Payment detection disabled.")
        return None

    async with _CLIENT_LOCK:
        if CLIENT and CLIENT.is_connected():
            return CLIENT
        session_path = SESS_DIR / "payment.session"
        client = TelegramClient(str(session_path), API_ID, API_HASH)
        try:
            await client.start()
        except Exception as e:
            logger.error("Telethon start failed: %s. Run 'python -m app.services.payments login' to authenticate.", e)
            return None
        START_TS = datetime.now(timezone.utc)

        @client.on(events.NewMessage(chats=CHATS if CHATS else None))
        async def handler(event):
            try:
                msg = event.message
                if START_TS and msg.date.replace(tzinfo=timezone.utc) < START_TS:
                    return
                text = (msg.message or "").strip()
                if not text or not is_incoming(text):
                    return
                amount = parse_amount(text) or 0
                last4 = parse_last4(text) or ""
                payment = {
                    "id": msg.id,
                    "ts": msg.date.astimezone(timezone.utc).isoformat(),
                    "text": text,
                    "amount": amount,
                    "last4": last4,
                }
                PAYMENTS.append(payment)
                if len(PAYMENTS) > MAX_PAY:
                    del PAYMENTS[: len(PAYMENTS) - TRIM_TO]
                logger.info("[PAYMENT] +%d last4=%s id=%s", amount, last4, msg.id)
                for w in list(WATCHERS):
                    if abs(payment["amount"] - w["amount"]) <= w.get("tol", 0) and (
                        not w["last4"] or payment["last4"] == w["last4"]
                    ):
                        try:
                            WATCHERS.remove(w)
                        except ValueError:
                            pass
                        try:
                            asyncio.create_task(w["cb"](payment))
                        except Exception:
                            logger.exception("Watcher callback error")
            except Exception:
                logger.exception("Payment handler error")

        CLIENT = client
        return CLIENT


def watch_for(amount: int, last4: str, cb: Callable[[Dict], Awaitable[None]], tol: int = 0) -> None:
    if len(WATCHERS) > MAX_WATCH:
        del WATCHERS[: len(WATCHERS) - MAX_WATCH]
    WATCHERS.append({"amount": int(amount), "last4": str(last4 or ""), "cb": cb, "tol": int(tol)})


async def find_payment(amount: int, last4: str, minutes: int) -> Optional[Dict]:
    deadline = datetime.now(timezone.utc).timestamp() + minutes * 60
    checked = 0
    while datetime.now(timezone.utc).timestamp() < deadline:
        for item in PAYMENTS[checked:]:
            if item["amount"] == int(amount) and ((not last4) or item["last4"] == str(last4)):
                return item
        checked = len(PAYMENTS)
        await asyncio.sleep(2)
    return None


ensure_payment_client = start_client
