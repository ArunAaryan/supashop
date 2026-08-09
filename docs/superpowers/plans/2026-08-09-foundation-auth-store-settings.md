# Foundation, Authentication, and Store Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a runnable first slice with project tooling, Better Auth email/password login, guest entry, CMS role authorization, approved visual shells, and an editable singleton store profile.

**Architecture:** Shared Zod contracts cross the React/Worker boundary. Better Auth is created per Worker environment over the Drizzle D1 adapter, while application roles and store settings live in focused domain tables. Hono middleware resolves sessions and permissions; React Router and TanStack Query render role-aware customer and CMS shells.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, React Router, TanStack Query, Zod, Hono, Better Auth, Drizzle ORM, Cloudflare Workers, D1, R2, Vitest, Cloudflare Vitest pool, Testing Library

---

### Task 1: Install the application and test foundation

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Modify: `src/react-app/index.css`
- Create: `vitest.config.ts`
- Create: `vitest.worker.config.ts`
- Create: `src/react-app/test/setup.ts`
- Create: `src/shared/domain/money.test.ts`
- Create: `src/shared/domain/money.ts`

- [ ] **Step 1: Install runtime and development dependencies**

Run:

```bash
pnpm add @tanstack/react-query @tanstack/react-query-devtools better-auth drizzle-orm react-router-dom zod
pnpm add -D @cloudflare/vitest-pool-workers @tailwindcss/vite @testing-library/jest-dom @testing-library/react @testing-library/user-event drizzle-kit jsdom tailwindcss vitest
```

Expected: both commands exit `0` and update `package.json` plus `pnpm-lock.yaml`.

- [ ] **Step 2: Add deterministic scripts to `package.json`**

Replace the scripts object with:

```json
{
  "build": "tsc -b && vite build",
  "cf-typegen": "wrangler types",
  "check": "pnpm lint && pnpm typecheck && pnpm test && pnpm test:worker && pnpm build && wrangler deploy --dry-run",
  "db:generate": "drizzle-kit generate",
  "db:migrate:local": "wrangler d1 migrations apply supashop-db --local",
  "dev": "vite",
  "lint": "eslint .",
  "test": "vitest run --config vitest.config.ts",
  "test:watch": "vitest --config vitest.config.ts",
  "test:worker": "vitest run --config vitest.worker.config.ts",
  "typecheck": "tsc -b",
  "deploy": "wrangler deploy",
  "preview": "pnpm build && vite preview"
}
```

- [ ] **Step 3: Write the first failing domain test**

Create `src/shared/domain/money.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatMinorUnits } from "./money";

describe("formatMinorUnits", () => {
  it("formats integer paise as INR", () => {
    expect(formatMinorUnits(12345, "en-IN", "INR")).toBe("₹123.45");
  });
});
```

- [ ] **Step 4: Configure browser-independent Vitest and verify the failure**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./src/react-app/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["src/worker/**/*.test.ts"],
  },
});
```

Create `src/react-app/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

Run:

```bash
pnpm test -- src/shared/domain/money.test.ts
```

Expected: FAIL because `./money` does not exist.

- [ ] **Step 5: Add the minimal money formatter**

Create `src/shared/domain/money.ts`:

```ts
export function formatMinorUnits(
  amount: number,
  locale = "en-IN",
  currency = "INR",
): string {
  if (!Number.isSafeInteger(amount)) throw new TypeError("amount must be an integer");
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount / 100);
}
```

Run `pnpm test -- src/shared/domain/money.test.ts`.

Expected: PASS.

- [ ] **Step 6: Enable Tailwind through Vite and establish design tokens**

Modify `vite.config.ts`:

```ts
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
});
```

Replace `src/react-app/index.css` with:

```css
@import "tailwindcss";

@theme {
  --color-canvas: #f8d9cf;
  --color-surface: #fbfbf8;
  --color-ink: #1b1b1a;
  --color-muted: #74736e;
  --color-line: #e5e1da;
  --color-action: #f36c45;
  --radius-card: 1.25rem;
  --shadow-float: 0 20px 45px rgb(104 52 37 / 18%);
}

@layer base {
  * { box-sizing: border-box; }
  body { margin: 0; min-width: 320px; min-height: 100vh; background: var(--color-canvas); color: var(--color-ink); }
  button, input, textarea, select { font: inherit; }
  :focus-visible { outline: 3px solid var(--color-action); outline-offset: 2px; }
}
```

- [ ] **Step 7: Add the Worker test config**

Create `vitest.worker.config.ts`:

```ts
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    include: ["src/worker/**/*.test.ts"],
    poolOptions: { workers: { wrangler: { configPath: "./wrangler.json" } } },
  },
});
```

Run `pnpm typecheck && pnpm test`.

Expected: both commands exit `0`.

- [ ] **Step 8: Commit the foundation**

```bash
git add package.json pnpm-lock.yaml vite.config.ts vitest.config.ts vitest.worker.config.ts src/react-app/index.css src/react-app/test/setup.ts src/shared/domain/money.ts src/shared/domain/money.test.ts
git commit -m "chore: establish delivery app foundation"
```

### Task 2: Configure D1, R2, Drizzle, and the base schema

**Files:**
- Modify: `wrangler.json`
- Create: `drizzle.config.ts`
- Create: `src/worker/db/client.ts`
- Create: `src/worker/db/schema/auth.ts`
- Create: `src/worker/db/schema/access.ts`
- Create: `src/worker/db/schema/store.ts`
- Create: `src/worker/db/schema/index.ts`
- Create: `src/worker/db/schema/store.test.ts`
- Create: `drizzle/0000_foundation.sql`
- Modify: `worker-configuration.d.ts` through generation

- [ ] **Step 1: Add local bindings to `wrangler.json`**

Add these top-level properties while preserving `assets`, `observability`, and `nodejs_compat`:

```json
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "supashop-db",
    "database_id": "supashop-local"
  }
],
"r2_buckets": [
  {
    "binding": "MEDIA",
    "bucket_name": "supashop-media"
  }
]
```

Run `pnpm cf-typegen`.

Expected: `Env` contains `DB: D1Database` and `MEDIA: R2Bucket`.

- [ ] **Step 2: Configure Drizzle Kit**

Create `drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/worker/db/schema/index.ts",
  out: "./drizzle",
});
```

Create `src/worker/db/client.ts`:

```ts
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function createDb(database: D1Database) {
  return drizzle(database, { schema });
}

export type Database = ReturnType<typeof createDb>;
```

- [ ] **Step 3: Write a failing schema test**

Create `src/worker/db/schema/store.test.ts`:

```ts
import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

describe("store schema", () => {
  beforeAll(async () => {
    await env.DB.exec("PRAGMA foreign_keys = ON");
  });

  it("allows only one store profile", async () => {
    await env.DB.prepare("INSERT INTO store_profile (singleton_key, name, timezone, created_at, updated_at) VALUES (1, 'Main Store', 'Asia/Kolkata', 1, 1)").run();
    await expect(env.DB.prepare("INSERT INTO store_profile (singleton_key, name, timezone, created_at, updated_at) VALUES (1, 'Second', 'Asia/Kolkata', 1, 1)").run()).rejects.toThrow();
  });
});
```

Run `pnpm test:worker -- src/worker/db/schema/store.test.ts`.

Expected: FAIL because `store_profile` does not exist.

- [ ] **Step 4: Define the Better Auth core tables**

Create `src/worker/db/schema/auth.ts`:

```ts
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [uniqueIndex("user_email_unique").on(table.email)]);

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  token: text("token").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
}, (table) => [
  uniqueIndex("session_token_unique").on(table.token),
  uniqueIndex("session_user_token_unique").on(table.userId, table.token),
]);

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [uniqueIndex("account_provider_account_unique").on(table.providerId, table.accountId)]);

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [uniqueIndex("verification_identifier_value_unique").on(table.identifier, table.value)]);
```

Before the first migration is committed, compare these four models field-for-field with Better Auth's current official core-schema documentation at `https://better-auth.com/docs/concepts/database`. If the installed Better Auth release requires a schema change, update this file and regenerate `drizzle/0000_foundation.sql` in the same commit.

- [ ] **Step 5: Define access and singleton store tables**

Create `src/worker/db/schema/access.ts`:

```ts
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { user } from "./auth";

export const cmsRoleValues = ["owner", "admin", "operations", "delivery"] as const;

export const cmsRole = sqliteTable("cms_role", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  role: text("role", { enum: cmsRoleValues }).notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  grantedBy: text("granted_by").references(() => user.id),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [uniqueIndex("cms_role_user_unique").on(table.userId)]);
```

Create `src/worker/db/schema/store.ts`:

```ts
import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { user } from "./auth";

export const storeProfile = sqliteTable("store_profile", {
  singletonKey: integer("singleton_key").primaryKey().$default(() => 1),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  ownerUserId: text("owner_user_id").references(() => user.id),
  contactName: text("contact_name").notNull().default(""),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  addressLine1: text("address_line_1").notNull().default(""),
  addressLine2: text("address_line_2").notNull().default(""),
  landmark: text("landmark").notNull().default(""),
  city: text("city").notNull().default(""),
  state: text("state").notNull().default(""),
  postalCode: text("postal_code").notNull().default(""),
  latitude: real("latitude"),
  longitude: real("longitude"),
  directionsUrl: text("directions_url").notNull().default(""),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  orderCutoffMinutes: integer("order_cutoff_minutes"),
  deliveryInstructions: text("delivery_instructions").notNull().default(""),
  version: integer("version").notNull().default(1),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const storeHours = sqliteTable("store_hours", {
  id: text("id").primaryKey(),
  weekday: integer("weekday").notNull(),
  opensMinute: integer("opens_minute").notNull(),
  closesMinute: integer("closes_minute").notNull(),
  closed: integer("closed", { mode: "boolean" }).notNull().default(false),
}, (table) => [uniqueIndex("store_hours_weekday_unique").on(table.weekday)]);

export const serviceablePostalCode = sqliteTable("serviceable_postal_code", {
  postalCode: text("postal_code").primaryKey(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});
```

Create `src/worker/db/schema/index.ts`:

```ts
export * from "./access";
export * from "./auth";
export * from "./store";
```

- [ ] **Step 6: Generate and apply the migration**

Run:

```bash
pnpm db:generate
pnpm db:migrate:local
pnpm test:worker -- src/worker/db/schema/store.test.ts
```

Expected: migration generation and application exit `0`; schema test PASS.

- [ ] **Step 7: Commit database foundation**

```bash
git add wrangler.json worker-configuration.d.ts drizzle.config.ts drizzle src/worker/db
git commit -m "feat: add auth and store database foundation"
```

### Task 3: Mount Better Auth and enforce CMS roles

**Files:**
- Create: `src/worker/auth/create-auth.ts`
- Create: `src/worker/auth/session.ts`
- Create: `src/worker/auth/permissions.ts`
- Create: `src/worker/auth/permissions.test.ts`
- Create: `src/worker/http/errors.ts`
- Create: `src/worker/app.ts`
- Modify: `src/worker/index.ts`
- Create: `src/react-app/lib/auth-client.ts`

- [ ] **Step 1: Write failing permission tests**

Create `src/worker/auth/permissions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { can } from "./permissions";

describe("CMS permissions", () => {
  it("lets delivery complete delivery but not edit store settings", () => {
    expect(can("delivery", "delivery:complete")).toBe(true);
    expect(can("delivery", "store:update")).toBe(false);
  });

  it("lets owner update store settings and team roles", () => {
    expect(can("owner", "store:update")).toBe(true);
    expect(can("owner", "team:update")).toBe(true);
  });
});
```

Run `pnpm test:worker -- src/worker/auth/permissions.test.ts`.

Expected: FAIL because `permissions.ts` does not exist.

- [ ] **Step 2: Implement the explicit permission map**

Create `src/worker/auth/permissions.ts`:

```ts
import type { cmsRoleValues } from "../db/schema/access";

export type CmsRole = (typeof cmsRoleValues)[number];
export type Permission =
  | "store:update"
  | "team:update"
  | "catalog:write"
  | "inventory:write"
  | "order:manage"
  | "delivery:complete"
  | "analytics:read";

const permissions: Record<CmsRole, ReadonlySet<Permission>> = {
  owner: new Set(["store:update", "team:update", "catalog:write", "inventory:write", "order:manage", "delivery:complete", "analytics:read"]),
  admin: new Set(["store:update", "catalog:write", "inventory:write", "order:manage", "delivery:complete", "analytics:read"]),
  operations: new Set(["catalog:write", "inventory:write", "order:manage", "analytics:read"]),
  delivery: new Set(["delivery:complete"]),
};

export function can(role: CmsRole, permission: Permission): boolean {
  return permissions[role].has(permission);
}
```

Run `pnpm test:worker -- src/worker/auth/permissions.test.ts`.

Expected: PASS.

- [ ] **Step 3: Create the Better Auth factory**

Create `src/worker/auth/create-auth.ts`:

```ts
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth/minimal";
import { createDb } from "../db/client";
import * as schema from "../db/schema";

export function createAuth(env: Env) {
  const db = createDb(env.DB);
  return betterAuth({
    appName: "Supashop",
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
    },
    trustedOrigins: [env.BETTER_AUTH_URL],
  });
}

export type Auth = ReturnType<typeof createAuth>;
```

Add `BETTER_AUTH_URL: string` and `BETTER_AUTH_SECRET: string` to local Worker variables/secrets, then run `pnpm cf-typegen`. Do not commit the secret.

- [ ] **Step 4: Implement session middleware and stable errors**

Create `src/worker/http/errors.ts`:

```ts
export type ApiErrorCode = "UNAUTHENTICATED" | "FORBIDDEN" | "VALIDATION_ERROR" | "CONFLICT" | "NOT_FOUND" | "INTERNAL_ERROR";

export class ApiError extends Error {
  constructor(public status: 400 | 401 | 403 | 404 | 409 | 422 | 500, public code: ApiErrorCode, message: string, public details?: unknown) {
    super(message);
  }
}
```

Create `src/worker/auth/session.ts` with middleware that calls `createAuth(c.env).api.getSession({ headers: c.req.raw.headers })`, writes nullable `user` and `session` variables, loads active `cms_role` by `user.id`, and exposes `requireUser` plus `requirePermission`. Anonymous customer routes must not call either guard.

- [ ] **Step 5: Compose the Worker application**

Create `src/worker/app.ts`:

```ts
import { Hono } from "hono";
import { createAuth } from "./auth/create-auth";

export function createApp() {
  const app = new Hono<{ Bindings: Env }>();

  app.get("/api/health", (c) => c.json({ status: "ok" }));
  app.on(["GET", "POST"], "/api/auth/*", (c) => createAuth(c.env).handler(c.req.raw));

  return app;
}
```

Replace `src/worker/index.ts` with:

```ts
import { createApp } from "./app";

export default createApp();
```

Create `src/react-app/lib/auth-client.ts`:

```ts
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();
```

- [ ] **Step 6: Verify the mounted handler**

Run `pnpm dev`, then in another terminal run:

```bash
curl -i http://localhost:5173/api/auth/ok
curl -i http://localhost:5173/api/health
```

Expected: both return HTTP `200`; auth returns `{"status":"ok"}` and health returns `{"status":"ok"}`.

- [ ] **Step 7: Commit authentication and permissions**

```bash
git add src/worker src/react-app/lib/auth-client.ts worker-configuration.d.ts wrangler.json
git commit -m "feat: add Better Auth and CMS permissions"
```

### Task 4: Build the application router, login flow, and shells

**Files:**
- Modify: `src/react-app/main.tsx`
- Replace: `src/react-app/App.tsx`
- Delete: `src/react-app/App.css`
- Create: `src/react-app/app/providers.tsx`
- Create: `src/react-app/app/router.tsx`
- Create: `src/react-app/app/session-gate.tsx`
- Create: `src/react-app/app/customer-shell.tsx`
- Create: `src/react-app/app/cms-shell.tsx`
- Create: `src/react-app/features/auth/login-page.tsx`
- Create: `src/react-app/features/auth/login-page.test.tsx`
- Create: `src/react-app/components/button.tsx`
- Create: `src/react-app/components/field.tsx`

- [ ] **Step 1: Write the failing login-page test**

Create `src/react-app/features/auth/login-page.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { LoginPage } from "./login-page";

describe("LoginPage", () => {
  it("offers email sign-in and guest continuation", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter><LoginPage onGuest={vi.fn()} /></MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByRole("heading", { name: /welcome/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue as guest/i })).toBeInTheDocument();
  });
});
```

Run `pnpm test -- src/react-app/features/auth/login-page.test.tsx`.

Expected: FAIL because `login-page.tsx` does not exist.

- [ ] **Step 2: Add providers and route structure**

Create `src/react-app/app/providers.tsx` with one stable `QueryClient`, `QueryClientProvider`, and React Query devtools in development. Create `router.tsx` with routes for `/login`, `/shop`, `/account`, `/cms`, and `/cms/settings/store`; all undeveloped pages render an explicit phase message rather than broken navigation.

Replace `src/react-app/main.tsx` so `AppProviders` wraps `RouterProvider`. Replace `App.tsx` with an export of the router root and remove the starter `App.css` import and file.

- [ ] **Step 3: Implement the login surface**

Create `login-page.tsx` as a controlled email/password form using `authClient.signIn.email`, a registration mode using `authClient.signUp.email`, and an injected `onGuest` callback that creates a guest session through `POST /api/guest/session` before navigating to `/shop`. Render field errors beside their controls and retain the Soft Logistics peach, cream, ink, and orange visual tokens.

Run `pnpm test -- src/react-app/features/auth/login-page.test.tsx`.

Expected: PASS.

- [ ] **Step 4: Add role-aware session routing**

Create `session-gate.tsx` so authenticated CMS users route to `/cms`, authenticated customers route to `/shop`, and unauthenticated users remain at `/login`. The login page always exposes guest continuation. Create `customer-shell.tsx` with mobile bottom navigation and `cms-shell.tsx` with desktop sidebar plus compact delivery navigation.

- [ ] **Step 5: Verify responsive shells**

Run `pnpm dev`. At 390px width verify the customer shell has bottom navigation and no horizontal overflow. At 1280px verify the CMS sidebar remains visible. Tab through login and confirm visible focus on every interactive control.

- [ ] **Step 6: Commit the application shell**

```bash
git add src/react-app
git commit -m "feat: add login and role-aware app shells"
```

### Task 5: Implement guest sessions

**Files:**
- Create: `src/shared/contracts/guest.ts`
- Create: `src/worker/modules/guest/guest-cookie.ts`
- Create: `src/worker/modules/guest/guest-cookie.test.ts`
- Create: `src/worker/modules/guest/guest-routes.ts`
- Modify: `src/worker/app.ts`

- [ ] **Step 1: Write failing guest-cookie tests**

Create `src/worker/modules/guest/guest-cookie.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createGuestToken, verifyGuestToken } from "./guest-cookie";

describe("guest cookie", () => {
  it("round-trips a signed opaque id", async () => {
    const token = await createGuestToken("guest-123", "test-secret-that-is-long-enough-12345");
    expect(await verifyGuestToken(token, "test-secret-that-is-long-enough-12345")).toBe("guest-123");
  });

  it("rejects tampering", async () => {
    const token = await createGuestToken("guest-123", "test-secret-that-is-long-enough-12345");
    expect(await verifyGuestToken(`${token}x`, "test-secret-that-is-long-enough-12345")).toBeNull();
  });
});
```

Run `pnpm test:worker -- src/worker/modules/guest/guest-cookie.test.ts`.

Expected: FAIL because `guest-cookie.ts` does not exist.

- [ ] **Step 2: Implement signed opaque guest tokens**

Create `guest-cookie.ts` with Web Crypto HMAC-SHA-256. The token format is `base64url(guestId).base64url(signature)`, signature comparison uses a constant-time byte loop, and verification returns `null` for malformed input.

Run `pnpm test:worker -- src/worker/modules/guest/guest-cookie.test.ts`.

Expected: PASS.

- [ ] **Step 3: Add the guest-session endpoint**

Create `guest-routes.ts` exposing `POST /session`. It creates `crypto.randomUUID()`, signs it with `BETTER_AUTH_SECRET`, and sets `supashop_guest` as HttpOnly, SameSite=Lax, Path=/, Secure in production, and 30-day Max-Age. Return `{ guest: true }` without returning the identifier.

Mount the route at `/api/guest` in `app.ts` and connect `LoginPage.onGuest` to it.

- [ ] **Step 4: Verify cookie behavior**

Run:

```bash
curl -i -X POST http://localhost:5173/api/guest/session
```

Expected: HTTP `200`, a `Set-Cookie: supashop_guest=` header with `HttpOnly` and `SameSite=Lax`, and no raw guest UUID in the JSON body.

- [ ] **Step 5: Commit guest entry**

```bash
git add src/shared/contracts/guest.ts src/worker/modules/guest src/worker/app.ts src/react-app/features/auth/login-page.tsx
git commit -m "feat: add secure guest entry"
```

### Task 6: Implement store settings API

**Files:**
- Create: `src/shared/contracts/store.ts`
- Create: `src/worker/modules/store/store-repository.ts`
- Create: `src/worker/modules/store/store-service.ts`
- Create: `src/worker/modules/store/store-routes.ts`
- Create: `src/worker/modules/store/store-routes.test.ts`
- Modify: `src/worker/app.ts`

- [ ] **Step 1: Define the store contracts**

Create `src/shared/contracts/store.ts` with a `storeSettingsSchema` that validates non-empty store/contact names, E.164-like phone text, email, postal code, IANA timezone text, optional HTTPS directions URL, optional latitude/longitude bounds, version as a positive integer, seven unique weekday hour records, and normalized uppercase serviceable postal codes. Export inferred input and response types.

- [ ] **Step 2: Write failing authorization and version tests**

Create Worker integration tests proving:

1. an unauthenticated request to `PUT /api/cms/store` returns `401`;
2. a delivery role returns `403`;
3. an owner update with matching `version` returns `200` and increments it;
4. a stale version returns `409` and does not alter the row.

Run `pnpm test:worker -- src/worker/modules/store/store-routes.test.ts`.

Expected: FAIL because the route is not mounted.

- [ ] **Step 3: Implement repository and service**

`store-repository.ts` must expose `getStore()`, `upsertStore(input, expectedVersion)`, `replaceHours(hours)`, and `replacePostalCodes(codes)`. `store-service.ts` validates the contract, performs the optimistic-version write, and maps zero affected rows to `ApiError(409, "CONFLICT", "Store settings changed; reload and retry")`.

- [ ] **Step 4: Implement and mount routes**

`store-routes.ts` exposes public `GET /api/store`, CMS `GET /api/cms/store`, and owner/admin `PUT /api/cms/store`. Public output omits owner user ID and internal version metadata not required by the client.

Mount the routes in `app.ts`, run the focused Worker test, and expect all four cases to PASS.

- [ ] **Step 5: Commit store settings API**

```bash
git add src/shared/contracts/store.ts src/worker/modules/store src/worker/app.ts
git commit -m "feat: add singleton store settings API"
```

### Task 7: Build the CMS store settings screen

**Files:**
- Create: `src/react-app/lib/api-client.ts`
- Create: `src/react-app/features/store/store-settings-page.tsx`
- Create: `src/react-app/features/store/store-settings-page.test.tsx`
- Create: `src/react-app/features/store/use-store-settings.ts`
- Modify: `src/react-app/app/router.tsx`

- [ ] **Step 1: Write the failing settings-page test**

Create a Testing Library test with a mocked successful `GET /api/cms/store`. Assert fields for store name, contact person, phone, email, address, timezone, directions URL, opening hours, order cutoff, serviceable postal codes, and delivery instructions. Submit a changed store name and assert `PUT /api/cms/store` receives the original version.

Run `pnpm test -- src/react-app/features/store/store-settings-page.test.tsx`.

Expected: FAIL because the screen does not exist.

- [ ] **Step 2: Add the typed API client**

Create `api-client.ts` with `apiRequest<T>(path, init)` that sends JSON with credentials, parses the stable error envelope, and throws an `ApiClientError` containing status, code, message, and details.

- [ ] **Step 3: Add store settings queries and mutation**

Create `use-store-settings.ts` using query key `["cms", "store"]`. The mutation sends the current version, replaces cached data with the successful response, and displays the conflict message without discarding user input.

- [ ] **Step 4: Implement the settings form**

Create a responsive, sectioned screen using controlled inputs and `storeSettingsSchema.safeParse`. Keep seven opening-hour rows visible, use a repeatable postal-code chip input, and expose save state with idle, saving, saved, validation error, and conflict states. Only owner/admin users can enter the route.

Run the focused test.

Expected: PASS.

- [ ] **Step 5: Verify UI and API together**

Run `pnpm dev`, sign in as the seeded owner, visit `/cms/settings/store`, save a complete profile, refresh, and verify every value persists. Sign in as delivery staff and verify direct navigation returns the CMS forbidden screen.

- [ ] **Step 6: Commit store settings UI**

```bash
git add src/react-app/lib/api-client.ts src/react-app/features/store src/react-app/app/router.tsx
git commit -m "feat: add CMS store settings screen"
```

### Task 8: Phase verification and documentation

**Files:**
- Modify: `README.md`
- Create: `.dev.vars.example`

- [ ] **Step 1: Document local setup without secrets**

Add `.dev.vars.example` containing only variable names and safe local values:

```dotenv
BETTER_AUTH_URL=http://localhost:5173
BETTER_AUTH_SECRET=replace-with-openssl-rand-base64-32
APP_ENV=development
```

Update `README.md` with `pnpm install`, secret generation, local D1 migration, `pnpm dev`, test commands, and an initial-owner provisioning command that inserts `cms_role.role = 'owner'` for an already registered email only when no active owner exists. Document separate local and remote Wrangler forms and require an exact email argument.

- [ ] **Step 2: Run the complete phase verification**

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:worker
pnpm build
pnpm exec wrangler deploy --dry-run
```

Expected: all commands exit `0`; no failed tests; dry-run lists `DB` and `MEDIA` bindings.

- [ ] **Step 3: Inspect the change boundary**

Run `git status --short` and `git diff --check`.

Expected: only intended Phase 1 files are changed and `git diff --check` prints nothing.

- [ ] **Step 4: Commit phase documentation**

```bash
git add README.md .dev.vars.example
git commit -m "docs: add local delivery app setup"
```

- [ ] **Step 5: Review the next subsystem**

Before catalog work, compare the implemented schema exports, auth middleware types, API error envelope, query provider, and visual primitives with `2026-08-09-delivery-commerce-design.md`. Write the catalog/inventory plan against the verified interfaces rather than predicting changes to them.
