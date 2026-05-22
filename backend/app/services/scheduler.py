"""
APScheduler wrapper for session expiry, warnings, and other timed jobs.
"""
import logging
from datetime import datetime
from typing import Callable, Any
import inspect
import pytz
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.jobstores.base import JobLookupError

log = logging.getLogger("scheduler")
_TZ = pytz.utc
_scheduler: AsyncIOScheduler | None = None


def _ensure_scheduler() -> AsyncIOScheduler:
    global _scheduler
    if _scheduler is None:
        _scheduler = AsyncIOScheduler(timezone=_TZ)
        try:
            _scheduler.start()
            log.info("APScheduler started")
        except Exception as e:
            log.exception("Failed to start scheduler: %s", e)
    return _scheduler


def get_scheduler() -> AsyncIOScheduler:
    return _ensure_scheduler()


def _wrap(func: Callable[..., Any], *args, **kwargs):
    if inspect.iscoroutinefunction(func):
        async def _coro():
            try:
                await func(*args, **kwargs)
            except Exception:
                log.exception("Scheduled coroutine failed")
        return _coro
    else:
        def _call():
            try:
                func(*args, **kwargs)
            except Exception:
                log.exception("Scheduled function failed")
        return _call


def schedule_once(run_at: datetime, job_id: str, func: Callable[..., Any], *args, **kwargs) -> None:
    sch = _ensure_scheduler()
    try:
        sch.remove_job(job_id)
    except JobLookupError:
        pass
    sch.add_job(
        _wrap(func, *args, **kwargs),
        trigger="date",
        run_date=run_at,
        id=job_id,
        replace_existing=True,
    )
    log.info("Scheduled job %s at %s", job_id, run_at.isoformat())


def cancel_job(job_id: str) -> None:
    sch = _ensure_scheduler()
    try:
        sch.remove_job(job_id)
        log.info("Cancelled job %s", job_id)
    except JobLookupError:
        pass


def schedule_session_jobs(order_id: str, customer_id: str, ends_at: datetime, lang: str = "ru", chat_id=None) -> None:
    """
    Schedule the full set of jobs for a rental session:
    - 15-minute warning
    - 5-minute warning
    - Expiry (force logout + notify)
    """
    from datetime import timedelta
    from . import bot_notify

    warn_15 = ends_at - timedelta(minutes=15)
    warn_5 = ends_at - timedelta(minutes=5)
    now = datetime.now(pytz.utc)

    if warn_15 > now and chat_id:
        schedule_once(
            warn_15,
            f"warn15_{order_id}",
            bot_notify.notify_15min_warning,
            chat_id,
            order_id,
            lang,
        )

    if warn_5 > now and chat_id:
        schedule_once(
            warn_5,
            f"warn5_{order_id}",
            bot_notify.notify_5min_warning,
            chat_id,
            order_id,
            lang,
        )

    if ends_at > now:
        schedule_once(
            ends_at,
            f"expire_{order_id}",
            _handle_session_expiry,
            order_id,
            customer_id,
            chat_id,
            lang,
        )


async def _handle_session_expiry(order_id: str, customer_id: str, chat_id, lang: str = "ru") -> None:
    """Called when a session's end time is reached."""
    log.info("Session expiry triggered for order %s", order_id)
    from . import bot_notify
    from .steam import async_force_logout_for_order

    # Run force logout
    try:
        await async_force_logout_for_order(order_id)
        log.info("Force logout completed for order %s", order_id)
    except Exception as e:
        log.error("Force logout failed for order %s: %s", order_id, e)

    # Notify user
    if chat_id:
        try:
            await bot_notify.notify_session_expired(chat_id, lang=lang)
        except Exception as e:
            log.error("Failed to send expiry notification: %s", e)


def cancel_session_jobs(order_id: str) -> None:
    """Cancel all scheduled jobs for a session."""
    for prefix in ("warn15_", "warn5_", "expire_"):
        cancel_job(f"{prefix}{order_id}")
