# BlazeRent — Steam Account Rental Service

## Architecture

```
BlazeRentApp/
├── backend/          # FastAPI Python backend
│   ├── main.py       # App entrypoint, CORS, lifespan
│   ├── app/
│   │   ├── auth.py       # JWT auth, bcrypt passwords
│   │   ├── config.py     # Pydantic settings from env
│   │   ├── models.py     # Pydantic request/response models
│   │   ├── routers/
│   │   │   ├── auth.py       # POST /login, POST /register, GET /me
│   │   │   ├── sessions.py   # Rental session CRUD + quote
│   │   │   ├── wallet.py     # Balance, topups, WebSocket
│   │   │   └── admin.py      # Admin dashboard, clients, finance, kick
│   │   └── services/
│   │       ├── sheets.py     # Google Sheets data layer
│   │       ├── payments.py   # Telethon payment detection
│   │       ├── steam.py      # Selenium force-logout wrapper
│   │       ├── bot_notify.py # Telegram notifications (aiogram)
│   │       └── scheduler.py  # APScheduler session expiry jobs
│   ├── requirements.txt
│   └── .env.example
│
├── frontend/         # React + TypeScript + Tailwind
│   ├── src/
│   │   ├── App.tsx         # Router setup
│   │   ├── api/            # Axios API clients
│   │   ├── components/     # Layout, BottomTabBar
│   │   ├── hooks/          # useActiveSession (polls every 30s)
│   │   ├── pages/          # Home, Auth, Rent, Sessions, Wallet, Profile
│   │   │   └── admin/      # Dashboard, Clients, Finance, Stats, Operations
│   │   ├── store/          # Zustand: auth, session
│   │   └── types/          # TypeScript interfaces
│   └── package.json
│
└── docker-compose.yml
```

## Data Model (Google Sheets)

| Sheet | Key columns |
|-------|-------------|
| CUSTOMERS | id, tg_user_id, phone, name, password (bcrypt), balance, total_spent, language |
| ACCOUNTS | id, steam_login, steam_password, email, imap_host/port/user/pass, status |
| ORDERS | id, customer_id, account_id, status, hours, price, paid_amount, start_at, end_at |
| TRANSACTIONS | id, customer_id, type, amount, session_id, ts, status |
| PROMOS | code, type (percent/flat), value, max_uses, used_count, expires_at |
| CARDS | id, label, bank, pay_to_text, last4, enabled |
| KICK_LOG | ts, order_id, account_id, steam_login, result, reason_code |
| SETTINGS | key, value (price_per_hour, currency, min/max_rent_hours, etc.) |

## Setup

### Backend

```bash
cd backend
cp .env.example .env
# Fill in .env values
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev   # starts on :3000, proxies /api to :8000
```

### Docker

```bash
docker-compose up --build
```

## Key flows

1. **Rental**: User selects hours → POST /sessions/rent → balance deducted → account assigned → APScheduler jobs for 15min/5min warnings + expiry → Selenium force-logout at expiry
2. **Top-up**: User initiates → Telethon watches payment chat → on match → balance credited → WebSocket notifies frontend
3. **Notifications**: aiogram Bot sends messages in ru/uz/en based on user.language
