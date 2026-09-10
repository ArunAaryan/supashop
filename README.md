# Supashop

Supashop is a single-store delivery application built with React, Hono, Cloudflare Workers, D1, and R2. Each deployed instance represents exactly one physical store or warehouse. It has no organizations, tenants, or multi-store administration.

## Phase 1–5 status

Phases 1 through 5 establish the application, catalog, storefront, cart, ordering, and fulfilment foundation:

- Better Auth email/password registration and sign-in, plus signed guest browser sessions.
- Server-enforced CMS roles (`owner`, `admin`, `operations`, and `delivery`) and role-aware React shells.
- A singleton store profile with contact information, address, serviceable postal codes, opening hours, exceptional closure dates, and optimistic-concurrency updates.
- Flat categories and tags, product master records, sellable offerings, and server-driven CMS lists.
- Ordered product galleries stored in R2, with up to five images per product and a 5 MiB limit per image.
- Offering-level inventory with optimistic concurrency and an immutable manual-adjustment ledger.
- Anonymous catalog browse, detail, filter, sort, pagination, and search APIs.
- A responsive customer storefront with category browsing, URL-driven search and filters, product galleries, offering selection, and live availability.
- Persistent registered and signed-guest carts with authoritative current pricing, visible price/stock changes, quantity controls, and guest-to-account merge after authentication.
- Saved customer addresses with a single default per account.
- Checkout-time serviceability validation against store hours, order cut-off, serviceable postal codes, and exceptional closure dates.
- Atomic cash-on-delivery checkout that verifies current prices, activity, and stock server-side, with idempotency-key replay protection and stock deduction in the same D1 transaction as the order snapshot.
- Immutable order snapshots (items, prices, and address), customer order history, and guest order access scoped to the originating browser session.
- Customer cancellation while an order is `placed` or `confirmed`, with exactly-once stock restoration.
- Reorder of previously purchased items with per-line availability handling.
- A CMS order queue with search and status filtering, acknowledgement with an expected delivery time, and the `placed → confirmed → preparing → ready → out_for_delivery → delivered` fulfilment flow with valid, reason-gated transitions.
- CMS cancellation and rejection of undelivered orders, restoring stock exactly once.
- One-time, expiring delivery proof: the customer sees an opaque QR token and six-digit PIN while the order is `out_for_delivery`; delivery staff verify it to mark the order delivered and COD collected.
- A delivery-role mobile queue for completing drop-offs.
- An immutable operational audit trail recording every order transition and delivery completion.

Dashboard analytics, low-stock reporting, accessibility/security hardening, and end-to-end coverage remain future phases. The product direction is cash on delivery only; it does not include online payments or live delivery/GPS tracking.

## Requirements

- Node.js `^22.12.0 || >=24.0.0` (see `package.json`).
- pnpm 11 (the repository pins `pnpm@11.20.0` through the `packageManager` field).

Enable Corepack if pnpm 11 is not already active:

```bash
corepack enable
corepack prepare pnpm@11.20.0 --activate
```

## Local setup

Install dependencies, create local-only variables, apply the local D1 schema, then start Vite:

```bash
pnpm install
cp .dev.vars.example .dev.vars
openssl rand -base64 32
pnpm db:migrate:local
pnpm dev
```

Paste the generated value into `BETTER_AUTH_SECRET` in `.dev.vars`; leave `BETTER_AUTH_URL` set to the local Vite URL unless the local host or port changes. Do not commit `.dev.vars` or reuse its secret in another environment. Wrangler loads `.dev.vars` for local development; local secrets are deliberately kept out of `wrangler.json`.

Open [http://localhost:5173](http://localhost:5173), choose **Create account**, and register the exact email that will become the initial owner. Passwords must be at least eight characters. Do not grant an owner role until that registration succeeds.

Local development uses Wrangler's local R2 emulation for product images; no remote bucket is created or changed by the setup commands.

`pnpm db:migrate:local` is explicit about `--local`, so it migrates Wrangler's local persisted D1 database. It creates no remote D1 or R2 resource. If a clean local database is needed, remove the relevant local Wrangler state only after confirming the target path; do not run the remote commands below by accident.

## Initial owner provisioning

This is an instance-setup operation, not an application feature. It grants the `owner` CMS role to one already-registered, exact email only when **no active owner exists**. It does not create a user, transfer ownership, or overwrite an existing role.

1. Create three temporary files with an editor: `preflight-initial-owner.sql`, `grant-initial-owner.sql`, and `verify-initial-owner.sql`. Keep them out of Git.
2. Replace only `owner@example.test` in every query below with the exact registered email. This is an SQL string literal, not a shell argument. If the email contains an apostrophe, escape it for SQLite by doubling it (`'` becomes `''`). Do not use command substitution, `echo`, or variable interpolation to construct the SQL.
3. Run the two preflight queries first. Continue only if the registered-user query returns exactly one matching email and the active-owner query returns zero rows.
4. Run the guarded grant statement. It inserts no row if an active owner appears between the preflight and the insert, or if the selected user already has a CMS role.
5. Run the verification query. It must show exactly one active `owner` for the requested email before that person uses `/cms/settings/store`.

```sql
-- preflight-initial-owner.sql
-- Preflight: the result must be exactly one already-registered account.
SELECT id, email
FROM user
WHERE email = 'owner@example.test';

-- Preflight: the result must contain no rows.
SELECT u.email, r.role, r.active
FROM cms_role AS r
JOIN user AS u ON u.id = r.user_id
WHERE r.role = 'owner' AND r.active = 1;
```

```sql
-- grant-initial-owner.sql
-- The stable role id makes a retry deterministic for this user. The guards make
-- this an initial-owner grant only; no row is inserted in every other case.
INSERT INTO cms_role (
  id,
  user_id,
  role,
  active,
  granted_by,
  created_at,
  updated_at
)
SELECT
  'owner:' || u.id,
  u.id,
  'owner',
  1,
  NULL,
  CAST(unixepoch('subsecond') * 1000 AS INTEGER),
  CAST(unixepoch('subsecond') * 1000 AS INTEGER)
FROM user AS u
WHERE u.email = 'owner@example.test'
  AND NOT EXISTS (
    SELECT 1
    FROM cms_role AS active_owner
    WHERE active_owner.role = 'owner' AND active_owner.active = 1
  )
  AND NOT EXISTS (
    SELECT 1
    FROM cms_role AS existing_role
    WHERE existing_role.user_id = u.id
  );
```

```sql
-- verify-initial-owner.sql
-- Verification: expect exactly one row, for the exact requested email.
SELECT u.email, r.role, r.active
FROM cms_role AS r
JOIN user AS u ON u.id = r.user_id
WHERE r.role = 'owner'
  AND r.active = 1
  AND u.email = 'owner@example.test';
```

Use one explicit Wrangler target:

```bash
# Local only: targets the D1 database used by `pnpm dev`. Run each file in order.
pnpm exec wrangler d1 execute supashop-db --local --file ./preflight-initial-owner.sql
pnpm exec wrangler d1 execute supashop-db --local --file ./grant-initial-owner.sql
pnpm exec wrangler d1 execute supashop-db --local --file ./verify-initial-owner.sql

# Remote only: targets an existing, intentionally configured Cloudflare D1 database.
# Do not run this while setting up locally, and do not use it to create a resource.
pnpm exec wrangler d1 execute supashop-db --remote --file ./preflight-initial-owner.sql
pnpm exec wrangler d1 execute supashop-db --remote --file ./grant-initial-owner.sql
pnpm exec wrangler d1 execute supashop-db --remote --file ./verify-initial-owner.sql
```

Without `--local`, D1 commands can target remote state; always spell out either `--local` or `--remote`. For a remote instance, first ensure `wrangler.json` has that instance's real D1 binding/ID and use the remote command only with authorized Cloudflare credentials. The commands pass fixed file paths to Wrangler rather than placing the email in a shell command. Do not include `BEGIN`, `BEGIN TRANSACTION`, or `COMMIT` in SQL files passed to `wrangler d1 execute --file`; Wrangler imports the file as a unit and nested transaction statements can fail.

## Commands

```bash
pnpm dev                 # start local development
pnpm db:migrate:local    # apply local D1 migrations
pnpm test                # React/shared tests
pnpm test:worker         # Worker tests in the Cloudflare pool
pnpm lint                # lint source files
pnpm typecheck           # TypeScript project checks
pnpm build               # typecheck and build client/Worker assets
pnpm check               # complete local verification, including a deploy dry run
```

`pnpm check` performs a Wrangler deploy dry run. It validates the configured bindings but should still be run only with the credentials and account context appropriate to the project; it does not replace an intentional deployment review.

## Architecture

The React client uses React Router for the customer and CMS shells, TanStack Query for server state, TanStack Table for server-driven CMS lists, and shared Zod contracts across the boundary. A Hono Worker exposes the API, creates Better Auth against the Drizzle D1 adapter, and resolves registered, signed-guest, and CMS identities before protected routes. D1 stores authentication, CMS roles, the singleton store profile, catalog entities, offerings, carts, and inventory movements. The Worker mediates all product-image writes and reads through the R2 `MEDIA` binding, so clients never receive object keys or upload credentials.

There is one `store_profile` record per instance, constrained to a singleton key. Store configuration is updated through the owner/admin CMS route with a version check, so conflicting edits are rejected instead of silently overwriting one another.

Authorized owner, admin, and operations users manage `/cms/categories`, `/cms/tags`, `/cms/products`, `/cms/offerings`, and `/cms/inventory`. General offering edits never accept stock; the dedicated inventory adjustment action records the absolute resulting count and a required reason in the same D1 batch as the stock/version update.

Anonymous catalog clients use:

- `GET /api/catalog/categories`
- `GET /api/catalog/tags`
- `GET /api/catalog/products`
- `GET /api/catalog/products/:slug`
- `GET /api/catalog/search`
- `GET /api/catalog/images/:imageId`

Only active products in active categories with at least one active offering are public. Product images accept JPEG, PNG, WebP, and AVIF content after MIME and signature validation.

Customer routes are `/shop`, `/search`, `/products/:slug`, `/cart`, `/checkout`, `/orders`, `/orders/:orderNumber`, and `/account`. Cart APIs are:

- `GET /api/cart`
- `POST /api/cart/items`
- `PUT /api/cart/items/:offeringId`
- `DELETE /api/cart/items/:offeringId`
- `POST /api/cart/merge`

Checkout, order, and address APIs are:

- `POST /api/checkout` (idempotency-key header required)
- `GET /api/orders`
- `GET /api/orders/:orderNumber`
- `POST /api/orders/:orderNumber/cancel`
- `POST /api/orders/:orderNumber/reorder`
- `GET /api/addresses`
- `POST /api/addresses`
- `GET /api/addresses/:addressId`
- `PUT /api/addresses/:addressId`
- `DELETE /api/addresses/:addressId`

Cart writes never reserve or deduct stock. Each cart response recalculates current effective prices and availability, retaining changed or unavailable lines for customer review. Guest credentials are signed, expire after 30 days, and are merged into the registered cart (and any guest orders claimed) after successful authentication.

Checkout validates serviceability, re-reads active offerings, and computes authoritative prices and totals server-side. A repeated checkout with the same idempotency key returns the original order instead of placing a second one; price or availability changes return a `409` with the affected offerings and current values. Stock deduction and cancellation restoration write immutable inventory movements and are atomic and idempotent. Historical orders are snapshots that never depend on mutable catalog text or prices.

## References

- [Cloudflare Workers local secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Cloudflare D1 Wrangler commands](https://developers.cloudflare.com/d1/wrangler-commands/)
- [Cloudflare D1 local development](https://developers.cloudflare.com/d1/best-practices/local-development/)
- [Cloudflare D1 SQL-file import guidance](https://developers.cloudflare.com/d1/best-practices/import-export-data/)
