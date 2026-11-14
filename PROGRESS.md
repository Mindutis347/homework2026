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
| Store | Platform / region / genre filters are **multi-select** (URL holds repeated params, so a view with Steam+Xbox and EU+US is shareable), any number of genres, and a **price range** (from/to in euro, both ends optional). The filter panel has its own title search next to the header search, 6 sort modes, and pagination. All filter state lives in the URL. |
| Search | Global dropdown + store results, typo tolerant via `pg_trgm` (`eleden ring` → Elden Ring at 64%, `cyberpuk` → Cyberpunk 2077 at 78%). Title initialisms resolve too, computed in SQL: `gta` → Grand Theft Auto V, `bg3` → Baldur's Gate 3, `rdr2` → Red Dead Redemption 2. |
| Product page | Game details, genres, developer/publisher, competing offers from several sellers with platform/region chips, cheapest-offer highlighting, stock. |
| Cart | Add, change quantity (1–10), remove, clear; totals always re-read from live offers, never cached prices. |
| Checkout | Simulated payment, single transaction: idempotency replay, `FOR UPDATE` on offers, `SKIP LOCKED` key allocation, guarded stock decrement, 8% commission recorded per line. Decline path via card ending `0002`. |
| Library | `/account/orders` lists purchases with per-line key panels (key hidden until "Display key" is pressed, which stamps the display time and permanently withdraws the refund). Every order carries a **Contact support** action, every game a **Report a problem with this game** link, and the page loads your tickets so an order with an open request shows a `support: open/resolved` badge. |
| Support | `/account/support` files a ticket (subject, reason, optional link to one of your orders) and lists your own tickets with their live status. Each ticket opens a **conversation**: both the buyer and the admin can reply and attach up to three pictures (PNG/JPEG/WebP/GIF, 1.5 MB each, sniffed server-side), stored as bytes in Postgres because the API's disk is ephemeral. A staff reply moves the ticket to `in_progress`; a buyer reply reopens a `resolved` one. Reaching it from an order ("Contact support" / "Report a problem with this game") prefills the order and subject. Ownership of a linked order is enforced server-side. |
| Auth | Register → 6-digit code (HMAC'd, 15 min TTL) → verify → login; bcrypt cost 12; httpOnly JWT cookie; unverified users blocked from checkout and merchant tools. |
| Merchant portal | Stats, own offers, create/update listing, bulk key upload, catalog title requests. |
| Admin back-office | Users + role changes (verified-only promotion), request approve/reject, sales ledger (gross, commission, payouts, top sellers, 14-day series), orders, support tickets, homepage block CRUD. |

### Coherent page chrome and the SQL injection audit (session 5)

Every page now opens with the same purple `PageBand` (Store, Cart, Checkout, order confirmation, Library,
Support, Sign in/up, Verify, Admin, Merchant) and every status message goes through one `Notice`
component with info/success/warning/danger tones built on the brand, mint and danger tokens — the
amber/emerald/red one-offs are gone. The important fix was the early returns: empty carts, guest
views and "sign in to see this" screens used to bypass the band entirely and render as bare white
pages. `ErrorNote` now delegates to `Notice`, so an error looks identical everywhere.

SQL injection review of the backend:

| Surface | Finding |
|---|---|
| Query construction | No user input is concatenated into SQL. Every query uses bind parameters (`$1`, `@named`), and array inputs use `= ANY($1)` rather than a built `IN (...)` list |
| `fmt.Sprintf` into SQL | Two sites, both audited: `catalog.go` interpolates only the CTE constant and a sort clause taken from a whitelist map (unknown keys fall back to `popular`); `seed.go` interpolates table/column identifiers, now additionally quoted through `pgx.Identifier{}.Sanitize()` |
| Search and filters | `ILIKE '%' || @term || '%'`, trigram and initialism predicates are all parameterised; the initialism is computed in SQL from the title, never from input |
| Numbers and paths | `minPriceCents`, `page`, `offerId`, order/item ids, quantity are parsed with `strconv`/typed JSON and rejected with 400 before touching SQL |
| Stored payloads | A ticket subject of `'); DROP TABLE support_tickets;--` is stored verbatim and displayed literally in the admin queue |

Probe evidence (local API against the test branch): payloads `' OR 1=1--`, `'; DROP TABLE products;--`,
`' UNION SELECT … FROM users--`, `'); DROP TABLE orders;--` and a hostile `Idempotency-Key` sent
through sort, `q`, platform, region, genre, price, page, search, slug, login e-mail, cart `offerId`,
ticket body, order path and admin search. Every one either returned a normal result, a validation
400/401/404, or was stored as text — no 500s, and afterwards products were still 80, homepage blocks
7, and orders/users/tickets readable.

### Key disclosure and refunds (session 4)

Keys are not part of any page payload. `GET /api/orders` and the checkout response describe keys by
id and display time only; the code arrives from `POST /api/orders/{id}/items/{itemId}/reveal`, which
also stamps `inventory_keys.displayed_at` the first time. That closes the obvious hole in a "show
the key immediately" flow: with values in the initial JSON, anyone could read them from devtools or a
cached response before deciding to ask for a refund. A refund is therefore only possible while a line
is undisclosed, and it is a real reversal rather than a label: the line becomes `refunded`, its keys
return to the offer's pool, `offers.stock` goes back up, and the order totals are recomputed (a fully
refunded order flips to `refunded`). Refunded lines are excluded from the admin ledger, merchant
sales and item counts, so the accounting cannot claim money that went back.

### Visual design (session 3)

Recreated from eneba.com itself, not from memory: I captured the live site and read its computed
styles, so the palette (`#4618AC` chrome, `#1F0A4D` deep surface, `#FAD318` CTA, `#63E3C2` mint),
2px corner radius and 800-weight type are measured values.

| Piece | Detail |
|---|---|
| Tokens | One `@theme` block in `src/index.css`. Metropolis is Eneba's typeface but not freely licensed, so the stack falls back to Figtree (same geometric skeleton, 400–900). |
| Chrome | Two-row purple header — logo, white search, EU·EUR, cart, Log in/Register, then a darker catalogue row whose platform links come from `/api/meta`. Dark violet footer with link columns. |
| Homepage | Full-bleed promo hero, purple platform strip, then product rows on the same purple canvas — sections are transparent, so the body colour shows through exactly as on eneba.com (whose `main` is also transparent over a `#4618AC` body). Product tiles are dark navy with a yellow action bar. Block order stays database-owned; positions were patched through the admin API (hero → platform strip → rows). |
| Components | Yellow uppercase primary buttons, square inputs, 2px cards, small-caps badges, mint "best price" highlight. There are **no white surfaces**: panels, tables, forms and order cards are all dark navy on the purple canvas, with white type and translucent dividers. The app's `ink` ramp is therefore inverted on purpose (ink-900 is white), and `on-accent` exists for type that sits on yellow. Every radius in the app was swept from 8–16px down to 2px, keeping circles only for spinners, the avatar and the cart count. The one intentionally light element is the header search field, which is white on eneba.com too. |

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
- Session 2 live audit after deploying: **48/48 pass** over the deployed API and SPA — public catalog and
  typo search, 404/405 handling, auth, order history with keys, merchant and admin RBAC boundaries,
  every admin collection arriving as an array (the class of bug behind the blank Homepage tab), and
  the support flow end to end: the seller attaching the buyer's order → 404, the retired field → 400,
  a real ticket → 201 with its order reference in the buyer's list, then resolved via the admin PATCH.
- Headless Chrome render check of production, 13 routes, **zero runtime exceptions**: all six admin
  tabs, three merchant tabs, `/account/orders`, `/account/support`, `/cart`, `/checkout`. The admin
  Homepage tab renders 3,659 characters and its Product IDs inputs come prefilled
  (`1`, `1, 3, 2, 6, 4, 5, 8, 50, 7, 11`, …), which is the data-loss half of that bug confirmed fixed.
- After the session-3 redesign the same check was re-run on production: 12 routes render with **zero
  runtime exceptions**, and the mobile layout (390 px) was screenshotted for the homepage and the store.
- Key disclosure verified in production after the session-4 deploy: order payloads carry only
  `{id, displayedAt}`, a reveal returns the code and stamps the time, and refunding afterwards answers
  `409 the key has already been displayed`. The backend e2e also asserts that the key string never
  appears in an order payload, and refunding an undisclosed line restores `offers.stock`.
- Support conversations verified on the session-5 build: **19/19 API checks** (customer and staff
  replies, picture round trip, ownership isolation for read/reply/attachment, non-image rejection by
  sniffing, empty reply and 4-picture limits) and **14/14 in headless Chrome** (real file upload with a
  preview, reply appears and the box clears, admin sees it and answers, customer sees the answer).
  On production: the thread route, picture serving and the reopen rule were exercised against ticket 5.
- Ticket changes exercised over HTTP against the `e2e-test` Neon branch: a foreign order id → 404, a
  nonexistent order id → 404, your own order → 201 with the order reference resolved, `category=refund`
  → `refundRequested = true`, the retired `refundRequested` field → 400, anonymous `GET /api/tickets`
  → 401, and one buyer's list never contains another buyer's tickets.

### Repository

`github.com/Mindutis347/homework2026`, branch `main`, 11 commits, 98 tracked files.
Latest: `fix(admin): blank homepage tab and product detach on save`. Deployed and verified in session 2.

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

Session 2 added the support feature and fixed two bugs found with it:

| Bug | Cause | Fix |
|---|---|---|
| Admin → Homepage was a blank page | `AdminBlocks` read `block.products.length`, but `GET /api/admin/blocks` returns `productIds` with `products: null` (the editor never needs hydrated cards) — a render-time TypeError unmounted the route | A separate `AdminBlock` type exposing `productIds`, plus the backend normalising `products` to `[]` |
| Saving a homepage block would detach its products | Same field: the editor's "Product IDs" input was built from `block.products`, so it rendered empty and saved `productIds: []` | Editor now seeds that input from `block.productIds` |

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
- One production row is audit debris: a support ticket filed by the session-2 buyer (`demo@keyforge.dev`)
  with subject "Live smoke test — support form", left in `resolved`. It exists because verifying the
  support flow end to end needs a real ticket; it is only visible in the back-office queue.

---

## 4. Exact next step

Both Vercel and Render are live and verified, so the only open item is housekeeping:

```bash
# Revoke the Render API key (Render → Account Settings → API Keys). Still open.
```

The assignment deliverables are complete: repo, public URL, demo accounts, architecture notes, API
reference, and the chat history. If build time remains, the highest-value work is rate limiting on
`/api/auth/*` — the one gap flagged before real traffic. After that, ticket message threads (the one
deliberate limitation left in the support feature).
