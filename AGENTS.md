# AGENTS.md — Eneba Marketplace Internship Assignment

## 1. About Me & Collaboration Context
- **Developer:** Mindaugas (Kaunas, Lithuania)
- **Background:** Hands-on technical problem solver with experience in Customer Support QA, operations automation, Linux/Docker self-hosting, and full-stack web tooling.
- **Goal:** Build a polished, production-grade digital game key marketplace in Eneba's style (`eneba.com`) within a 4-day deadline for a paid internship evaluation.
- **Key Evaluation Constraint:** I must be able to explain every architectural decision and line of code during technical review. Keep code clean, modular, well-structured, and free of unnecessary over-engineering.

---

## 2. Clarification-First Protocol (Mandatory)
- **Start of New Features / Jobs:** Before writing code for any new feature or milestone, ask 2–4 concise, high-impact clarifying questions regarding scope, data fields, UI layout, or edge cases. Wait for my confirmation before executing.
- **Complex Tasks & Major Refactors:** Whenever a task involves database schema changes, authentication/checkout security, multi-file refactoring, or changing deployment configs, pause and present a brief implementation plan + trade-offs for approval first.
- **Trivial Tasks:** Do not ask questions for obvious typos, minor CSS tweaks, or routine bug fixes—execute them directly.

---

## 3. Sub-Agent Delegation Strategy
Use Kimi Code's sub-agent capabilities (`Task` tool) to isolate smaller, parallelizable, or noisy tasks so the main session context stays focused on core architecture:
- **Sub-Agent 1 (Frontend UI & Styling):** Delegate isolated React components, Tailwind Eneba theme tokens (`#4618AC` deep violet palette, `#FAD318` yellow CTAs, responsive product grids), and mock UI states.
- **Sub-Agent 2 (Seed Data & Fixtures):** Delegate generating realistic game catalog JSON/SQL seed files (titles, platforms, regions, multi-seller offers, and dummy digital keys).
- **Sub-Agent 3 (QA & Test Runner):** Delegate writing and executing unit/integration tests, TypeScript type-checks, and API endpoint verification before commits.

---

## 4. Technical Stack & Core Assignment Rules
- **Frontend:** React + TypeScript + Vite + Tailwind CSS (deployed on **Vercel**).
- **Backend:** Go (`net/http` or `Gin`) REST API (deployed on **Render**).
- **Database:** PostgreSQL (with `pg_trgm` extension enabled for typo-tolerant fuzzy search).
- **Zero Hardcoded Homepage Content:** Every block on the Homepage (`hero_banner`, `best_sellers`, `flash_deals`, etc.) MUST be fetched dynamically from backend API endpoints/database tables. Nothing may be hardcoded in React components.
- **Core User Purchase Flow:**
  1. Entry via **Homepage** or **Typo-Tolerant Global Search**
  2. **Store Catalog** (filtering by platform, region, price; sorting; search)
  3. **Product Page** (game details + competing offers from multiple sellers)
  4. **Cart & Auth-Protected Checkout** (sign-in required before payment)
  5. **Simulated Payment & Key Delivery** (atomic DB transaction locking and assigning a digital key to the user's order history)

### User Roles & Lifecycle (RBAC)
1. **Registration & Email Verification (All Users):**
   - Anyone registering starts with role `customer` and `is_verified = false`.
   - Generate a 6-digit verification code stored with an expiration timestamp. For free-tier deployment reliability without external SMTP blocks, return/log the verification code in a simulated email inbox banner/toast (or send via Resend/SMTP if configured) so evaluators can verify accounts immediately without needing real inbox access.
   - Unverified users cannot access checkout or merchant tools.
2. **Customer Account:**
   - Browse store, fuzzy search, compare multi-seller offers, add to cart, complete simulated checkout.
   - **Order History / Library (`/account/orders`):** View all purchased products, order timestamps, seller info, and revealable digital keys.
3. **Merchant Portal (`/merchant`):**
   - Users cannot self-register as merchants; an `admin` promotes a verified `customer` to `merchant`.
   - **Manage Offers & Keys:** Create/edit listings (offers) on existing catalog products, set prices/stock, and bulk-upload digital keys (`XXXX-YYYY-ZZZZ`) into inventory.
   - **Catalog Item Requests:** Submit a `product_request` (title, platform, region, cover image URL, description) when a game isn't in the catalog yet.
4. **Admin Back-Office (`/admin`):**
   - Consolidates webshop management (user/merchant approvals, catalog requests, accounting/sales ledger, customer support tickets/refund flags, and homepage marketing blocks) into one unified back-office dashboard:
     - Promote/demote users between `customer` and `merchant`.
     - Approve or reject merchant `product_request` submissions (auto-creating the catalog product on approval).
     - View platform-wide sales, revenue/commission accounting summary, and order logs.
     - Manage Homepage marketing blocks (create, reorder, toggle visibility).
---

## 5. Pre-Commit Testing & Bug Verification Gate
**NEVER commit or push untested code.** Before running `git commit`, execute this verification checklist:
1. **Frontend Check:** Run `npm run build` and `npx tsc --noEmit` inside the frontend directory to ensure zero TypeScript or bundling errors.
2. **Backend Check:** Run `go test ./...` and `go build ./...` inside the backend directory to verify compilation and handler logic.
3. **End-to-End Smoke Test:** Verify that critical API routes (`/api/homepage`, `/api/products`, `/api/search`, `/api/checkout`) return valid HTTP 200/201 responses and expected JSON shapes.
4. **Fix First:** If any test, linter, or build check fails, resolve the bug completely before staging files.

---

## 6. GitHub, Deployment & Deliverable Logging Rules
- **Atomic Commits:** Commit and push to `origin main` after completing and verifying each milestone (e.g., `feat: add dynamic homepage blocks API`) so Vercel auto-deploys cleanly.
- **Never Commit Secrets:** Ensure `.env`, API keys, and local credentials are listed in `.gitignore`.
- **Mandatory Chat Log Deliverable:** Eneba requires the **full agent conversation history (all prompts and responses) in Markdown (`.md`) format** for evaluation.
  - Keep a `/docs/chat-logs/` folder in the repository (or root `agent-chat-history.md`).
  - Remind me at the end of every major work session to run `/export` and append/save the session log into `agent-chat-history.md` so no prompt history is lost.
