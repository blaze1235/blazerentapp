"""
Steam force-logout service wrapper.
Exposes async_force_logout() which runs the blocking Selenium code in a thread executor.
"""
import asyncio
import logging
import os
import sys
from typing import Optional

log = logging.getLogger("steam")


def _build_imap_config(account: dict) -> dict:
    """Build IMAP config dict from an account row."""
    return {
        "host": account.get("imap_host", ""),
        "port": int(account.get("imap_port", 993) or 993),
        "user": account.get("imap_user", "") or account.get("email", ""),
        "pass": account.get("imap_pass", ""),
        "mailbox": "INBOX",
    }


def _has_imap(account: dict) -> bool:
    cfg = _build_imap_config(account)
    return bool(cfg["host"] and cfg["user"] and cfg["pass"])


def force_logout_sync(
    steam_login: str,
    steam_password: str,
    imap_config: dict,
    order_id: str,
    account_id: str,
    headless: bool = True,
    no_sandbox: bool = True,
) -> bool:
    """
    Synchronous wrapper around the Selenium force_logout logic.
    Returns True on success, raises on failure.
    """
    # Add the bot source to path if available
    bot_path = "/tmp/steam-rent-bot/steam-rent-bot-main"
    if os.path.isdir(bot_path) and bot_path not in sys.path:
        sys.path.insert(0, bot_path)

    try:
        from app.force_logout import force_logout  # type: ignore
        result = force_logout(
            steam_login=steam_login,
            password=steam_password,
            imap_config=imap_config,
            order_id=order_id,
            acc_id=account_id,
            headless=headless,
            no_sandbox=no_sandbox,
        )
        return bool(result)
    except ImportError:
        log.warning("force_logout module not available, using stub")
        return _stub_force_logout(steam_login, order_id, account_id)
    except Exception as e:
        log.error("force_logout failed for %s: %s", steam_login, e, exc_info=True)
        raise


def _stub_force_logout(steam_login: str, order_id: str, account_id: str) -> bool:
    """Stub for when Selenium/Chrome is not available."""
    log.info("[STUB] force_logout called for %s order=%s acc=%s", steam_login, order_id, account_id)
    from ..services import sheets as sh
    sh.set_account_status(account_id, "available", "")
    sh.set_order_status(order_id, "finished")
    sh.append_kick_log(order_id, account_id, steam_login, "success", "STUB", "Stub logout (no Chrome)", "")
    return True


async def async_force_logout(
    steam_login: str,
    steam_password: str,
    imap_config: dict,
    order_id: str,
    account_id: str,
    headless: bool = True,
    no_sandbox: bool = True,
) -> bool:
    """
    Async wrapper: runs force_logout in a thread pool executor so it doesn't block the event loop.
    """
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        lambda: force_logout_sync(
            steam_login=steam_login,
            steam_password=steam_password,
            imap_config=imap_config,
            order_id=order_id,
            account_id=account_id,
            headless=headless,
            no_sandbox=no_sandbox,
        ),
    )
    return result


async def async_force_logout_for_order(order_id: str) -> bool:
    """
    Convenience: load order + account from sheets and run force logout.
    """
    from ..services import sheets as sh

    order = sh.get_order(order_id)
    if not order:
        log.error("Order %s not found for force logout", order_id)
        return False

    account_id = order.get("account_id", "")
    account = sh.get_account(account_id, force_refresh=True)
    if not account:
        log.error("Account %s not found for force logout (order %s)", account_id, order_id)
        return False

    steam_login = account.get("steam_login", "")
    steam_password = account.get("steam_password", "")
    imap_config = _build_imap_config(account)

    headless = os.getenv("KICK_HEADLESS", "1").strip().lower() not in ("0", "false", "no", "off")
    no_sandbox = os.getenv("KICK_NO_SANDBOX", "1").strip().lower() not in ("0", "false", "no", "off")

    return await async_force_logout(
        steam_login=steam_login,
        steam_password=steam_password,
        imap_config=imap_config,
        order_id=order_id,
        account_id=account_id,
        headless=headless,
        no_sandbox=no_sandbox,
    )
