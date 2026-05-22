import logging
import os
from contextlib import asynccontextmanager
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
log = logging.getLogger("main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: start background services on startup, clean up on shutdown."""
    log.info("BlazeRent API starting up...")

    # Start Telethon payment client
    payment_client = None
    try:
        from app.services.payments import start_client
        payment_client = await start_client()
        if payment_client:
            log.info("Telethon payment client started")
        else:
            log.warning("Telethon payment client not started (missing credentials or session)")
    except Exception as e:
        log.error("Failed to start payment client: %s", e)

    # Start APScheduler
    try:
        from app.services.scheduler import get_scheduler
        scheduler = get_scheduler()
        log.info("APScheduler running")
    except Exception as e:
        log.error("Failed to start scheduler: %s", e)

    # Populate admin phones from EXTRA_ADMIN_IDS (Telegram IDs → look up phone)
    try:
        from app.services import sheets as sh
        from app.auth import ADMIN_PHONES

        if settings.admin_ids:
            all_customers = sh.list_all_customers()
            for c in all_customers:
                tg_id = c.get("tg_user_id", "").strip()
                if tg_id and tg_id.lstrip("-").isdigit() and int(tg_id) in settings.admin_ids:
                    phone = c.get("phone", "").strip()
                    if phone:
                        ADMIN_PHONES.add(phone)
            log.info("Admin phones populated: %s", ADMIN_PHONES)
    except Exception as e:
        log.warning("Could not populate admin phones: %s", e)

    # Reschedule any active sessions from sheets
    try:
        from app.services import sheets as sh
        from app.services.scheduler import schedule_session_jobs
        from datetime import datetime
        import pytz

        TZ = pytz.timezone("Asia/Tashkent")
        active_orders = sh.list_active_orders()
        log.info("Found %d active sessions to reschedule", len(active_orders))
        for order in active_orders:
            end_at_str = order.get("end_at", "")
            customer_id = order.get("customer_id", "")
            order_id = order.get("id", "")
            try:
                end_at = datetime.fromisoformat(end_at_str)
                if end_at.tzinfo is None:
                    end_at = TZ.localize(end_at)
                customer = sh.get_customer_by_id(customer_id)
                chat_id = None
                lang = "ru"
                if customer:
                    chat_id = customer.get("tg_user_id") or customer.get("tg_chat_id")
                    lang = customer.get("language", "ru")
                schedule_session_jobs(
                    order_id=order_id,
                    customer_id=customer_id,
                    ends_at=end_at,
                    lang=lang,
                    chat_id=chat_id,
                )
            except Exception as e:
                log.warning("Failed to reschedule order %s: %s", order_id, e)
    except Exception as e:
        log.error("Failed to reschedule active sessions: %s", e)

    yield

    # Shutdown
    log.info("BlazeRent API shutting down...")
    if payment_client:
        try:
            await payment_client.disconnect()
        except Exception:
            pass


app = FastAPI(
    title="BlazeRent API",
    description="Steam Account Rental Service API",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow the frontend dev server and production domain
origins = [
    "http://localhost:3000",
    "http://localhost:4321",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:4321",
    "http://127.0.0.1:5173",
    os.getenv("FRONTEND_URL", ""),
]
origins = [o for o in origins if o]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
from app.routers import auth, sessions, wallet, admin

app.include_router(auth.router, prefix="/api")
app.include_router(sessions.router, prefix="/api")
app.include_router(wallet.router, prefix="/api")
app.include_router(admin.router, prefix="/api")


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "BlazeRent API"}


@app.get("/")
async def root():
    return {"service": "BlazeRent API", "docs": "/docs"}
