# BlazeRentApp — Developer Onboarding

## What this is
A CS2 Prime Steam account rental platform. Users pay UZS, get temporary Steam login credentials, and play. Admins manage accounts, clients, and finances from a dashboard.

## Stack
| Layer | Tech |
|---|---|
| Backend | FastAPI (Python), runs on port 8000 |
| Frontend | React + TypeScript + Vite + TailwindCSS, port 5173 |
| Database | Google Sheets (no SQL — all data in named sheets) |
| Notifications | Telegram Bot (Telethon) |
| Auth | JWT tokens, phone-number login |

## Project structure
```
BlazeRentApp/
├── backend/
│   ├── main.py                  # FastAPI app entry point
│   ├── app/
│   │   ├── routers/
│   │   │   ├── admin.py         # All /admin/* endpoints
│   │   │   ├── auth.py          # Login / register
│   │   │   ├── sessions.py      # Rent / end session
│   │   │   └── wallet.py        # Top-up / transactions
│   │   └── services/
│   │       ├── sheets.py        # Google Sheets DB layer (THE critical file)
│   │       ├── payments.py      # Card detection + payment flow
│   │       ├── bot_notify.py    # Telegram notifications
│   │       └── scheduler.py     # Session expiry background tasks
├── frontend/src/
│   ├── pages/
│   │   ├── Home.tsx             # User dashboard
│   │   ├── Rent.tsx             # Rental flow
│   │   ├── Sessions.tsx         # Active + history
│   │   ├── Wallet.tsx           # Balance + top-up
│   │   ├── Profile.tsx          # User settings
│   │   └── admin/
│   │       ├── Dashboard.tsx    # Admin overview + pending topups
│   │       ├── Operations.tsx   # Live sessions + active topups
│   │       ├── Clients.tsx      # Client table + drawer (sliding detail panel)
│   │       ├── Finance.tsx      # Revenue + breakdown
│   │       ├── Stats.tsx        # Analytics charts
│   │       └── Inventory.tsx    # Steam account pool management
│   ├── api/                     # Axios wrappers for every endpoint
│   ├── store/                   # Zustand stores (auth, session)
│   ├── hooks/useActiveSession.ts
│   ├── types/index.ts           # All TypeScript interfaces
│   └── index.css                # Design system (tags, buttons, tables, drawer, progress bars)
```

## Google Sheets schema (critical — don't rename columns)
| Sheet | Key columns |
|---|---|
| CUSTOMERS | id, phone, name, balance, total_spent, language, is_admin |
| ACCOUNTS | id, steam_login, steam_password, status, price1h, last_order_id |
| ORDERS | id, customer_id, account_id, status, hours, price, paid_amount, start_at, end_at |
| TRANSACTIONS | id, customer_id, type, amount, card_last4, status, created_at |
| CARDS | id, label, bank, pay_to_text, last4, enabled, status |

## Running locally
```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in GOOGLE_SHEETS_ID, TELEGRAM_BOT_TOKEN, JWT_SECRET
uvicorn main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

## Environment variables needed (backend .env)
```
GOOGLE_SHEETS_ID=...
GOOGLE_CREDENTIALS_JSON=...   # service account JSON (stringified)
TELEGRAM_BOT_TOKEN=...
ADMIN_PHONE=...               # phone number that gets admin access
JWT_SECRET=...
VITE_API_URL=http://localhost:8000  # set in frontend/.env
```

## Design system
The UI uses a custom dark design system defined in `frontend/src/index.css`.
Key CSS classes: `.tag`, `.tag-live`, `.tag-green`, `.tag-red`, `.tag-yellow`,
`.btn`, `.btn-primary`, `.btn-ghost`, `.btn-red`, `.sbox`, `.sv`, `.sl`,
`.prog`, `.prog-fill`, `.cred`, `.drawer`, `.tbl-wrap`

Color palette: `#090E1A` bg · `#2563eb` blue · `#60a5fa` blue-light · `#64748b` muted

## What's left / known TODOs
- [ ] `SHEET_CARDS` column names in Google Sheets must match exactly or the flexible `get_active_card()` in sheets.py normalizes them — verify your sheet headers
- [ ] Admin inventory page expects a `GET /admin/inventory` endpoint — already implemented in `admin.py`
- [ ] `PATCH /admin/inventory/{id}/status` updates account status via `set_account_status()` in sheets.py
- [ ] Finance page breakdown boxes (client_balances, promo_discounts) are mocked — wire up real data from backend if needed
- [ ] Stats page `account_stats` field not yet returned by `/admin/stats` — add it to the stats endpoint for the account performance table to populate
- [ ] Sessions by hour chart (`sessions_by_hour`) needs backend support in `/admin/stats`
- [ ] Telegram bot (`bot_notify.py`) sends messages on session start/end — test with a real bot token

## API overview
All endpoints are prefixed `/api`. Auth header: `Authorization: Bearer <token>`

| Method | Path | Description |
|---|---|---|
| POST | /auth/login | Phone + password login → JWT |
| GET | /sessions/active | Current user's active session |
| POST | /sessions/start | Start a rental |
| POST | /sessions/{id}/end | End a session early |
| GET | /wallet/transactions | Transaction history |
| POST | /wallet/topup/initiate | Get a payment card |
| GET | /admin/dashboard | KPIs |
| GET | /admin/clients | All clients |
| PATCH | /admin/clients/{id}/balance | Adjust balance |
| GET | /admin/sessions/active | All live sessions |
| GET | /admin/topups/pending | Unconfirmed top-ups |
| POST | /admin/topups/{id}/confirm | Confirm a payment |
| GET | /admin/inventory | Steam account pool |
| PATCH | /admin/inventory/{id}/status | Change account status |
| GET | /admin/finance?period=7d | Revenue data |
| GET | /admin/stats | Analytics data |
