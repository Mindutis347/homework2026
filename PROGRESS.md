# PROGRESS

_Status as of 2026-11-14, end of session 2. The live deployment was audited at 95/95 in session 1;
the customer support feature added in session 2 is covered by the checks listed under Verification._

Live app: <https://keyforge-blush.vercel.app> · API: <https://keyforge-api-fra.onrender.com/api/health>

Demo accounts: `demo@keyforge.dev` / `Demo#2026` (buyer), `seller1@keyforge.dev` / `Seller#2026`,
`admin@keyforge.dev` / `Admin#2026`. Checkout is simulated: any card works except one ending `0002`.
Verification codes appear in-app (simulated inbox), no e-mail is sent.

---

## 1. Completed features and current state

### Product surface (all live and exercised)

| Area | What works |
|---|---|
| Homepage | 7 blocks fetched from `homepage_blocks` and rendered by `type` (hero, product_carousel, category_tiles, banner). Nothing about the landing page is hardcoded in React. |
| Store | Platform / region / genre / max-price filters, 6 sort modes, pagination, all filter state in the URL so views are shareable. |
| Search | Global dropdown + store results, typo tolerant via `pg_trgm` (`eleden ring` → Elden Ring at 64%, `cyberpuk` → Cyberpunk 2077 at 78%). |
| Product page | Game details, genres, developer/publisher, competing offers from several sellers with platform/region chips, cheapest-offer highlighting, stock. |
| Cart | Add, change quantity (1–10), remove, clear; totals always re-read from live offers, never cached prices. |
| Checkout | Simulated payment, single transaction: idempotency replay, `FOR UPDATE` on offers, `SKIP LOCKED` key allocation, guarded stock decrement, 8% commission recorded per line. Decline path via card ending `0002`. |
| Library | `/account/orders` lists purchases with revealable, copyable keys. |
| Support | `/account/support` files a ticket (subject, reason, optional link to one of your orders) and lists your own tickets with their live status. Reaching it from an order ("Get help with this order") prefills that order. A linked order must belong to the caller, enforced in the insert itself. |
| Auth | Register → 6-digit code (HMAC'd, 15 min TTL) → verify → login; bcrypt cost 12; httpOnly JWT cookie; unverified users blocked from checkout and merchant tools. |
| Merchant portal | Stats, own offers, create/update listing, bulk key upload, catalog title requests. |
| Admin back-office | Users + role changes (verified-only promotion), request approve/reject, sales ledger (gross, commission, payouts, top sellers, 14-day series), orders, support tickets, homepage block CRUD. |

### Backend

- Go with stdlib `net/http` (Go 1.22 method+path routing), `pgx/v5`, hand-written SQL. Three dependencies total: `pgx`, `golang-jwt`, `x/crypto`.
- **43 routes** in `backend/internal/httpx/app.go`; contracts documented in `docs/api.md`.
- Migrations: `0001_init.sql` (13 tables, `pg_trgm` + `citext`, trigram index) and `0002_idempotency_per_user.sql`.
- Design notes and trade-offs: `docs/architecture.md`.

### Database (Neon, branch `production`)

| Object | Count |
|---|---|
| products | 80 (real titles, verified Steam CDN covers) |
| offers (active) | 596 |
| inventory keys (available) | 2,676 |
| accounts | 8 — 1 admin, 1 demo buyer, 6 sellers |
| orders | 4 (all demo buyer, from verification runs) |
| homepage blocks | 7 |
| reference data | 6 platforms, 6 regions, 18 genres |

### Verification in place

- `go build ./...`, `go vet ./...`, `go test ./...` green (auth/crypto, strict JSON + error envelope, CORS, role guards, commission math).
- `backend/internal/httpx/e2e_test.go` walks the whole purchase path against a real database; runs when `TEST_DATABASE_URL` is set (use a Neon branch, not production).
- `npm run build` + `tsc -p tsconfig.app.json --noEmit` clean.
- Live audit: 95 checks across catalog, routing, auth, cart, checkout, RBAC, merchant, admin — **95/95 pass**.
- Ticket changes exercised over HTTP against the `e2e-test` Neon branch: a foreign order id → 404, a
  nonexistent order id → 404, your own order → 201 with the order reference resolved, `category=refund`
  → `refundRequested = true`, the retired `refundRequested` field → 400, anonymous `GET /api/tickets`
  → 401, and one buyer's list never contains another buyer's tickets.

### Repository

`github.com/Mindutis347/homework2026`, branch `main`, 10 commits, 98 tracked files.
Latest: `feat: customer support form with owned-order ticket guard`.

---

## 2. Environment and deployment

| Piece | Detail |
|---|---|
| Frontend | Vercel project `mindex3/keyforge`, production alias **https://keyforge-blush.vercel.app**. Root dir `frontend`, build via `frontend/vercel.json`. |
| API | Render `keyforge-api-fra`, id `srv-dbrmj5e1egvs73cs2m30`, region **frankfurt**, free plan, health check `/api/health`, auto-deploy on `main`. |
| Database | Neon project `summer-boat-90262345` (org `org-green-grass-03578064`), branch `production` (`br-divine-smoke-bb5sxzx2`), Postgres 18, region **aws-us-east-1**. |
| Secrets | `DATABASE_URL` lives in `.env.local` (written by the Neon CLI, gitignored) and in Render env vars. `JWT_SECRET` in `backend/.env` locally and Render in prod. |

Render env vars: `DATABASE_URL`, `JWT_SECRET`, `COOKIE_SECURE=true`, `CORS_ORIGINS`,
`SEED_ON_BOOT=true`, `SHOW_DEV_CODES=true`.

**Same-origin API proxy (important).** `frontend/vercel.json` rewrites `/api/:path*` to the Render
service. The SPA and API are otherwise on different sites, which makes the session cookie
third-party — browsers block those, causing "login succeeds, then every call is 401". The proxy
makes the cookie first-party, removes CORS preflight, and keeps the JWT out of JavaScript. Because
of this, **no `VITE_API_URL` is set on Vercel**; the client uses relative paths.

Local development:

```bash
cd backend && go run ./cmd/api     # :8080, migrates + seeds on boot
cd frontend && npm run dev         # :5173, Vite proxies /api to :8080
```

Deploy: push to `main` → Render rebuilds automatically. Frontend deploys with
`cd frontend && vercel deploy --prod --yes`.

Extra Neon branch `e2e-test` (`br-damp-mountain-bbl14073`) exists for integration tests; `neon.ts`
gives non-default branches a 7-day TTL, so it self-expires.

---

## 3. Known bugs and pending tasks

**No known functional bugs.** The four issues found by the deployment audit and two found while
reading the code are fixed and covered by the 95 checks.

Pending, in order of importance:

1. **Rotate the Render API key.** It was pasted into the agent chat, and that chat is a submission
   artifact. Revoke it at Render → Account Settings → API Keys. Nothing depends on it. (Still open
   as of session 2.)
2. Optional: delete the `e2e-test` Neon branch instead of waiting for its TTL.

One deliberate API change in session 2: `POST /api/tickets` no longer accepts `refundRequested`. The
refund flag is derived from `category == "refund"` server-side, so the queue's refund badge can never
disagree with the category next to it, and sending the old field is now a 400 rather than a silent
no-op. The only client (`frontend/src/api/endpoints.ts`) was updated in the same commit.

Known limitations, deliberately accepted and documented in `docs/architecture.md`:

- Role and verification live in the JWT, so an admin's promotion takes effect on the user's next
  sign-in (`GET /api/auth/me` re-reads the DB, which is how the UI notices).
- Order history loads keys per order (`N+1`); fine at demo scale, one joined query at real scale.
- No rate limiting on `/api/auth/*` — first thing to add before real traffic.
- Render free tier sleeps after ~15 min; first request takes 30–50 s. Reads retry up to 3× with a
  "server is starting up" message; mutations are not retried (checkout is safe via `Idempotency-Key`).
- Postgres is in `aws-us-east-1` while the API is in Frankfurt, so each query pays ~100 ms
  (product page ≈ 0.7 s). Moving the Neon project to `aws-eu-central-1` would fix it (~10 min, reseed).
- Only the production Vercel alias (plus one preview domain) is in `CORS_ORIGINS`; new preview
  deployment hostnames are not, which matters only for direct cross-origin calls.
- Support tickets have a customer-facing form and status list on both sides now, but no message
  thread: an admin cannot reply in-app beyond moving the status, and the buyer sees only that status.
- Four keys from deleted audit orders remain marked `sold` with a null `order_item_id`; harmless,
  not visible in any UI.

---

## 4. Exact next step

The submission log is merged and committed, so only deployment and rotation are left:

```bash
# 1. Revoke the Render API key (Render → Account Settings → API Keys)
# 2. Ship the support feature: Render redeploys the API on push to main,
git push origin main
cd frontend && vercel deploy --prod --yes   # Vercel does not auto-deploy from this repo
```

Then check one ticket in the browser as `demo@keyforge.dev`: `/account/support`, file a request
against an order, and confirm it appears in `/admin/tickets` for `admin@keyforge.dev`.

The assignment deliverables are otherwise complete: repo, public URL, demo accounts, architecture
notes, API reference, and the chat history. If build time remains, the highest-value work is rate
limiting on `/api/auth/*` — the one gap flagged before real traffic.
