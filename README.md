# Keyforge — a digital game key marketplace (Eneba internship assignment)

A production-shaped marketplace for digital game keys: browse the catalog, search with typos,
compare offers from several sellers, check out, and get an instant key — plus a merchant portal
for sellers and an admin back-office for the platform.

- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS (Vercel)
- **Backend:** Go (stdlib `net/http`) + `pgx/v5`, hand-written SQL (Render)
- **Database:** PostgreSQL (Neon) with the `pg_trgm` extension

## Repository layout

```
backend/
  cmd/api/            entry point
  internal/config/    environment configuration
  internal/db/        connection pool, migration runner, seed
  internal/auth/      password hashing, JWT, verification codes
  internal/models/    domain structs and API payloads
  internal/repo/      SQL data access, one file per aggregate
  internal/service/   checkout transaction, search ranking
  internal/httpx/     router, middleware, JSON helpers
  migrations/         ordered .sql files, applied on boot
frontend/
  src/features/       home, store, product, search, cart, checkout, account, merchant, admin
  src/api/            typed fetch client
docs/chat-logs/       full agent conversation history (assignment deliverable)
```

## Running locally

```bash
# backend
cd backend
cp .env.example .env      # then set DATABASE_URL / JWT_SECRET
go run ./cmd/api          # migrates + seeds on boot, serves :8080

# frontend
cd frontend
npm install
npm run dev               # http://localhost:5173
```

## API surface

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/health` | — | liveness + DB ping |
| GET | `/api/homepage` | — | all visible homepage blocks with resolved products |
| GET | `/api/products` | — | catalog: search, platform/region/genre/price filters, sort, pagination |
| GET | `/api/products/{slug}` | — | product detail + offers grouped by platform/region |
| GET | `/api/search` | — | fuzzy search (trigram) with suggestions |
| POST | `/api/auth/register` | — | create account, issues verification code |
| POST | `/api/auth/verify` | — | confirm 6-digit code |
| POST | `/api/auth/login` | — | sets httpOnly session cookie |
| POST | `/api/auth/logout` | user | clears cookie |
| GET | `/api/auth/me` | optional | current user |
| GET/POST/PATCH/DELETE | `/api/cart` | user | cart contents |
| POST | `/api/checkout` | verified user | simulated payment, atomic key delivery |
| GET | `/api/orders` | user | order history with keys |

Merchant and admin routes are documented in `docs/api.md`.

## Design notes

Architecture and trade-off decisions are written up in [`docs/architecture.md`](docs/architecture.md).
