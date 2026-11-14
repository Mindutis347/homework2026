# PROGRESS

_Status as of 2026-11-14, end of session 2. The live deployment was audited at 95/95 in session 1;
the customer support feature added in session 2 is covered by the checks listed under Verification._

Live app: <https://keyforge-blush.vercel.app> · API: <https://keyforge-api-fra.onrender.com/api/health>

Demo accounts: `demo@keyforge.dev` / `Demo#2026` (buyer), `seller1@keyforge.dev` / `Seller#2026`,
`admin@keyforge.dev` / `Admin#2026`. Checkout is simulated: any card works except one ending `0002`. Taxes are off by default; set them in Admin → Settings.
Verification codes appear in-app (simulated inbox), no e-mail is sent.

---

## 1. Completed features and current state

### Product surface (all live and exercised)

| Area | What works |
|---|---|
| Homepage | 7 blocks fetched from `homepage_blocks` and rendered by `type` (hero, product_carousel, category_tiles, banner). Nothing about the landing page is hardcoded in React. Search is typo tolerant everywhere a product is searched — header, store, merchant product picker and the admin catalogue/blocks picker all rank by trigram similarity. The platform strip uses white transparent SVG logos (`public/logos`, Simple Icons + Font Awesome; the Switch mark is hand-drawn) with initials as a fallback, so the strip stays single-colour on the purple band. The new-releases row is **auto-sourced** (`config.source = "new_releases"`): upcoming titles first by release date, then the most recently released. Titles with a future release date show a `PRE-ORDER` chip on the artwork and “Pre-order” before the name, both computed from the date so they vanish on release day. |
| Store | Platform / region / genre filters are **multi-select** (URL holds repeated params, so a view with Steam+Xbox and EU+US is shareable), any number of genres, and a **price range** (from/to in euro, both ends optional). The filter panel has its own title search next to the header search, 6 sort modes, and pagination. All filter state lives in the URL. |
| Search | Global dropdown + store results, typo tolerant via `pg_trgm` (`eleden ring` → Elden Ring at 64%, `cyberpuk` → Cyberpunk 2077 at 78%). Title initialisms resolve too, computed in SQL: `gta` → Grand Theft Auto V, `bg3` → Baldur's Gate 3, `rdr2` → Red Dead Redemption 2. |
| Product page | Game details, a **content type** marker (full game / DLC / game + DLC) plus an “Includes” line, genres, developer/publisher, competing offers from several sellers with platform/region chips, cheapest-offer highlighting, stock, and a **“You might also like”** row at the bottom: up to 8 cards ranked by shared genres, then popularity. |
| Cart | Add, change quantity (1–10), remove, clear; totals always re-read from live offers, never cached prices. **Guests can shop too**: their cart lives in localStorage and is priced by the server via `POST /api/cart/preview`, then merged into the account cart on sign-in. Hovering the header cart shows the items, the total and a View cart button; sign-in is only required at checkout. |
| Checkout | Simulated payment, single transaction: idempotency replay, `FOR UPDATE` on offers, `SKIP LOCKED` key allocation, guarded stock decrement, 8% commission recorded per line. Decline path via card ending `0002`. |
| Library | `/account/orders` lists purchases with per-line key panels (key hidden until "Display key" is pressed, which stamps the display time and permanently withdraws the refund). Every order shows the tax it paid inline under the total (`incl. €0.25 tax (5%)`) and links to a **printable receipt** at `/account/orders/:id/receipt` — an own-route page with the line items, seller, platform/region, subtotal, tax and total, styled as white paper and printing without the site chrome. Every order carries a **Contact support** action, every game a **Report a problem with this game** link, and the page loads your tickets so an order with an open request shows a `support: open/resolved` badge. |
| Support | `/account/support` files a ticket (subject, reason, optional link to one of your orders) and lists your own tickets with their live status. Each ticket opens a **conversation**: both the buyer and the admin can reply and attach up to three pictures (PNG/JPEG/WebP/GIF, 1.5 MB each, sniffed server-side), stored as bytes in Postgres because the API's disk is ephemeral. A staff reply moves the ticket to `in_progress`; a buyer reply reopens a `resolved` one. Reaching it from an order ("Contact support" / "Report a problem with this game") prefills the order and subject. Ownership of a linked order is enforced server-side. |
| Auth | Register → 6-digit code (HMAC'd, 15 min TTL) → verify → login; bcrypt cost 12; httpOnly JWT cookie; unverified users blocked from checkout and merchant tools. Signing in lands on the homepage unless something sent you there (`/sign-in?next=…`, e.g. checkout); signing out always returns home. |
| Merchant portal | Stats, own offers, create/update listing, bulk key upload, catalog title requests, and a **key inspector** per offer: every code with its status, the order a sold key left on and whether the buyer revealed it, plus batch removal of unsold keys (stock counter follows). |
| Wallet | `/account/wallet`: prepaid balance, card top-up (€1–€500, decline path via `…0002`) and the movement history. Paying at checkout from the wallet skips transaction tax, which is the demo's incentive for topping up. |
| Taxes | Admin sets two rates in percent — one for top-ups, one for card purchases — each with an on/off switch (`/admin/settings`). Tax is never baked into storefront prices; it appears only in the checkout summary and on the receipt. Wallet payments are always tax-free. |
| Admin back-office | Users + role changes (verified-only promotion), request approve/reject, **catalogue editor** (title, copy, art, developer/publisher, release date, content type, genres, visibility — slug stays fixed), sales ledger (gross, commission, payouts, top sellers, 14-day series), orders, support tickets, and a homepage block editor with a **product picker**, collapsed config JSON and a **live preview** of the block. Descriptions support light formatting (bold, italic, lists, headings). |

### Polish round (session 7)

Four small gaps from the walkthrough, plus one thing found while testing them:

- **Back to the cart.** Checkout's order summary has an `Edit cart` link; before this the only
  way to change a quantity was the browser's back button.
- **The guest cart announces its merge.** A toast (new `ToastProvider`, bottom-right, self-dismissing,
  one optional link) says "Guest cart saved — your account cart now holds N items" with a View cart
  link. The merge is also guarded by a ref now, so a StrictMode double-mount cannot merge twice and
  double the quantities.
- **Pictures on the opening request.** The support form can attach up to three pictures before the
  ticket is filed. `CreateTicket` runs in a transaction and stores them on an opening message of its
  own; the thread folds them into the first bubble, so the customer's request and its screenshot read
  as one message on both sides. The reply and the form now share one validation helper
  (`parseAttachments`) and one picker component (`AttachmentField`).
- **Display currency.** Header selector: EUR / USD / GBP, remembered in localStorage. Every price is
  still stored, filtered and charged in euro; the switch is a fixed-rate display conversion, stated as
  such in the cart and at checkout. The store's price range converts the typed amount back to euro
  cents, so a filter of "60 USD" is €55.56, and the wallet top-up plus the admin/merchant ledgers stay
  in euro (`formatEuro`) because those are real accounting figures, not catalogue display.
- **Signing in twice.** `/sign-in` now redirects an already signed-in visitor to `next` instead of
  showing them the form again.

Verified in headless Chrome: **13/13** on the four items (store prices switch to `$` and stay `$`
after filtering, the toast appears with its link, `Edit cart` points at `/cart`, the opening picture
shows inside the first bubble) and **4/4** on the follow-ups (price filter converts 60 USD → 5556 euro
cents, results stay in dollars, no horizontal overflow at 390 px).

### Honest states and honest prices (session 6)

Four pain points from a customer walkthrough:

- **No false empty states.** Library, Support and Wallet used to render "No purchases yet" / "You have
  no orders yet" / a €0.00 balance on the first paint, because the session was still being restored and
  the page treated "no user yet" as "no data". Each page now waits for `authLoading` to settle and shows
  skeletons instead. Measured in headless Chrome: at 500–3500 ms the library shows 3 skeletons and no
  empty state, then 11 orders at 2.5 s (before the fix the same probe saw the empty state at 0.6–3 s).
- **Tax is not a surprise.** The product page and the cart both state, under the price, that card
  payments add the configured purchase tax at checkout and a wallet payment adds none, next to the
  key/refund rule. Both sentences read their rates from `GET /api/meta`, so they follow the admin's
  settings instead of hardcoding 5%.
- **The refund window is visible while it exists.** "Keys stay hidden until you display them, and every
  purchase is refundable up until then" now appears before you buy, not only in the library afterwards.
- **The wallet shows its balance before you pick it.** The checkout wallet option reads
  `€77.03 available · no tax` while still unselected, and selecting it adds a Top up link.

`GET /api/orders` was also rebuilt as a batched loader: the library used to call `LoadOrder` per order
and each `LoadOrder` runs three queries, so 14 orders meant 42 round trips to a remote database
(3.76 s measured). It is now three queries regardless of order count — 0.46 s for the same payload,
byte-identical response. `LoadOrder` delegates to the same loader, so checkout and single-order reads
share one code path.

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

`github.com/Mindutis347/homework2026`, branch `main`, 30 commits, 108 tracked files.
Latest: `docs: merge session 2 into the agent chat log`. Deployed and verified after every milestone.

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

Pending:

1. Optional: delete the `e2e-test` Neon branch instead of waiting for its TTL.
2. Optional: one final `/export` at the end of the current session (see §4).

The Render API key that was pasted into this chat has been **revoked** and every export of the
transcript is key-free (the paste reads "render api key redacted"; 0 occurrences of the key pattern
across the merged log). Both sessions are merged into `agent-chat-history.md`.

One deliberate API change in session 2: `POST /api/tickets` no longer accepts `refundRequested`. The
refund flag is derived from `category == "refund"` server-side, so the queue's refund badge can never
disagree with the category next to it, and sending the old field is now a 400 rather than a silent
no-op. The only client (`frontend/src/api/endpoints.ts`) was updated in the same commit.

Known limitations, deliberately accepted and documented in `docs/architecture.md`:

- Role and verification live in the JWT, so an admin's promotion takes effect on the user's next
  sign-in (`GET /api/auth/me` re-reads the DB, which is how the UI notices).
- Order history is three queries per load (orders, items, keys) — batched in session 6; the merchant
  key inspector and the admin order list still load per row and are fine at demo scale.
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

The key is revoked and the log is merged, so nothing is blocking submission:

```bash
# one last export of the current session, then replace (not append) its section
/export
```

That last point matters: a Kimi export is **cumulative per session**, and session 2 was already
merged as a 943-message snapshot (`…-002300`). A newer export of the same session repeats everything
up to 00:23 and adds the rest, so append it and the conversation appears twice. Either keep the
current snapshot and stop, or `/export`, cut the new body from the "## Session 2" marker and paste
it in place of the existing session-2 block.

With that, the deliverables are complete: repository, public URL, demo accounts, architecture
notes, API reference and chat history. If build time remains, the highest-value work is rate
limiting on `/api/auth/*` — the one gap flagged before real traffic.
