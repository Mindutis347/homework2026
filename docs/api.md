# API reference

Base URL: `http://localhost:8080` in development (Vite proxies `/api`), the Render
URL in production. All responses are JSON. Errors use:

```json
{ "error": { "code": "not_found", "message": "resource not found" } }
```

Auth is a `kf_session` httpOnly cookie set by login/verify. `credentials: 'include'`
is required from the browser.

## Public

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | liveness + DB ping |
| GET | `/api/meta` | platforms, regions, genres, price range |
| GET | `/api/homepage` | visible blocks with resolved products |
| GET | `/api/products` | `q, platform, region, genre, contentType, minPriceCents, maxPriceCents, sort, page, pageSize`. `platform`, `region` and `genre` are repeatable (or comma-separated) and match **any** of the supplied values; `contentType` is one of `full`, `dlc`, `both`; `minPriceCents`/`maxPriceCents` bound the product's cheapest offer |
| GET | `/api/products/{slug}` | product detail + competing offers |
| GET | `/api/search?q=&limit=` | fuzzy suggestions with match scores: trigrams tolerate typos (`eleden ring`), prefix/`ILIKE` catches partial names (`cyberpu`), and title initialisms resolve abbreviations (`gta`, `bg3`, `rdr2`) |

`sort` accepts `popular` (default), `relevance`, `price_asc`, `price_desc`,
`newest`, `discount`, `title`. Prices are integer cents.

## Authentication

| Method | Path | Body |
|---|---|---|
| POST | `/api/auth/register` | `{email, password, displayName}` → `{user, devCode?}` |
| POST | `/api/auth/verify` | `{email, code}` → `{user}` + session cookie |
| POST | `/api/auth/resend` | `{email}` → `{status, devCode?}` |
| POST | `/api/auth/login` | `{email, password}` → `{user}` + session cookie |
| POST | `/api/auth/logout` | clears cookie |
| GET | `/api/auth/me` | `{user}` or `{user: null}` |
| GET | `/api/dev/inbox?email=` | newest simulated e-mail (when `SHOW_DEV_CODES=true`) |

## Cart (signed in)

| Method | Path | Body |
|---|---|---|
| POST | `/api/cart/preview` | **public**. `{items:[{offerId,quantity}]}` → a priced cart. Guests keep their cart in the browser and the server prices it, so the client never decides a price |
| POST | `/api/cart/merge` | signed in. folds a guest cart into the account cart after sign-in |
| GET | `/api/cart` | — |
| POST | `/api/cart` | `{offerId, quantity}` |
| PATCH | `/api/cart/{offerId}` | `{quantity}` |
| DELETE | `/api/cart/{offerId}` | — |
| DELETE | `/api/cart` | clears the cart |

## Checkout & orders

| Method | Path | Notes |
|---|---|---|
| POST | `/api/checkout` | verified users only. Header `Idempotency-Key`. Body `{cardNumber?, method?}`. 201 new order, 200 replayed, 402 decline, 409 out of stock |
| GET | `/api/orders` | own order history. Items carry key **metadata** (`id`, `displayedAt`) and never a key value |
| GET | `/api/orders/{id}` | one order (404 unless you own it) |
| POST | `/api/orders/{id}/items/{itemId}/reveal` | returns `{keys, displayedAt}` for that line and stamps the first display. The only response that carries a key value |
| POST | `/api/orders/{id}/items/{itemId}/refund` | refunds an undisplayed line, returns the recomputed order. 409 once a key has been displayed |
| POST | `/api/tickets` | verified users only. `{subject, body, category, orderId?}`; `category` is one of `refund`, `delivery`, `account`, `other` and drives the refund flag. 404 when `orderId` is not one of your own orders |
| GET | `/api/tickets` | your own support tickets with their status, newest first |
| GET | `/api/tickets/{id}` | one conversation: `{thread: {ticket, messages}}`. Customers see only their own tickets; an admin sees any |
| POST | `/api/tickets/{id}/messages` | `{body, attachments:[{mime, data}]}` — reply as the customer, or as staff when the caller is an admin. Max 3 pictures, 1.5 MB each, PNG/JPEG/WebP/GIF sniffed server-side. A staff reply moves `open` → `in_progress`; a customer reply reopens `resolved` → `open` |
| GET | `/api/tickets/attachments/{id}` | the picture bytes, only for the ticket's owner or an admin |

## Merchant (`merchant` or `admin`, verified)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/merchant/stats` | offers, keys, revenue, payout |
| GET | `/api/merchant/offers` | own listings with key counts |
| POST | `/api/merchant/offers` | `{productId, platformSlug, regionCode, priceCents, basePriceCents?, isActive?}` (upsert) |
| POST | `/api/merchant/offers/{id}/keys` | `{bulk}` or `{codes: []}` → `{inserted, skipped}` |
| GET | `/api/merchant/sales` | last 25 sold lines |
| GET | `/api/merchant/products?q=` | product picker |
| GET | `/api/merchant/requests` | own catalog proposals |
| POST | `/api/merchant/requests` | `{title, description, coverUrl, platformSlug, regionCode, contentType}` — contentType is `full`, `dlc` or `both` and becomes the product's type on approval |

## Admin (`admin`, verified)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/admin/users?q=` | accounts with spend |
| PATCH | `/api/admin/users/{id}/role` | `{role: customer\|merchant\|admin}`; self-demotion blocked |
| GET | `/api/admin/requests?status=` | proposals |
| POST | `/api/admin/requests/{id}/review` | `{approve, note}`; approval creates the product |
| GET | `/api/admin/summary` | gross, commission, payouts, top sellers, 14-day series |
| GET | `/api/admin/catalog?q=` | catalogue entries with their editable fields, offer count and genres; hidden products included |
| PATCH | `/api/admin/catalog/{id}` | `{title, description, coverUrl, heroUrl, developer, publisher, releaseDate, contentType, isActive, genres}`. The slug is fixed; setting `isActive:false` removes it from the storefront |
| GET | `/api/admin/orders` | platform-wide orders |
| GET | `/api/admin/tickets?status=` | support queue |
| PATCH | `/api/admin/tickets/{id}` | `{status: open\|in_progress\|resolved}` |
| GET | `/api/admin/blocks` | all homepage blocks incl. hidden |
| POST | `/api/admin/blocks` | `{key, type, title, subtitle, config, position, isVisible, productIds}` |
| PATCH | `/api/admin/blocks/{id}` | same body as create |
| DELETE | `/api/admin/blocks/{id}` | 204 |
