# Supashop

Supashop is a single-store delivery application built with React, Hono, Cloudflare Workers, D1, and R2. Each deployed instance represents exactly one physical store or warehouse. It has no organizations, tenants, or multi-store administration.

## Phase 1 status

Phase 1 establishes the application foundation:

- Better Auth email/password registration and sign-in, plus signed guest browser sessions.
- Server-enforced CMS roles (`owner`, `admin`, `operations`, and `delivery`) and role-aware React shells.
- A singleton store profile with contact information, address, serviceable postal codes, opening hours, and optimistic-concurrency updates.
- D1 schema/migrations and an R2 binding reserved for future store and catalog media.

The customer shop, search, catalog, product offerings, cart, inventory controls, checkout, order workflows, delivery proof, and analytics are not implemented yet. The product direction is cash on delivery only; it does not include online payments or live delivery/GPS tracking.

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

The React client uses React Router for the customer and CMS shells, TanStack Query for server state, and shared Zod contracts across the boundary. A Hono Worker exposes the API, creates Better Auth against the Drizzle D1 adapter, and resolves sessions and CMS permissions before privileged routes. D1 stores authentication, CMS roles, and the singleton store profile. The Worker has an R2 `MEDIA` binding for future media, but Phase 1 does not yet upload or serve catalog assets.

There is one `store_profile` record per instance, constrained to a singleton key. Store configuration is updated through the owner/admin CMS route with a version check, so conflicting edits are rejected instead of silently overwriting one another.

## References

- [Cloudflare Workers local secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Cloudflare D1 Wrangler commands](https://developers.cloudflare.com/d1/wrangler-commands/)
- [Cloudflare D1 local development](https://developers.cloudflare.com/d1/best-practices/local-development/)
- [Cloudflare D1 SQL-file import guidance](https://developers.cloudflare.com/d1/best-practices/import-export-data/)
