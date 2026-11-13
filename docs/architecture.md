# Architecture and decisions

## Shape

```
React SPA (Vercel)
      │  fetch, cookies (httpOnly JWT)
      ▼
Go API (Render) ── pgx ──▶ PostgreSQL (Neon, pg_trgm)
```

No ORM, no router library, no state manager. Three Go dependencies total:
`pgx` (Postgres driver), `golang-jwt` (sessions), `x/crypto` (bcrypt). Every line
is explainable in a review.

## Catalog model: product → offer → key

The single decision that shapes everything else. A **product** is a *game title*.
An **offer** is one seller's listing of that title at a specific **platform** and
**region** with a price and stock. An **inventory key** is one digital code
belonging to an offer.

Consequences:

- Prices and availability live on offers only. A product card's `minPriceCents` is
  an aggregate, never a stored column, so the catalog can never disagree with the
  product page.
- Platform/region filters narrow *which offers* contribute to the displayed price.
  Filtering to `playstation` never shows a Steam price.
- Multi-seller comparison is real: the same title has several sellers per
  platform/region, and the product page ranks them.

Trade-off: catalog queries need a grouped CTE and `MIN(price)`; a flat
"one row per SKU" table would have been simpler but would make comparison and
filtering shallow, which is exactly where the assignment rewards depth.

## Search

`pg_trgm` GIN index on `products.title`. A query matches when:

```
title ILIKE '%term%'                     -- partial word ("cyberpunk")
OR similarity(title, term) > 0.25        -- typo ("eleden ring")
OR word_similarity(term, title) > 0.6    -- word-level typo
```

Ordering blends `GREATEST(similarity, word_similarity)` with `popularity`, so a
near-exact hit on a famous game outranks a weak match on an obscure one. The
suggestion endpoint returns a match score, which the UI shows as a percentage.
The store list uses the same predicate so the dropdown and the results page can
never disagree.

## Checkout: one transaction, locked keys

`POST /api/checkout` runs inside a single transaction:

1. Replay check on `Idempotency-Key` (unique index) — a double-submit returns the
   original order with `replayed: true` instead of charging twice.
2. Load the cart with `FOR UPDATE OF o` on offers, ordered by `offer_id` so
   concurrent checkouts acquire locks in the same order (no deadlocks).
3. Validate stock per line; a failure aborts before anything is written.
4. Insert `orders` + `order_items` (commission 8% recorded per line, so the admin
   ledger is a `SUM`, not a re-derivation).
5. Allocate keys with `SELECT ... ORDER BY id LIMIT n FOR UPDATE SKIP LOCKED` —
   two buyers hitting the same offer take *different* keys without blocking.
6. Guarded `UPDATE offers SET stock = stock - n WHERE stock >= n`; zero rows
   affected means someone else drained it, so the whole thing rolls back.
7. Clear the cart, update seller stats, commit.

`offers.stock` is a maintained counter for fast filtering; `inventory_keys` is
the source of truth and is what gets locked.

Payment is simulated. `4000 0000 0000 0002` (the Stripe decline test number)
exercises the failure path; everything else settles. Swapping in a real provider
touches only the `declined`/settle step.

## Auth

- Registration creates `role = customer`, `is_verified = false`.
- A 6-digit code is generated with `crypto/rand`, stored as an **HMAC-SHA256 of
  the code keyed by the JWT secret** (with a 15-minute expiry), and "delivered"
  to an `email_outbox` table. With `SHOW_DEV_CODES=true` the API echoes the code
  and `/api/dev/inbox` exposes the simulated mailbox, so an evaluator can verify
  an account without SMTP. Production would set `SHOW_DEV_CODES=false` and wire a
  real sender; nothing else changes.
- Passwords: bcrypt cost 12. Login returns the same error for unknown e-mail and
  wrong password (no account enumeration).
- Sessions: HS256 JWT in an `httpOnly`, `SameSite`, `Secure` cookie. The SPA
  never reads the token, so XSS cannot exfiltrate it. `COOKIE_SECURE=true` in
  production flips `SameSite` to `None`, which is required because the SPA
  (Vercel) and API (Render) are different sites.

Trade-off: role and verification state live in the JWT, so a promotion takes
effect on next sign-in. `GET /api/auth/me` re-reads the user, which is how the UI
picks up a role change immediately. A session table would allow instant
revocation at the cost of a query per request — not worth it here.

## RBAC

| Role | Can |
|---|---|
| `customer` | browse, search, cart, checkout (verified only), own order history, support tickets |
| `merchant` | everything a customer can, plus `/api/merchant/*`: own offers, key uploads, catalog requests, own sales |
| `admin` | everything, plus `/api/admin/*`: users and roles, request approval, platform ledger, tickets, homepage blocks |

Nobody self-registers as a merchant: only an admin promotes a verified customer,
and the promotion creates the seller profile.

Route guards are composed once (`authUser`, `verifiedUser`, `merchantOnly`,
`adminOnly`) so the route table reads as a policy summary.

## Homepage

`homepage_blocks` rows drive the landing page: `type` selects the renderer
(`hero`, `product_carousel`, `category_tiles`, `banner`), `config` (JSONB) holds
copy/CTAs/tiles, `position` orders them, `is_visible` toggles them, and
`homepage_block_products` curates product membership. The React page renders
whatever arrives, in the order it arrives. Admins edit blocks in the back-office;
seeding chose memberships with SQL over real offer data so a block can never
reference an unavailable product.

## Data model

| Table | Purpose |
|---|---|
| `users`, `seller_profiles` | accounts, roles, merchant storefronts |
| `platforms`, `regions`, `genres` | filter vocabulary (served via `/api/meta`) |
| `products`, `product_genres` | game titles |
| `offers` | seller listings: price, compare-at price, stock |
| `inventory_keys` | digital codes, `available`/`sold`, locked at checkout |
| `cart_items` | per-user basket (prices always re-read from offers) |
| `orders`, `order_items` | purchases + immutable snapshots incl. commission |
| `homepage_blocks`, `homepage_block_products` | marketing content |
| `product_requests` | merchant proposals awaiting admin review |
| `support_tickets` | refund/delivery tickets with a status lifecycle |
| `email_outbox` | simulated e-mail delivery |

## Error handling

One envelope everywhere: `{"error": {"code": "...", "message": "..."}}`.
Handlers return `*httpx.APIError`; `WriteError` also maps `repo.ErrNotFound` to
404 and never leaks internal error text (verified by test).

## Frontend

- `src/api/*` is the only place that touches the network: one typed function per
  endpoint, `credentials: 'include'`, error normalisation into `ApiClientError`,
  and a small retry for reads that hit a cold-starting free instance.
- Context providers for auth and cart; everything else is local state.
- The store keeps filters in the URL, so any view is shareable and Back works.
- Design tokens live once in `src/index.css` under `@theme`; components consume
  token classes only. They were sampled from eneba.com's rendered styles: brand
  `#4618AC`, deep surface `#1F0A4D`, CTA yellow `#FAD318`, mint `#63E3C2`, 2px
  corners and an 800-weight geometric sans. Metropolis is Eneba's real typeface
  but is not freely licensed, so the stack falls back to Figtree, chosen for the
  same geometric skeleton and full 400–900 weight range.
- The chrome follows Eneba's layout: a brand-purple utility row (logo, search,
  account) above a darker catalogue row whose platform links come from
  `/api/meta`, a full-bleed promo hero, a purple platform strip, then white
  slices of dark product tiles with yellow action bars. Homepage block order is
  database-owned; changing the layout means editing block positions, not code.

## Deployment topology (and the cookie trap)

The SPA is on Vercel, the API on Render, the database on Neon. That is three
origins, which matters for auth: a cookie set by `*.onrender.com` and read from
`*.vercel.app` is a **third-party cookie**, and browsers now block those by
default. The symptom is subtle — login returns 200, the UI looks signed in, then
every authenticated request is a 401 because the cookie was never stored.

The fix in this repo is a Vercel rewrite in `frontend/vercel.json`:

```
/api/:path*  ->  https://keyforge-api-fra.onrender.com/api/:path*
```

Now the browser talks to a single origin. Benefits:

- the `HttpOnly` cookie is first-party, so it is stored and sent normally;
- no CORS preflight on any request (the server-to-server hop is not subject to it);
- the JWT never reaches JavaScript, so XSS still cannot exfiltrate it.

Costs: API traffic passes through Vercel's edge, and a cold Render instance can
surface as a 502/503/504 at the proxy, which is why `src/api/client.ts` retries
reads a couple of times with a "server is starting up" message. Mutating calls
are never retried automatically; `POST /api/checkout` is safe regardless because
of the `Idempotency-Key`.

CORS is still configured on the API (`CORS_ORIGINS`) so the Render URL remains
usable directly by curl, Postman or a native client.

## Known limits

- Payment is simulated by design (assignment allows it).
- No refresh-token rotation; a session simply expires after 7 days.
- No rate limiting on auth endpoints — the first thing to add for production.
- Order history loads keys per order in a loop (`N+1`) because order counts in a
  demo are tiny; a single joined query would be the fix at scale.
