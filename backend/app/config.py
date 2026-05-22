from pydantic_settings import BaseSettings
from pydantic import Field
from typing import List


class Settings(BaseSettings):
    secret_key: str = Field(default="change-me", env="SECRET_KEY")
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7

    # Telegram bot
    tg_bot_token: str = Field(default="", env="TG_BOT_TOKEN")
    operator_username: str = Field(default="operator", env="OPERATOR_USERNAME")
    operator_chat_id: str = Field(default="", env="OPERATOR_CHAT_ID")
    extra_admin_ids: str = Field(default="", env="EXTRA_ADMIN_IDS")

    # Telethon payment watcher
    tg_api_id: int = Field(default=0, env="TG_API_ID")
    tg_api_hash: str = Field(default="", env="TG_API_HASH")
    tg_payment_chats: str = Field(default="", env="TG_PAYMENT_CHATS")
    payment_tolerance_abs: int = Field(default=200, env="PAYMENT_TOLERANCE_ABS")
    payment_timeout_min: int = Field(default=10, env="PAYMENT_TIMEOUT_MIN")

    # Google Sheets
    google_sheets_id: str = Field(default="", env="GSHEET_ID")
    google_service_account_base64: str = Field(default="", env="GOOGLE_SERVICE_ACCOUNT_BASE64")
    google_credentials_path: str = Field(default="credentials.json", env="GOOGLE_CREDENTIALS_PATH")

    # IMAP / Steam Guard
    imap_default_host: str = Field(default="imap.gmail.com", env="IMAP_DEFAULT_HOST")
    imap_default_port: int = Field(default=993, env="IMAP_DEFAULT_PORT")
    imap_quick_limit_sec: int = Field(default=90, env="IMAP_QUICK_LIMIT_SEC")
    steam_code_wait_min: int = Field(default=10, env="STEAM_CODE_WAIT_MIN")

    # Pricing
    payment_rate_per_hour: int = Field(default=5000, env="PAYMENT_RATE_PER_HOUR")
    currency: str = Field(default="UZS", env="CURRENCY")
    min_rent_hours: int = Field(default=1, env="MIN_RENT_HOURS")
    max_rent_hours: int = Field(default=24, env="MAX_RENT_HOURS")

    # Kick / Selenium
    kick_headless: int = Field(default=0, env="KICK_HEADLESS")
    kick_no_sandbox: int = Field(default=1, env="KICK_NO_SANDBOX")
    steam_kick_ua: str = Field(default="", env="STEAM_KICK_UA")
    steam_kick_lang: str = Field(default="en-US,en", env="STEAM_KICK_LANG")

    # Misc
    timezone: str = Field(default="Asia/Tashkent", env="TIMEZONE")
    log_level: str = Field(default="INFO", env="LOG_LEVEL")
    rent_warn_before_min: int = Field(default=15, env="RENT_WARN_BEFORE_MIN")
    rent_end_grace_sec: int = Field(default=60, env="RENT_END_GRACE_SEC")

    @property
    def admin_ids(self) -> List[int]:
        ids = []
        for x in self.extra_admin_ids.split(","):
            x = x.strip()
            if x.isdigit():
                ids.append(int(x))
        return ids

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
