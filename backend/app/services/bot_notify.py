"""
Notification-only Telegram bot service.
Sends messages to users without a full FSM dispatcher.
Supports en/uz/ru locales.
"""
import logging
import os
from typing import Optional

log = logging.getLogger("bot_notify")

# ---- Localized message templates ----

_MSGS = {
    "session_started": {
        "ru": (
            "🎮 <b>Аренда началась!</b>\n\n"
            "🔑 Логин: <code>{login}</code>\n"
            "🔐 Пароль: <code>{password}</code>\n\n"
            "⏳ Аренда активна до: <b>{ends_at}</b>\n\n"
            "Хорошей игры!"
        ),
        "uz": (
            "🎮 <b>Ijara boshlandi!</b>\n\n"
            "🔑 Login: <code>{login}</code>\n"
            "🔐 Parol: <code>{password}</code>\n\n"
            "⏳ Ijara tugash vaqti: <b>{ends_at}</b>\n\n"
            "Yaxshi o'yin!"
        ),
        "en": (
            "🎮 <b>Rental started!</b>\n\n"
            "🔑 Login: <code>{login}</code>\n"
            "🔐 Password: <code>{password}</code>\n\n"
            "⏳ Rental active until: <b>{ends_at}</b>\n\n"
            "Have fun!"
        ),
    },
    "warning_15min": {
        "ru": "⏰ <b>Осталось 15 минут</b> аренды!\n\nЧтобы продолжить игру, продлите аренду в приложении.",
        "uz": "⏰ Ijarangiz tugashiga <b>15 daqiqa</b> qoldi!\n\nO'yinni davom ettirish uchun ijarani uzaytiring.",
        "en": "⏰ <b>15 minutes left</b> in your rental!\n\nExtend your session in the app to keep playing.",
    },
    "warning_5min": {
        "ru": "🚨 <b>Осталось 5 минут!</b> Аренда скоро закончится.\n\nПродлите прямо сейчас, чтобы не потерять прогресс.",
        "uz": "🚨 Ijarangiz tugashiga <b>5 daqiqa</b> qoldi!\n\nHoziroq uzaytiring, yutuqlaringizni yo'qotmang.",
        "en": "🚨 <b>5 minutes left!</b> Your rental is ending soon.\n\nExtend now to keep your progress.",
    },
    "session_expired": {
        "ru": "⏱ Время аренды истекло.\n\nБлагодарим за использование BlazeRent! Приходите снова.",
        "uz": "⏱ Ijara vaqti tugadi.\n\nBlazeRent'dan foydalanganingiz uchun rahmat! Yana kelasiz.",
        "en": "⏱ Your rental has expired.\n\nThank you for using BlazeRent! Come back soon.",
    },
    "topup_confirmed": {
        "ru": "✅ <b>Пополнение подтверждено!</b>\n\nСумма: <b>{amount} {currency}</b> зачислена на ваш баланс.",
        "uz": "✅ <b>To'lov tasdiqlandi!</b>\n\nSumma: <b>{amount} {currency}</b> balansingizga qo'shildi.",
        "en": "✅ <b>Top-up confirmed!</b>\n\nAmount: <b>{amount} {currency}</b> added to your balance.",
    },
    "session_extended": {
        "ru": "✅ <b>Аренда продлена!</b>\n\nНовое время окончания: <b>{ends_at}</b>",
        "uz": "✅ <b>Ijara uzaytirildi!</b>\n\nYangi tugash vaqti: <b>{ends_at}</b>",
        "en": "✅ <b>Rental extended!</b>\n\nNew end time: <b>{ends_at}</b>",
    },
}


def _get_msg(key: str, lang: str, **kwargs) -> str:
    lang = lang if lang in ("ru", "uz", "en") else "ru"
    template = _MSGS.get(key, {}).get(lang) or _MSGS.get(key, {}).get("ru", "")
    try:
        return template.format(**kwargs)
    except KeyError:
        return template


async def _send(chat_id, text: str) -> bool:
    """Send a Telegram message using aiogram Bot directly."""
    token = os.getenv("TG_BOT_TOKEN", "")
    if not token:
        log.warning("TG_BOT_TOKEN not set, cannot send notification to %s", chat_id)
        return False
    if not chat_id:
        log.debug("No chat_id, skipping notification")
        return False

    try:
        from aiogram import Bot
        from aiogram.enums import ParseMode
        bot = Bot(token=token)
        await bot.send_message(
            chat_id=int(chat_id),
            text=text,
            parse_mode=ParseMode.HTML,
        )
        await bot.session.close()
        return True
    except Exception as e:
        log.error("Failed to send Telegram notification to %s: %s", chat_id, e)
        return False


async def notify_session_started(
    chat_id,
    login: str,
    password: str,
    ends_at: str,
    lang: str = "ru",
) -> bool:
    text = _get_msg("session_started", lang, login=login, password=password, ends_at=ends_at)
    return await _send(chat_id, text)


async def notify_15min_warning(chat_id, session_id: str, lang: str = "ru") -> bool:
    text = _get_msg("warning_15min", lang)
    return await _send(chat_id, text)


async def notify_5min_warning(chat_id, session_id: str, lang: str = "ru") -> bool:
    text = _get_msg("warning_5min", lang)
    return await _send(chat_id, text)


async def notify_session_expired(chat_id, lang: str = "ru") -> bool:
    text = _get_msg("session_expired", lang)
    return await _send(chat_id, text)


async def notify_topup_confirmed(chat_id, amount: int, currency: str = "UZS", lang: str = "ru") -> bool:
    text = _get_msg("topup_confirmed", lang, amount=amount, currency=currency)
    return await _send(chat_id, text)


async def notify_session_extended(chat_id, ends_at: str, lang: str = "ru") -> bool:
    text = _get_msg("session_extended", lang, ends_at=ends_at)
    return await _send(chat_id, text)


async def notify_custom(chat_id, message: str) -> bool:
    """Send a raw custom message (admin use)."""
    return await _send(chat_id, message)
