# Phase 2 CMS Catalog and Offering Inventory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add CMS taxonomy, products, five-image R2 galleries, sellable offerings, immutable offering-level inventory movements, and public catalog/search APIs.

**Architecture:** Implement four vertical slices over the Phase 1 boundaries: taxonomy, products/media, offerings/inventory, and public catalog. Shared Zod contracts cross the React/Worker boundary; Hono routes translate HTTP; focused services enforce rules; repositories own D1/R2; React Query and TanStack Table power the CMS.

**Tech Stack:** TypeScript, Zod, React 19, React Router, TanStack Query, TanStack Table, Hono, Drizzle ORM, Cloudflare Workers, D1, R2, Vitest, Testing Library

---

## Preconditions and file map

Work in an isolated `codex/phase-2-catalog-inventory` worktree. Preserve the existing untracked `.pnpm-store/`; do not add it to Git. Read these current references before changing Cloudflare code:

- `docs/superpowers/specs/2026-08-29-cms-catalog-inventory-design.md`
- `AGENTS.md`
- <https://developers.cloudflare.com/r2/api/workers/workers-api-reference/>
- <https://developers.cloudflare.com/d1/worker-api/d1-database/>

Create or modify these focused units:

```text
src/shared/contracts/catalog.ts                 Catalog request/response schemas
src/shared/domain/discount.ts                   Integer discount calculations
src/worker/db/schema/catalog.ts                 D1 catalog and ledger schema
src/worker/modules/catalog/catalog-repository.ts Taxonomy and product persistence
src/worker/modules/catalog/catalog-service.ts    Taxonomy and product rules
src/worker/modules/catalog/catalog-routes.ts     CMS/public route composition
src/worker/modules/catalog/media-repository.ts   Product-image D1 and R2 operations
src/worker/modules/catalog/media-service.ts      Upload validation and compensation
src/worker/modules/catalog/offering-repository.ts Offering and inventory persistence
src/worker/modules/catalog/offering-service.ts    Offering and stock invariants
src/worker/modules/catalog/public-repository.ts   Public list/detail/search queries
src/react-app/components/data-table.tsx          Reusable manual TanStack Table shell
src/react-app/features/catalog/catalog-api.ts     Validated React Query functions/hooks
src/react-app/features/catalog/list-state.ts      URL-backed page/filter/sort helpers
src/react-app/features/catalog/taxonomy-pages.tsx Category and tag CMS screens
src/react-app/features/catalog/products-page.tsx  Product CMS table
src/react-app/features/catalog/product-form.tsx   Product editor and gallery host
src/react-app/features/catalog/product-gallery.tsx Image upload/order/remove controls
src/react-app/features/catalog/offerings-page.tsx Offering CMS table
src/react-app/features/catalog/offering-form.tsx  Offering editor
src/react-app/features/catalog/inventory-pages.tsx Adjustment dialog and ledger
```

Centralize only catalog authentication, request, and fixture insertion helpers in `src/worker/test/catalog-fixtures.ts`; keep behavior-specific assertions in each route test file.

## Task 1: Shared discount rules and catalog contracts

**Files:**
- Create: `src/shared/domain/discount.ts`
- Create: `src/shared/domain/discount.test.ts`
- Create: `src/shared/contracts/catalog.ts`
- Create: `src/shared/contracts/catalog.test.ts`

- [ ] **Step 1: Write failing discount tests**

```ts
import { describe, expect, it } from "vitest";
import { calculateEffectivePrice } from "./discount";

describe("calculateEffectivePrice", () => {
  it("uses integer minor units for fixed discounts", () => {
    expect(calculateEffectivePrice(1_000, "fixed", 125)).toEqual({ discountMinor: 125, effectivePriceMinor: 875 });
  });

  it("rounds basis-point discounts down", () => {
    expect(calculateEffectivePrice(999, "percentage", 1_250)).toEqual({ discountMinor: 124, effectivePriceMinor: 875 });
  });

  it.each([
    [1_000, "none", 1],
    [1_000, "fixed", 1_000],
    [1_000, "percentage", 10_001],
  ] as const)("rejects invalid discount %#", (price, type, value) => {
    expect(() => calculateEffectivePrice(price, type, value)).toThrow();
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm test src/shared/domain/discount.test.ts`

Expected: FAIL because `./discount` does not exist.

- [ ] **Step 3: Implement the pure discount function**

```ts
export const discountTypes = ["none", "fixed", "percentage"] as const;
export type DiscountType = (typeof discountTypes)[number];

export function calculateEffectivePrice(listPriceMinor: number, type: DiscountType, value: number) {
  if (!Number.isSafeInteger(listPriceMinor) || listPriceMinor <= 0 || !Number.isSafeInteger(value) || value < 0) {
    throw new RangeError("Price and discount must be safe integers");
  }
  if (type === "none" && value !== 0) throw new RangeError("No discount requires a zero value");
  if (type === "fixed" && value >= listPriceMinor) throw new RangeError("Fixed discount must be below list price");
  if (type === "percentage" && (value < 1 || value > 10_000)) throw new RangeError("Percentage must be 1 to 10000 basis points");
  const discountMinor = type === "none" ? 0 : type === "fixed" ? value : Math.floor(listPriceMinor * value / 10_000);
  return { discountMinor, effectivePriceMinor: listPriceMinor - discountMinor };
}
```

- [ ] **Step 4: Write failing contract tests**

```ts
import { describe, expect, it } from "vitest";
import { offeringInputSchema, productInputSchema, catalogListQuerySchema } from "./catalog";

describe("catalog contracts", () => {
  it("normalizes product identifiers and tags", () => {
    expect(productInputSchema.parse({
      version: 1, code: " milk-1 ", slug: " Whole Milk ", name: "Whole Milk", description: "Fresh",
      baseWeightValue: 1, baseWeightUnit: "l", categoryId: "category", tagIds: ["tag-b", "tag-a", "tag-a"], active: false,
    })).toMatchObject({ code: "MILK-1", slug: "whole-milk", tagIds: ["tag-a", "tag-b"] });
  });

  it("requires a structured offering pack", () => {
    const parsed = offeringInputSchema.safeParse({
      version: 1, productId: "product", sku: "SKU-1", label: "Single", packQuantity: null,
      weightValue: null, weightUnit: null, listPriceMinor: 100, discountType: "none", discountValue: 0,
      lowStockThreshold: 2, active: true,
    });
    expect(parsed.success).toBe(false);
  });

  it("caps list page size at 100", () => {
    expect(catalogListQuerySchema.safeParse({ page: "1", pageSize: "101" }).success).toBe(false);
  });
});
```

- [ ] **Step 5: Run the contract test and verify RED**

Run: `pnpm test src/shared/contracts/catalog.test.ts`

Expected: FAIL because `catalog.ts` does not exist.

- [ ] **Step 6: Implement complete shared contracts**

Create strict Zod schemas and inferred types for `Category`, `Tag`, `ProductSummary`, `ProductDetail`, `ProductImage`, `Offering`, `InventoryMovement`, `CatalogListResponse<T>`, and every create/update/query payload in the approved spec. Use these concrete primitives:

```ts
const idSchema = z.string().trim().min(1).max(100);
const slugSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const codeSchema = z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{1,63}$/);
const pageSchema = z.coerce.number().int().min(1).default(1);
const pageSizeSchema = z.coerce.number().int().min(1).max(100).default(20);
const weightUnitSchema = z.enum(["g", "kg", "ml", "l"]);
```

Add cross-field refinements for weight pairs, at least one pack field, fixed/percentage discount limits, and price ranges. Export `catalogListResponseSchema(itemSchema)` as a schema factory. Limit names to 120, descriptions to 2,000, labels to 120, search to 100, alt text to 200, and inventory reasons to 500 characters.

- [ ] **Step 7: Run shared tests and verify GREEN**

Run: `pnpm test src/shared/domain/discount.test.ts src/shared/contracts/catalog.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/shared/domain/discount.ts src/shared/domain/discount.test.ts src/shared/contracts/catalog.ts src/shared/contracts/catalog.test.ts
git commit -m "feat: add catalog contracts and discount rules"
```

## Task 2: Catalog and inventory D1 schema

**Files:**
- Create: `src/worker/db/schema/catalog.ts`
- Create: `src/worker/db/schema/catalog.test.ts`
- Modify: `src/worker/db/schema/index.ts`
- Create: `drizzle/0001_catalog_inventory.sql` through Drizzle generation
- Modify: `drizzle/meta/_journal.json`
- Create: `drizzle/meta/0001_snapshot.json`

- [ ] **Step 1: Write failing schema-invariant tests**

Add Worker tests that insert a category, product, offering, and movement, then assert database rejection for duplicate normalized identifiers, invalid discount combinations, negative stock, duplicate image order, and a movement whose arithmetic does not balance:

```ts
async function insertCatalogFixture() {
  const now = Date.now();
  const userId = crypto.randomUUID();
  const categoryId = crypto.randomUUID();
  const productId = crypto.randomUUID();
  const offeringId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO user (id, name, email, created_at, updated_at) VALUES (?, 'Operator', ?, ?, ?)").bind(userId, `${userId}@example.com`, now, now),
    env.DB.prepare("INSERT INTO category (id, name, slug, active, created_at, updated_at) VALUES (?, 'Dairy', ?, 1, ?, ?)").bind(categoryId, `dairy-${categoryId}`, now, now),
    env.DB.prepare("INSERT INTO product (id, code, slug, name, description, category_id, active, version, created_at, updated_at) VALUES (?, ?, ?, 'Milk', '', ?, 0, 1, ?, ?)").bind(productId, `P-${productId}`, `milk-${productId}`, categoryId, now, now),
    env.DB.prepare("INSERT INTO offering (id, product_id, sku, label, pack_quantity, list_price_minor, discount_type, discount_value, stock_quantity, low_stock_threshold, active, version, created_at, updated_at) VALUES (?, ?, ?, 'Single', 1, 100, 'none', 0, 5, 1, 1, 1, ?, ?)").bind(offeringId, productId, `SKU-${offeringId}`, now, now),
  ]);
  return { userId, categoryId, productId, offeringId };
}

it("rejects an unbalanced inventory movement", async () => {
  const fixture = await insertCatalogFixture();
  await expect(env.DB.prepare(
    "INSERT INTO inventory_movement (id, offering_id, previous_quantity, quantity_delta, resulting_quantity, reason, movement_type, actor_user_id, offering_version, created_at) VALUES (?, ?, 5, -2, 4, ?, 'manual_adjustment', ?, 2, ?)",
  ).bind(crypto.randomUUID(), fixture.offeringId, "Count correction", fixture.userId, Date.now()).run()).rejects.toThrow();
});
```

- [ ] **Step 2: Run the Worker test and verify RED**

Run: `pnpm test:worker src/worker/db/schema/catalog.test.ts`

Expected: FAIL with `no such table: category`.

- [ ] **Step 3: Define the Drizzle schema**

Create `category`, `tag`, `product`, `productTag`, `productImage`, `offering`, and `inventoryMovement` using `sqliteTable`. Include foreign keys and checks from section 5 of the spec. Use `onDelete: "restrict"` for historical catalog and ledger references, a composite primary key for `productTag`, and indexes named:

```ts
categorySlugUnique
tagSlugUnique
productCodeUnique
productSlugUnique
productCategoryActiveIdx
productTagTagIdx
productImageProductOrderUnique
offeringSkuUnique
offeringProductActiveIdx
inventoryMovementOfferingCreatedIdx
inventoryMovementActorCreatedIdx
```

Export the schema from `src/worker/db/schema/index.ts`:

```ts
export * from "./catalog";
```

- [ ] **Step 4: Generate and inspect the migration**

Run: `pnpm db:generate -- --name catalog_inventory`

Expected: one new numbered SQL migration and matching metadata snapshot. Inspect the SQL and verify all seven tables, checks, foreign keys, and indexes are present; do not hand-edit generated metadata.

- [ ] **Step 5: Run the schema tests and verify GREEN**

Run: `pnpm test:worker src/worker/db/schema/catalog.test.ts src/worker/db/schema/schema-invariants.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/worker/db/schema/catalog.ts src/worker/db/schema/catalog.test.ts src/worker/db/schema/index.ts drizzle
git commit -m "feat: add catalog and inventory schema"
```

## Task 3: CMS category and tag APIs

**Files:**
- Create: `src/worker/modules/catalog/catalog-repository.ts`
- Create: `src/worker/modules/catalog/catalog-service.ts`
- Create: `src/worker/modules/catalog/catalog-routes.ts`
- Create: `src/worker/modules/catalog/taxonomy-routes.test.ts`
- Create: `src/worker/test/catalog-fixtures.ts`
- Modify: `src/worker/app.ts`

- [ ] **Step 1: Write failing route tests**

Cover unauthenticated `401`, delivery `403`, owner/admin/operations success, normalization, duplicate `409`, field `422`, pagination metadata, tag deactivation while assigned, and category deactivation blocked by an active product. A representative success test is:

```ts
it.each(["owner", "admin", "operations"] as const)("allows %s to manage categories", async (role) => {
  const { cookie } = await signInAs(role);
  const created = await request("/api/cms/categories", cookie, "POST", {
    name: "Dairy", slug: " Dairy ", description: "Chilled goods", active: true,
  });
  expect(created.status).toBe(201);
  expect(await created.json()).toMatchObject({ name: "Dairy", slug: "dairy", active: true });
});
```

Create the shared helper before the test uses it:

```ts
import { env, exports } from "cloudflare:workers";
import { expect } from "vitest";

export async function signInAs(role: "owner" | "admin" | "operations" | "delivery") {
  const email = `${role}-${crypto.randomUUID()}@example.com`;
  const response = await exports.default.fetch("http://example.com/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: role, email, password: "a-long-test-password" }),
  });
  expect(response.status).toBe(200);
  const body = await response.json() as { user: { id: string } };
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error("Expected a session cookie");
  const now = Date.now();
  await env.DB.prepare("INSERT INTO cms_role (id, user_id, role, active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)")
    .bind(crypto.randomUUID(), body.user.id, role, now, now).run();
  return { cookie, userId: body.user.id };
}

export function request(path: string, cookie: string, method = "GET", body?: unknown) {
  return exports.default.fetch(`http://example.com${path}`, {
    method,
    headers: { cookie, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm test:worker src/worker/modules/catalog/taxonomy-routes.test.ts`

Expected: FAIL with route `404`.

- [ ] **Step 3: Implement taxonomy repository and service**

The repository exposes these exact methods:

```ts
listCategories(query: CatalogListQuery): Promise<CatalogPage<StoredCategory>>
createCategory(input: CategoryInput): Promise<StoredCategory>
updateCategory(id: string, input: CategoryInput): Promise<StoredCategory | null>
countActiveProductsForCategory(id: string): Promise<number>
listTags(query: CatalogListQuery): Promise<CatalogPage<StoredTag>>
createTag(input: TagInput): Promise<StoredTag>
updateTag(id: string, input: TagInput): Promise<StoredTag | null>
```

Use parameterized SQL and allowlisted sort maps, never interpolate request fields directly. The service parses shared schemas, maps known SQLite unique failures to `ApiError("CONFLICT", ...)`, rejects blocked category deactivation, and parses canonical response schemas before returning.

- [ ] **Step 4: Implement and mount taxonomy routes**

```ts
routes.get("/cms/categories", requirePermission("catalog:write"), listCategories);
routes.post("/cms/categories", requirePermission("catalog:write"), createCategory);
routes.put("/cms/categories/:categoryId", requirePermission("catalog:write"), updateCategory);
routes.get("/cms/tags", requirePermission("catalog:write"), listTags);
routes.post("/cms/tags", requirePermission("catalog:write"), createTag);
routes.put("/cms/tags/:tagId", requirePermission("catalog:write"), updateTag);
```

Mount once in `createApp()` with `app.route("/api", createCatalogRoutes())` after session middleware.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `pnpm test:worker src/worker/modules/catalog/taxonomy-routes.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/worker/app.ts src/worker/modules/catalog src/worker/test/catalog-fixtures.ts
git commit -m "feat: add CMS taxonomy APIs"
```

## Task 4: Reusable server-driven CMS table foundation

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `src/react-app/components/data-table.tsx`
- Create: `src/react-app/components/data-table.test.tsx`
- Create: `src/react-app/features/catalog/list-state.ts`
- Create: `src/react-app/features/catalog/list-state.test.ts`

- [ ] **Step 1: Install TanStack Table**

Run: `pnpm add @tanstack/react-table`

Expected: `package.json` and `pnpm-lock.yaml` include the dependency.

- [ ] **Step 2: Write failing list-state and table tests**

```ts
it("round-trips manual table state through URL parameters", () => {
  const state = readListState(new URLSearchParams("page=3&pageSize=50&sort=name&direction=desc&q=milk"));
  expect(state).toEqual({ page: 3, pageSize: 50, sort: "name", direction: "desc", q: "milk" });
  expect(writeListState(state).toString()).toBe("page=3&pageSize=50&sort=name&direction=desc&q=milk");
});
```

Render `DataTable` with two rows and assert column headers, cell content, labelled Previous/Next buttons, page text, loading state, and empty state.

- [ ] **Step 3: Run tests and verify RED**

Run: `pnpm test src/react-app/features/catalog/list-state.test.ts src/react-app/components/data-table.test.tsx`

Expected: FAIL because both modules are missing.

- [ ] **Step 4: Implement URL state and DataTable**

`DataTable<T>` accepts `columns`, `data`, `rowCount`, `pageIndex`, `pageSize`, `sorting`, `onPageChange`, `onSortingChange`, `isLoading`, and `emptyMessage`. Configure:

```ts
useReactTable({ data, columns, rowCount, state: { pagination, sorting }, manualPagination: true, manualSorting: true, getCoreRowModel: getCoreRowModel() });
```

Render semantic `<table>`, `<th scope="col">`, visible sort buttons, an `aria-busy` container, and mobile overflow contained inside the card. `list-state.ts` clamps page/pageSize and allowlists directions without knowing entity-specific sort names.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `pnpm test src/react-app/features/catalog/list-state.test.ts src/react-app/components/data-table.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/react-app/components/data-table.tsx src/react-app/components/data-table.test.tsx src/react-app/features/catalog/list-state.ts src/react-app/features/catalog/list-state.test.ts
git commit -m "feat: add server-driven CMS table foundation"
```

## Task 5: Category and tag CMS pages

**Files:**
- Create: `src/react-app/features/catalog/catalog-api.ts`
- Create: `src/react-app/features/catalog/taxonomy-pages.tsx`
- Create: `src/react-app/features/catalog/taxonomy-pages.test.tsx`
- Modify: `src/react-app/app/router.tsx`
- Modify: `src/react-app/app/cms-shell.tsx`
- Modify: `src/react-app/app/shells.test.tsx`

- [ ] **Step 1: Write failing page and navigation tests**

Render each page in `QueryClientProvider` and `MemoryRouter`; mock fetch with validated paged responses. Assert table rows, URL-backed search, create/edit form labels, inline `422` issues, and `409` conflict messages. Extend shell tests:

```ts
expect(screen.getByRole("link", { name: "Products" })).toHaveAttribute("href", "/cms/products");
expect(screen.getByRole("link", { name: "Categories" })).toHaveAttribute("href", "/cms/categories");
expect(screen.getByRole("link", { name: "Tags" })).toHaveAttribute("href", "/cms/tags");
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm test src/react-app/features/catalog/taxonomy-pages.test.tsx src/react-app/app/shells.test.tsx`

Expected: FAIL because pages and links are absent.

- [ ] **Step 3: Implement validated API hooks and taxonomy pages**

Use query keys shaped as:

```ts
export const catalogKeys = {
  categories: (query: CatalogListQuery) => ["cms", "categories", query] as const,
  tags: (query: CatalogListQuery) => ["cms", "tags", query] as const,
  products: (query: ProductListQuery) => ["cms", "products", query] as const,
  offerings: (query: OfferingListQuery) => ["cms", "offerings", query] as const,
  movements: (query: MovementListQuery) => ["cms", "inventory-movements", query] as const,
};
```

Parse every successful response with its shared response schema. Build `CategoriesPage` and `TagsPage` on `DataTable`; use a labelled dialog or inline card for create/edit, `noValidate`, shared client parsing, and `ApiClientError.details.issues` for field errors.

- [ ] **Step 4: Add routes and CMS links**

Add `/cms/categories` and `/cms/tags` under `CmsArea`. Add Products, Offerings, Categories, Tags, and Inventory movements links for non-delivery shells; leave delivery navigation unchanged.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `pnpm test src/react-app/features/catalog/taxonomy-pages.test.tsx src/react-app/app/shells.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/react-app/app src/react-app/features/catalog src/react-app/components
git commit -m "feat: add CMS taxonomy screens"
```

## Task 6: CMS product API

**Files:**
- Modify: `src/worker/modules/catalog/catalog-repository.ts`
- Modify: `src/worker/modules/catalog/catalog-service.ts`
- Modify: `src/worker/modules/catalog/catalog-routes.ts`
- Create: `src/worker/modules/catalog/product-routes.test.ts`

- [ ] **Step 1: Write failing product route tests**

Cover permissions, canonical create, list filters/sorts, detail projection, complete tag replacement, inactive-tag rejection, duplicate code/slug, stale version, missing entity, and activation requiring active category plus an offering marked active.

```ts
it("replaces product tags and increments version", async () => {
  const fixture = await insertTaxonomyFixture();
  const response = await request(`/api/cms/products/${fixture.productId}`, fixture.cookie, "PUT", {
    version: 1, code: "MILK-1", slug: "whole-milk", name: "Whole Milk", description: "Fresh",
    baseWeightValue: 1, baseWeightUnit: "l", categoryId: fixture.categoryId,
    tagIds: [fixture.tagId], active: false,
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ version: 2, tags: [{ id: fixture.tagId }] });
});
```

- [ ] **Step 2: Run and verify RED**

Run: `pnpm test:worker src/worker/modules/catalog/product-routes.test.ts`

Expected: FAIL with route `404`.

- [ ] **Step 3: Implement product repository/service methods**

Add `listProducts`, `getProduct`, `createProduct`, and `updateProduct`. For create/update, use a negative temporary version sentinel like the existing store repository: guard tag deletion/insertion with the sentinel, then finalize to the positive next version. Validate all referenced taxonomy rows before the batch. Query images ordered ascending and tags by name for canonical details.

- [ ] **Step 4: Add product routes**

```ts
routes.get("/cms/products", requirePermission("catalog:write"), listProducts);
routes.post("/cms/products", requirePermission("catalog:write"), createProduct);
routes.get("/cms/products/:productId", requirePermission("catalog:write"), getProduct);
routes.put("/cms/products/:productId", requirePermission("catalog:write"), updateProduct);
```

- [ ] **Step 5: Run and verify GREEN**

Run: `pnpm test:worker src/worker/modules/catalog/product-routes.test.ts src/worker/modules/catalog/taxonomy-routes.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/worker/modules/catalog src/worker/test/catalog-fixtures.ts
git commit -m "feat: add CMS product APIs"
```

## Task 7: Product table and editor

**Files:**
- Create: `src/react-app/features/catalog/products-page.tsx`
- Create: `src/react-app/features/catalog/products-page.test.tsx`
- Create: `src/react-app/features/catalog/product-form.tsx`
- Create: `src/react-app/features/catalog/product-form.test.tsx`
- Modify: `src/react-app/features/catalog/catalog-api.ts`
- Modify: `src/react-app/app/router.tsx`

- [ ] **Step 1: Write failing product UI tests**

Assert primary-image placeholder, code/name/category/offering count/status cells, server filter requests, create and edit navigation, category/tag controls, normalized submit payload, stale `409` reload action, and disabled activation when prerequisites returned by the API are unmet.

- [ ] **Step 2: Run and verify RED**

Run: `pnpm test src/react-app/features/catalog/products-page.test.tsx src/react-app/features/catalog/product-form.test.tsx`

Expected: FAIL because components do not exist.

- [ ] **Step 3: Implement product queries and screens**

Add hooks `useProducts`, `useProduct`, `useCreateProduct`, and `useUpdateProduct`. On mutation success, invalidate product lists and set the detail cache. Implement routes:

```tsx
{ path: "/cms/products", element: <ProductsPage /> },
{ path: "/cms/products/new", element: <ProductForm mode="create" /> },
{ path: "/cms/products/:productId", element: <ProductForm mode="edit" /> },
```

Use semantic fieldsets for category/tags and preserve server issues by path. Keep the image area as an explicit empty host until Task 9.

- [ ] **Step 4: Run and verify GREEN**

Run: `pnpm test src/react-app/features/catalog/products-page.test.tsx src/react-app/features/catalog/product-form.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/react-app/app/router.tsx src/react-app/features/catalog
git commit -m "feat: add CMS product management"
```

## Task 8: Worker-mediated R2 image gallery API

**Files:**
- Create: `src/worker/modules/catalog/media-repository.ts`
- Create: `src/worker/modules/catalog/media-service.ts`
- Create: `src/worker/modules/catalog/media-routes.test.ts`
- Modify: `src/worker/modules/catalog/catalog-routes.ts`

- [ ] **Step 1: Write failing media tests**

Create small valid byte fixtures for JPEG, PNG, WebP, and AVIF signatures. Test `401/403`, missing product, required alt text, MIME/signature mismatch, 5 MiB limit, five-image conflict, generated key not containing filename, D1 metadata, public stream headers/ETag, inactive-product `404`, reorder, remove/compact, and R2 cleanup after forced D1 insert failure.

```ts
const form = new FormData();
form.set("altText", "Bottle of whole milk");
form.set("image", new File([pngBytes], "../../unsafe name.png", { type: "image/png" }));
const response = await exports.default.fetch(`${origin}/api/cms/products/${productId}/images`, {
  method: "POST", headers: { cookie }, body: form,
});
expect(response.status).toBe(201);
expect((await env.MEDIA.list({ prefix: `products/${productId}/` })).objects).toHaveLength(1);
expect((await env.MEDIA.list()).objects[0]?.key).not.toContain("unsafe name");
```

- [ ] **Step 2: Run and verify RED**

Run: `pnpm test:worker src/worker/modules/catalog/media-routes.test.ts`

Expected: FAIL with route `404`.

- [ ] **Step 3: Implement signature validation and media service**

Export `detectImageType(bytes: Uint8Array)` and match exact signatures for JPEG SOI, PNG, WebP RIFF/WEBP, and AVIF `ftyp` brands. Reject anything else. Use `5 * 1024 * 1024` as the byte limit. Generate `products/${productId}/${crypto.randomUUID()}.${extension}` and call:

```ts
await media.put(objectKey, file.stream(), { httpMetadata: { contentType: detected.mimeType } });
```

If D1 insertion fails, await `media.delete(objectKey)` before rethrowing. For deletion, commit D1 removal/order compaction first and use `ctx.waitUntil(media.delete(objectKey))` only after the route has captured the request ID for logging; tests should be able to await the execution context.

- [ ] **Step 4: Implement media routes**

```ts
routes.post("/cms/products/:productId/images", requirePermission("catalog:write"), uploadImage);
routes.put("/cms/products/:productId/images/order", requirePermission("catalog:write"), reorderImages);
routes.delete("/cms/products/:productId/images/:imageId", requirePermission("catalog:write"), removeImage);
routes.get("/catalog/images/:imageId", getPublicImage);
```

Return `201` for upload and `204` for removal. Stream R2 bodies and set stored content type, quoted ETag, `Cache-Control: public, max-age=86400`, and `X-Content-Type-Options: nosniff`.

- [ ] **Step 5: Run and verify GREEN**

Run: `pnpm test:worker src/worker/modules/catalog/media-routes.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/worker/modules/catalog
git commit -m "feat: add product image galleries in R2"
```

## Task 9: Product gallery CMS controls

**Files:**
- Create: `src/react-app/features/catalog/product-gallery.tsx`
- Create: `src/react-app/features/catalog/product-gallery.test.tsx`
- Modify: `src/react-app/features/catalog/product-form.tsx`
- Modify: `src/react-app/features/catalog/catalog-api.ts`
- Modify: `src/react-app/lib/api-client.ts`
- Modify: `src/react-app/lib/api-client.test.ts`

- [ ] **Step 1: Write failing multipart client and gallery tests**

Verify `apiRequest` sends `FormData` unchanged without JSON content type. Render a five-image gallery and assert primary badge, labelled alt/file controls, upload progress state, maximum count, Move left/right, Remove, successful cache update, and server validation message.

- [ ] **Step 2: Run and verify RED**

Run: `pnpm test src/react-app/lib/api-client.test.ts src/react-app/features/catalog/product-gallery.test.tsx`

Expected: FAIL because multipart bodies are JSON-stringified and gallery is missing.

- [ ] **Step 3: Add multipart support**

Change `ApiRequestInit.body` to `unknown | FormData`. When body is `FormData`, pass it directly and do not set `content-type`; retain JSON behavior for all other defined bodies:

```ts
const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
if (body !== undefined && !isFormData && !requestHeaders.has("content-type")) requestHeaders.set("content-type", "application/json");
const requestBody = body === undefined ? undefined : isFormData ? body : JSON.stringify(body);
```

- [ ] **Step 4: Implement gallery hooks and UI**

Add upload, reorder, and remove mutations. Reorder sends the complete ID list. Disable all gallery mutations while one is pending, use native image previews only before upload, revoke preview object URLs on cleanup, and render persisted images from Worker URLs. Mount the gallery only after a product exists; the create form explains that images can be added after first save.

- [ ] **Step 5: Run and verify GREEN**

Run: `pnpm test src/react-app/lib/api-client.test.ts src/react-app/features/catalog/product-gallery.test.tsx src/react-app/features/catalog/product-form.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/react-app/lib src/react-app/features/catalog
git commit -m "feat: add CMS product gallery controls"
```

## Task 10: Offering APIs and optimistic concurrency

**Files:**
- Create: `src/worker/modules/catalog/offering-repository.ts`
- Create: `src/worker/modules/catalog/offering-service.ts`
- Create: `src/worker/modules/catalog/offering-routes.test.ts`
- Modify: `src/worker/modules/catalog/catalog-routes.ts`

- [ ] **Step 1: Write failing offering tests**

Cover permissions, zero initial stock, structured pack validation, all discount types, effective price rounding, duplicate SKU, inactive-parent preparation, public-sellable projection rules, list filters/sorts, update version increment, stale `409`, and rejection when deactivating the last active offering of an active product.

- [ ] **Step 2: Run and verify RED**

Run: `pnpm test:worker src/worker/modules/catalog/offering-routes.test.ts`

Expected: FAIL with route `404`.

- [ ] **Step 3: Implement offering persistence and rules**

Expose `listOfferings`, `getOffering`, `createOffering`, `updateOffering`, and `countActiveOfferings`. Never include `stock_quantity` in create/update SQL except the database default on insert. Use guarded `UPDATE ... WHERE id = ? AND version = ?`; map zero changes to conflict after distinguishing a missing ID. Calculate response prices with the shared function.

- [ ] **Step 4: Add offering routes**

```ts
routes.get("/cms/offerings", requirePermission("catalog:write"), listOfferings);
routes.post("/cms/offerings", requirePermission("catalog:write"), createOffering);
routes.get("/cms/offerings/:offeringId", requirePermission("catalog:write"), getOffering);
routes.put("/cms/offerings/:offeringId", requirePermission("catalog:write"), updateOffering);
```

- [ ] **Step 5: Run and verify GREEN**

Run: `pnpm test:worker src/worker/modules/catalog/offering-routes.test.ts src/worker/modules/catalog/product-routes.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/worker/modules/catalog
git commit -m "feat: add CMS offering APIs"
```

## Task 11: Atomic inventory adjustments and immutable ledger

**Files:**
- Modify: `src/worker/modules/catalog/offering-repository.ts`
- Modify: `src/worker/modules/catalog/offering-service.ts`
- Create: `src/worker/modules/catalog/inventory-routes.test.ts`
- Modify: `src/worker/modules/catalog/catalog-routes.ts`

- [ ] **Step 1: Write failing inventory tests**

Test permissions separately for `inventory:write`, absolute-to-delta calculation, required reason, no-change `422`, non-negative desired quantity, exactly one movement, stale version with neither stock nor movement change, concurrent updates where one wins, read-only newest-first ledger, and filters.

```ts
it("updates stock and records exactly one balanced movement", async () => {
  const response = await request(`/api/cms/offerings/${offeringId}/inventory-adjustments`, cookie, "POST", {
    stockQuantity: 12, reason: "Opening count", version: 1,
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    offering: { stockQuantity: 12, version: 2 },
    movement: { previousQuantity: 0, quantityDelta: 12, resultingQuantity: 12, reason: "Opening count", offeringVersion: 2 },
  });
});
```

- [ ] **Step 2: Run and verify RED**

Run: `pnpm test:worker src/worker/modules/catalog/inventory-routes.test.ts`

Expected: FAIL with route `404`.

- [ ] **Step 3: Implement one-batch adjustment**

Build two prepared statements with identical guards. First insert movement from the current offering row; second update stock/version:

```sql
INSERT INTO inventory_movement (
  id, offering_id, previous_quantity, quantity_delta, resulting_quantity,
  reason, movement_type, actor_user_id, offering_version, created_at
)
SELECT ?, id, stock_quantity, ? - stock_quantity, ?, ?, 'manual_adjustment', ?, version + 1, ?
FROM offering
WHERE id = ? AND version = ? AND stock_quantity = ? AND ? >= 0 AND ? <> stock_quantity;

UPDATE offering SET stock_quantity = ?, version = version + 1, updated_at = ?
WHERE id = ? AND version = ? AND stock_quantity = ? AND ? <> stock_quantity;
```

Run both with `database.batch`, require `meta.changes === 1` for each, and re-read canonical offering plus movement. Stale guards make both no-ops; SQL failures roll back both.

- [ ] **Step 4: Add inventory routes**

```ts
routes.post("/cms/offerings/:offeringId/inventory-adjustments", requirePermission("inventory:write"), adjustInventory);
routes.get("/cms/inventory-movements", requirePermission("inventory:write"), listInventoryMovements);
```

- [ ] **Step 5: Run and verify GREEN**

Run: `pnpm test:worker src/worker/modules/catalog/inventory-routes.test.ts`

Expected: PASS, including concurrent-update assertion.

- [ ] **Step 6: Commit**

```bash
git add src/worker/modules/catalog
git commit -m "feat: add immutable inventory movement ledger"
```

## Task 12: Offering and inventory CMS screens

**Files:**
- Create: `src/react-app/features/catalog/offerings-page.tsx`
- Create: `src/react-app/features/catalog/offerings-page.test.tsx`
- Create: `src/react-app/features/catalog/offering-form.tsx`
- Create: `src/react-app/features/catalog/offering-form.test.tsx`
- Create: `src/react-app/features/catalog/inventory-pages.tsx`
- Create: `src/react-app/features/catalog/inventory-pages.test.tsx`
- Modify: `src/react-app/features/catalog/catalog-api.ts`
- Modify: `src/react-app/app/router.tsx`

- [ ] **Step 1: Write failing CMS tests**

Assert offering columns, low-stock state, formatted list/effective prices, pack fields, discount-dependent labels, no normal stock field, adjustment absolute count and delta preview, required reason, stale reload action, read-only ledger, URL filters, and newest-first request.

- [ ] **Step 2: Run and verify RED**

Run: `pnpm test src/react-app/features/catalog/offerings-page.test.tsx src/react-app/features/catalog/offering-form.test.tsx src/react-app/features/catalog/inventory-pages.test.tsx`

Expected: FAIL because screens are missing.

- [ ] **Step 3: Implement hooks and screens**

Add routes:

```tsx
{ path: "/cms/offerings", element: <OfferingsPage /> },
{ path: "/cms/offerings/new", element: <OfferingForm mode="create" /> },
{ path: "/cms/offerings/:offeringId", element: <OfferingForm mode="edit" /> },
{ path: "/cms/inventory", element: <InventoryMovementsPage /> },
```

Use `Intl.NumberFormat` in a small `formatMoney(minor, currency = "INR")` helper. The adjustment UI calculates `desired - current`, announces it through `aria-live`, and submits the current offering version. On success update offering detail/list caches and invalidate movements.

- [ ] **Step 4: Run and verify GREEN**

Run: `pnpm test src/react-app/features/catalog/offerings-page.test.tsx src/react-app/features/catalog/offering-form.test.tsx src/react-app/features/catalog/inventory-pages.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/react-app/app/router.tsx src/react-app/features/catalog src/react-app/lib
git commit -m "feat: add CMS offering and inventory screens"
```

## Task 13: Public catalog and search APIs

**Files:**
- Create: `src/worker/modules/catalog/public-repository.ts`
- Create: `src/worker/modules/catalog/public-catalog-routes.test.ts`
- Modify: `src/worker/modules/catalog/catalog-service.ts`
- Modify: `src/worker/modules/catalog/catalog-routes.ts`

- [ ] **Step 1: Write failing public API tests**

Seed active/inactive categories, tags, products, offerings, prices, stock, and images. Test anonymous access; category/tag exclusion; list primary image, minimum effective price, promotion and availability summaries; detail gallery/offering order; `404` for inactive/missing; escaped `%`/`_` search; matching across every approved field; category/tag/in-stock/min/max filters; allowlisted sorts; default/max pagination; malformed query `400`; and stable ID tiebreaks.

- [ ] **Step 2: Run and verify RED**

Run: `pnpm test:worker src/worker/modules/catalog/public-catalog-routes.test.ts`

Expected: FAIL with route `404`.

- [ ] **Step 3: Implement public repository queries**

Use parameterized `EXISTS` subqueries for tags, search fields, and sellable offerings. Escape LIKE terms with:

```ts
export function escapeLike(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}
```

Every public product predicate must require `product.active = 1`, `category.active = 1`, and an active offering. Compute effective prices in SQL with integer arithmetic matching `calculateEffectivePrice`; parse all responses through shared schemas before returning.

- [ ] **Step 4: Add anonymous public routes before CMS guards**

```ts
routes.get("/catalog/categories", listPublicCategories);
routes.get("/catalog/tags", listPublicTags);
routes.get("/catalog/products", listPublicProducts);
routes.get("/catalog/products/:slug", getPublicProduct);
routes.get("/catalog/search", searchPublicCatalog);
```

- [ ] **Step 5: Run and verify GREEN**

Run: `pnpm test:worker src/worker/modules/catalog/public-catalog-routes.test.ts src/worker/modules/catalog/media-routes.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/worker/modules/catalog
git commit -m "feat: add public catalog and search APIs"
```

## Task 14: Phase integration, documentation, and complete verification

**Files:**
- Modify: `README.md`
- Modify: `src/react-app/app/router.test.tsx`
- Modify: `src/react-app/app/shells.test.tsx`

- [ ] **Step 1: Write final integration assertions**

Add tests proving owner/admin/operations navigation exposes Phase 2 screens, delivery navigation does not, malformed successful API payloads are rejected by hooks, and all former Phase 1 routes still render. Do not add storefront UI.

- [ ] **Step 2: Run focused integration suites**

Run: `pnpm test src/react-app/app src/react-app/features/catalog src/shared && pnpm test:worker src/worker/modules/catalog src/worker/db/schema`

Expected: PASS with no warnings or unhandled rejections.

- [ ] **Step 3: Update README Phase status and architecture**

Replace the Phase 1-only status with a Phase 1–2 status. Document CMS routes, the five-image/5 MiB policy, local R2 use, offering-level stock, immutable manual movements, public catalog endpoints, and that storefront/cart/checkout/orders remain future phases. Keep remote-resource warnings intact.

- [ ] **Step 4: Apply and inspect the local migration**

Run: `pnpm db:migrate:local`

Expected: migration `0001` applies to the explicitly local D1 database. Then run:

`pnpm exec wrangler d1 execute supashop-db --local --command "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('category','tag','product','product_image','offering','inventory_movement') ORDER BY name"`

Expected: six named tables are returned; `product_tag` is also present when queried separately.

- [ ] **Step 5: Run complete repository verification**

Run each command separately and stop on the first failure:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:worker
pnpm build
pnpm exec wrangler deploy --dry-run
```

Expected: every command exits `0`; tests have no failures; the dry run reports valid `DB` and `MEDIA` bindings.

- [ ] **Step 6: Review the final diff**

Run: `git status --short && git diff --check && git diff --stat master...HEAD`

Expected: only intended Phase 2 files are changed, no whitespace errors, and `.pnpm-store/` remains untracked and unstaged.

- [ ] **Step 7: Commit final integration changes**

```bash
git add README.md src/react-app/app/router.test.tsx src/react-app/app/shells.test.tsx
git commit -m "docs: complete phase 2 catalog handoff"
```

## Completion gate

Before calling Phase 2 complete, verify every success criterion in the design spec maps to passing automated evidence:

- CMS role and route tests prove access boundaries.
- Schema and Worker tests prove image, offering, concurrency, and ledger invariants.
- Public route tests prove only sellable catalog data is exposed.
- React tests prove tables, forms, gallery, conflicts, and narrow layouts work.
- Repository-wide verification and Wrangler dry run exit successfully.

Do not begin Phase 3 in the Phase 2 branch.
