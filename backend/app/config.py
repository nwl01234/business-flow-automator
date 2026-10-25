from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Business Flow Automator"
    environment: str = "production"

    # БД: sqlite (по умолчанию) или postgresql://user:pass@host:5432/db
    database_url: str = "sqlite:///./data/business_flow.db"

    # Auth
    jwt_secret: str = "change-me-in-production"
    jwt_ttl_min: int = 480  # 8-часовая рабочая сессия

    # Seed users
    admin_login: str = "admin"
    admin_password: str = "admin123"
    manager_login: str = "manager"
    manager_password: str = "manager123"
    bot_login: str = "telegram_bot"
    bot_password: str = "bot_secret_change_me"
    seed_demo: bool = True

    # Telegram notifications
    telegram_bot_token: str = ""
    notify_chat_id: str = ""

    # Email notifications
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    email_from: str = ""
    email_to: str = ""

    # Google Sheets (внешние остатки)
    google_credentials_file: str = ""
    google_sheet_id: str = ""
    google_sheet_name: str = "Stock"

    # Scheduler
    daily_report_hour: int = 9
    stock_check_hours: int = 3
    low_stock_threshold: int = 5

    # Bot -> API
    api_public_url: str = "http://localhost:8000"


settings = Settings()

# Алиас: если в .env задан BOT_TOKEN (как у стандартных Telegram-ботов) — используем его для уведомлений
if not settings.telegram_bot_token:
    import os
    settings.telegram_bot_token = os.environ.get("BOT_TOKEN", "")
