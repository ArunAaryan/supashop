# Phase 6: Dashboard Analytics, Customers, Security, and E2E — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out the MVP with an operational dashboard and low-stock reporting, a customer directory, rate limiting and security hardening, Playwright end-to-end coverage, accessibility fixes, and a production deploy runbook.

**Architecture:** Add a read-only analytics module that aggregates order/offering rows in the store's configured timezone, guarded by the existing `analytics:read` permission. Add a `customer:read` permission and a customer directory over the Better Auth `user` + `customer_address` + `commerce_order` tables. Add a best-effort in-memory rate limiter for sensitive routes. Introduce Playwright for critical end-to-end flows. Extend the React CMS with a dashboard and customers pages, reusing TanStack Table and the existing design tokens.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, React Router, TanStack Query, TanStack Table, Zod, Hono, Drizzle ORM, Cloudflare Workers, D1, Vitest, Cloudflare Vitest pool, Testing Library, Playwright.

---

## Scope (from approved design)

Phase 6 covers §8.1 (dashboard and analytics), §5.2 (`/cms/customers`, `/cms/analytics`), §12.1 (`user_profile` — see decision 3), §15 (security and privacy), §16 (low-stock dashboard indicators, complete audit trail), §17.4 (E2E), and §18 (deployment and operations).

## Open design decisions (confirm before execution)

1. **Rate limiting.** Cloudflare Workers isolates have no shared memory, so a true cross-request limiter needs KV or a Durable Object. Recommended for MVP: a **best-effort in-memory sliding-window limiter** (per-isolate, adequate for local/small scale) applied to auth and sensitive routes (`/checkout`, `/cancel`, `/transition`, `/verify`), with the production path to a KV-backed limiter documented in the runbook. Add a `429` `ApiError` code.
2. **Dashboard charts.** Use **dependency-free CSS/SVG bars and sparklines** rather than adding a chart library; the dashboard is a small fixed set of cards.
3. **`user_profile`.** The design lists `user_profile` for customer details. Better Auth's `user` already carries `name`/`email`/`created_at`; `customer_address` links to it. Recommended: **defer `user_profile`** and build `/cms/customers` directly from `user` + `customer_address` + `commerce_order` (name, email, address count, order count, total delivered). Add `user_profile` only if classification fields become required.
4. **E2E scope.** Cover the five highest-value flows (see Task 9); a full suite would be out of proportion for a single store.

---

## File Structure

```text
src/
├── shared/contracts/analytics.ts        # new: dashboard + low-stock + customer schemas
├── worker/
│   ├── auth/permissions.ts              # add customer:read
│   ├── http/errors.ts                   # add RATE_LIMITED code (429)
│   ├── http/rate-limit.ts               # new: sliding-window limiter middleware
│   └── modules/
│       ├── analytics/
│       │   ├── analytics-repository.ts  # timezone-aware aggregates
│       │   ├── analytics-service.ts
│       │   └── analytics-routes.ts      # GET /api/cms/analytics/overview, /low-stock, /queue
│       └── customers/
│           ├── customers-repository.ts
│           ├── customers-service.ts
│           └── customers-routes.ts      # GET /api/cms/customers, /api/cms/customers/:userId
└── react-app/
    ├── features/
    │   ├── analytics/
    │   │   ├── analytics-api.ts
    │   │   └── dashboard-page.tsx       # /cms dashboard
    │   └── customers/
    │       ├── customers-api.ts
    │       └── customers-page.tsx       # /cms/customers
    └── app/router.tsx                   # /cms dashboard + /cms/customers
e2e/                                     # Playwright specs
docs/DEPLOY.md                           # production deploy runbook
```

---

## Task 1: Analytics contracts

**Files:** create `src/shared/contracts/analytics.ts` (+ `analytics.test.ts`).

Schemas: `analyticsOverviewSchema` (ordersToday, ordersThisWeek, deliveredRevenueMinor, unitsSold, averageOrderValueMinor, cancellationCount, cancellationRateBasisPoints, orderCount, deliveredCount), `topOfferingSchema` (offeringId, productName, offeringLabel, unitsSold), `lowStockOfferingSchema` (offeringId, productName, offeringLabel, stockQuantity, lowStockThreshold), `queueOrderSchema` (reuse `orderSchema`), `customerSummarySchema`, `customerDetailSchema`.

- [ ] Write failing contract tests for the round-trip of each schema and integer (minor-unit) enforcement.
- [ ] Implement the schemas (all money uses `z.number().int().nonnegative()`).
- [ ] Commit.

## Task 2: Timezone-aware date helper

**Files:** create `src/worker/modules/analytics/timezone.ts` (+ test).

Implement `localDayRangeUtc(timezone: string, now: Date): { start: number; end: number }` and `localDayCountUtc(timezone: string, days: number, now: Date): { start: number }` using `Intl.DateTimeFormat` offset computation (the same `en-CA`/`formatToParts` technique already used in `shared/domain/fulfillment.ts`). This must handle DST boundaries correctly by computing the offset at the start of the local day.

- [ ] Write failing tests for a fixed instant in `Asia/Kolkata` (UTC+5:30) and a DST-observing zone.
- [ ] Implement, verify tests pass, commit.

## Task 3: Analytics repository + service + routes

**Files:** create `src/worker/modules/analytics/{analytics-repository,analytics-service,analytics-routes}.ts`.

Repository aggregates (SQL against `commerce_order`, `order_item`, `offering`, `product`):
- Orders today / this week (placed within the UTC range from Task 2).
- Delivered revenue = `sum(total_minor)` where `status = 'delivered'` (COD collected), within range.
- Units sold = `sum(order_item.quantity)` joined to delivered orders.
- Average order value = delivered revenue / delivered count.
- Cancellation count and rate = cancelled orders / total orders.
- Top offerings = delivered order items grouped by offering, top 5.
- Low stock = active offerings where `stock_quantity <= low_stock_threshold`.
- Live queue = the most recent `placed`/`confirmed` orders (needs attention).

Routes (guarded `analytics:read`):
- `GET /api/cms/analytics/overview`
- `GET /api/cms/analytics/low-stock`
- `GET /api/cms/analytics/queue`

- [ ] Write repository integration tests against a seeded D1 (orders across two local days, delivered vs cancelled) asserting timezone correctness and minor-unit integers.
- [ ] Implement repository/service/routes; wire into `app.ts`.
- [ ] Commit.

## Task 4: Dashboard UI

**Files:** create `src/react-app/features/analytics/{analytics-api,dashboard-page}.tsx`; modify `router.tsx` (`/cms` → `DashboardPage`).

Dashboard cards (from overview): orders today/this week, delivered revenue, units sold, AOV, cancellation count/rate. Below: top offerings bar list, low-stock list, and the live order queue (link each to `/cms/orders/:orderNumber`). Use `formatMoney`, dependency-free bars, and the existing card/token styling. For the `delivery` role, keep the delivery queue as `/cms/deliver` (already wired) and let `/cms` render the dashboard only for roles with `analytics:read`.

- [ ] Write Testing Library tests: cards render from a mocked overview; low-stock and queue lists link correctly.
- [ ] Implement, commit.

## Task 5: Customer directory

**Files:** add `customer:read` to `permissions.ts` (owner/admin/operations); create `src/worker/modules/customers/*` and `src/react-app/features/customers/*`; wire `/cms/customers` + `/cms/customers/:userId`.

`GET /api/cms/customers` returns a paginated, searchable list (name/email) with order count and total delivered; `GET /api/cms/customers/:userId` returns the customer plus their orders and saved addresses. Search never exposes exact-email lookup beyond the authenticated CMS caller (§15).

- [ ] Write route tests: `403` for `delivery`, list/search works, detail includes orders.
- [ ] Implement repository/service/routes + the customers page (TanStack Table).
- [ ] Commit.

## Task 6: Rate limiting

**Files:** create `src/worker/http/rate-limit.ts`; extend `src/worker/http/errors.ts` with a `RATE_LIMITED` (429) code; apply middleware to `/api/checkout`, `/api/orders/:orderNumber/cancel`, `/api/cms/orders/:orderNumber/transition`, `/api/cms/delivery/orders/:orderNumber/verify`.

A sliding-window limiter keyed by `ownerKey` (or `user.id`/`guestId`) with a per-route budget (e.g., checkout 10/min, transitions 30/min). Because isolates are ephemeral, document this as best-effort and add the KV-backed upgrade path to the runbook.

- [ ] Write tests asserting `429` after exceeding the budget and that different keys are isolated.
- [ ] Implement, commit.

## Task 7: Security hardening sweep

**Files:** review `auth/`, `http/`, `modules/` for the §15 checklist.

Verify and, where missing, add: HttpOnly/SameSite cookies, Better Auth CSRF/origin checks enabled, no public CMS registration, server-side authz on every CMS route, no exact-email exposure in public APIs, PII excluded from logs and QR payloads, and R2 upload validation. Add correlation IDs to `500` responses (already partially present via `requestId`).

- [ ] Write tests for any gap found (e.g., a public endpoint that leaks an exact email, if any).
- [ ] Fix gaps, commit.

## Task 8: Accessibility pass

**Files:** sweep `react-app/` for the §17.4 checklist.

Audit keyboard navigation, focus visibility, labels, contrast, and reduced-motion support across the customer and CMS shells, forms, the order queue/detail, and delivery flow. Fix concrete violations (e.g., missing `aria-label` on icon-only controls, missing focus rings).

- [ ] Fix identified issues with accompanying Testing Library `toBeVisible`/focus assertions where practical.
- [ ] Commit.

## Task 9: Playwright E2E

**Files:** add `@playwright/test` dev dependency + `playwright.config.ts` + `e2e/` specs.

Cover five flows against a locally running app (`pnpm dev`):
1. Register → browse → add to cart → guest/registered checkout → order placed.
2. Repricing/out-of-stock recovery at checkout (409 → review cart).
3. Customer cancel + reorder.
4. CMS acknowledge → prepare → ready → out_for_delivery → delivery PIN verify → delivered.
5. Responsive delivery-role layout.

- [ ] Add the `e2e` script to `package.json`; write the specs; run them locally.
- [ ] Commit.

## Task 10: Deploy runbook

**Files:** create `docs/DEPLOY.md`; update `README.md` status to Phase 1–6.

Document: production secrets (`BETTER_AUTH_SECRET`, etc.), applying migrations (`wrangler d1 migrations apply supashop-db --remote`), R2 bucket creation, the deploy command, observability/logs, correlation IDs, and the rate-limiter production note.

- [ ] Commit.

---

## Verification

End of Phase 6: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:worker && pnpm build && pnpm exec wrangler deploy --dry-run` all exit `0`; Playwright specs pass against the local app; the dry run reports valid `DB` and `MEDIA` bindings; the README reflects Phase 1–6.

## Success criteria (MVP complete when)

- A guest or registered customer can place a valid COD order without overselling.
- CMS staff can manage catalog, inventory, orders, and view analytics.
- Delivery staff can complete a delivery with QR/PIN.
- Cancellation restores stock exactly once.
- Dashboard metrics match delivered-order data in the store timezone.
- Permission, concurrency, and responsive/accessibility tests pass.
