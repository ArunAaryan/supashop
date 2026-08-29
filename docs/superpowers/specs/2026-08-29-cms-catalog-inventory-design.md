# Phase 2 CMS Catalog and Offering Inventory Design

**Date:** 2026-08-29  
**Status:** Approved for specification review  
**Target:** Phase 2 of the single-store Supashop delivery application

## 1. Outcome

Phase 2 adds the catalog and inventory foundation required by the storefront, cart, checkout, and order phases. Authorized CMS staff can manage flat categories, tags, product master records, ordered product-image galleries, sellable offerings, and offering-level stock. Anonymous clients can browse and search the active catalog through stable public APIs.

This phase does not build the customer storefront, carts, checkout, orders, analytics, store media, or audit-log UI. It exposes the public catalog contracts that Phase 3 will consume.

## 2. Approved Decisions

- Each product supports an ordered gallery of up to five images. Display order `0` is the primary image.
- Image uploads pass through the Worker. Clients do not receive upload credentials or choose R2 object keys.
- Categories are flat. A product belongs to one category and may have many tags.
- Offering pack details use structured quantity and weight fields plus a customer-facing label.
- Inventory adjustments submit an absolute resulting stock count. The server calculates and records the signed delta.
- CMS and public listings use server-side page-based pagination, filtering, and sorting.
- Percentage discounts use basis points; `1250` means `12.50%`.
- Implementation proceeds as vertical slices: taxonomy, products/images, offerings/inventory, then public catalog/search.

## 3. Architecture

Phase 2 follows the boundaries established in Phase 1:

- Shared Zod contracts define request, response, filter, and pagination shapes.
- Shared pure domain functions validate pack details and calculate discounts and effective prices.
- Hono routes translate HTTP, parse payloads, enforce permissions, and map domain failures.
- Services enforce catalog, activation, image-count, concurrency, and inventory rules.
- D1 and R2 repositories own persistence details.
- React features consume public contracts through the existing API client and TanStack Query provider.
- CMS screens use TanStack Table for server-driven lists and focused forms for mutations.

The implementation is split into four runnable vertical slices:

1. Categories and tags
2. Product records and R2 image galleries
3. Offerings and the inventory movement ledger
4. Public catalog and search APIs

Each slice includes schema, contracts, Worker behavior, CMS behavior, and tests before the next slice begins.

## 4. Authorization

All CMS catalog routes require an authenticated active CMS role and a server-side permission check.

| Role | Catalog reads | Catalog writes | Inventory adjustments |
|---|---:|---:|---:|
| `owner` | Yes | Yes | Yes |
| `admin` | Yes | Yes | Yes |
| `operations` | Yes | Yes | Yes |
| `delivery` | No | No | No |

Existing `catalog:write` and `inventory:write` permissions remain authoritative. A new `catalog:read` permission is unnecessary in Phase 2 because the three managing roles already have catalog write access. CMS reads require `catalog:write`; inventory movement reads require `inventory:write`. Public catalog and image reads are anonymous and expose only active, customer-safe data.

## 5. Data Model

All identifiers are server-generated UUIDs. All timestamps are UTC milliseconds. Codes, slugs, and SKUs are trimmed and normalized before persistence. Uniqueness is global, including inactive records, so identifiers are never silently reused.

### 5.1 Category

`category` contains:

- `id`
- unique `name`
- unique lowercase `slug`
- optional `description`
- `active`
- `created_at` and `updated_at`

Categories are flat and have no parent identifier. A category may be deactivated only when no active product belongs to it.

### 5.2 Tag

`tag` contains:

- `id`
- unique `name`
- unique lowercase `slug`
- `active`
- `created_at` and `updated_at`

A tag may be deactivated while assigned to products. Deactivated tags remain attached for CMS history but disappear from public responses and cannot be newly assigned until reactivated.

### 5.3 Product

`product` contains:

- `id`
- unique uppercase product `code`
- unique lowercase `slug`
- `name`
- `description`
- optional integer `base_weight_value`
- optional `base_weight_unit`: `g`, `kg`, `ml`, or `l`
- required `category_id`
- `active`
- optimistic-concurrency `version`
- `created_at` and `updated_at`

Base weight value and unit must either both be present or both be absent. Products may be created inactive before they have an offering or image. Activating a product requires an active category and at least one offering marked active. Images are optional.

`product_tag` uses a composite primary key of `product_id` and `tag_id`. Product writes replace the complete tag assignment in one D1 batch after validating that every requested tag is active.

### 5.4 Product images

`product_image` contains:

- `id`
- `product_id`
- unique opaque `object_key`
- `mime_type`
- `byte_size`
- required `alt_text`
- `display_order` from `0` through `4`
- `created_by`
- `created_at`

The database enforces unique `(product_id, display_order)` values. The service enforces display orders `0` through `4` and at most five images per product. Public and CMS responses expose an image ID and Worker URL, never the R2 object key.

### 5.5 Offering

`offering` contains:

- `id`
- `product_id`
- unique uppercase `sku`
- customer-facing `label`
- optional positive integer `pack_quantity`
- optional positive integer `weight_value`
- optional `weight_unit`: `g`, `kg`, `ml`, or `l`
- positive integer `list_price_minor`
- `discount_type`: `none`, `fixed`, or `percentage`
- non-negative integer `discount_value`
- non-negative integer `stock_quantity`
- non-negative integer `low_stock_threshold`
- `active`
- optimistic-concurrency `version`
- `created_at` and `updated_at`

At least one of `pack_quantity` or the weight pair is required. Weight value and unit must appear together. For `none`, discount value must be zero. A fixed discount is stored in minor units and must be less than the list price. A percentage discount is stored in basis points and must be between `1` and `10_000`. Effective price is calculated with integer arithmetic and cannot be negative.

An offering may be marked active while its parent product is inactive so staff can prepare the complete sellable configuration before product activation. It is publicly sellable only when both records are active. Deactivating the last active offering of an active product is rejected; staff must deactivate the product first or activate another offering.

New offerings always begin with stock quantity `0`; stock is not accepted by the general create or update contracts. Staff use the dedicated inventory adjustment after creation, ensuring every transition away from zero has a corresponding movement.

### 5.6 Inventory movement

`inventory_movement` is append-only and contains:

- `id`
- `offering_id`
- `previous_quantity`
- signed non-zero `quantity_delta`
- `resulting_quantity`
- `reason`
- `movement_type`, initially `manual_adjustment`
- `actor_user_id`
- resulting `offering_version`
- `created_at`

The database checks that quantities are non-negative, the delta is non-zero, and `previous_quantity + quantity_delta = resulting_quantity`. Foreign keys use restrictive deletion. Phase 2 exposes no update or delete operation for movement rows.

Future phases extend `movement_type` with checkout deduction and cancellation restoration without changing the ledger invariant.

## 6. Image Storage and Delivery

### 6.1 Upload policy

The CMS sends one image per multipart request. The Worker validates before writing:

- `catalog:write` permission
- product existence
- fewer than five current images
- one file part and required alt text
- declared and detected type limited to JPEG, PNG, WebP, or AVIF
- maximum file size of 5 MiB
- non-empty image content

The implementation checks file signatures for the four accepted formats rather than trusting only the multipart MIME declaration. SVG and GIF are not accepted in Phase 2. The Worker generates a key shaped like `products/{productId}/{uuid}.{extension}`; no client filename appears in the key.

### 6.2 Write consistency

R2 and D1 cannot participate in one transaction, so image mutations use explicit compensation:

1. Validate the request and reserve the next display order from current D1 state.
2. Write the object to R2 with HTTP content-type metadata.
3. Insert the D1 image record.
4. If the D1 insert fails, attempt to delete the newly written R2 object and return the mapped failure.

Concurrent uploads are protected by the unique display-order constraint and five-image validation. A losing upload cleans up its newly written object.

Image removal first removes the D1 record and compacts remaining display orders in one D1 batch, then deletes the R2 object. A missing R2 object is treated as already cleaned up. If R2 deletion fails after the D1 change, the request records the failure with its request ID and returns success for the catalog mutation; the unreachable object is an orphan, not public data, and can be cleaned by an operational maintenance task outside this phase.

Reordering submits the complete ordered list of current image IDs. The service rejects missing, duplicate, foreign, or stale IDs and updates all display orders atomically. To preserve the unique `(product_id, display_order)` constraint during swaps, one D1 batch first moves the product's current orders to a temporary non-public range and then writes the final `0` through `4` values. A failure rolls back both statements. Order `0` is always the primary image.

### 6.3 Public image route

`GET /api/catalog/images/:imageId` resolves active product-image metadata in D1 and streams the object from R2. It returns the stored content type, ETag, and a public cache policy. Missing metadata, inactive products, or missing objects return `404`. Raw object keys are never accepted in a route parameter.

## 7. Inventory Adjustment Consistency

Inventory is changed only through a dedicated adjustment use case, not the general offering update route.

The request includes:

- desired absolute `stockQuantity`
- non-empty operational `reason`
- expected offering `version`

The service reads the offering, rejects stale versions and no-change requests, and calculates the signed delta. It then submits one D1 batch containing a guarded movement `INSERT ... SELECT` followed by a guarded stock update. Both statements use the same offering ID, expected version, previous quantity, and desired quantity predicates. The update increments the offering version only when those predicates still match. The service verifies that both statements affected exactly one row. A stale or changed row makes both statements no-ops and returns `409`; a statement failure rolls back the complete batch. No movement can remain without its corresponding stock update.

The response returns the updated offering and newly created movement. Inventory movement pages sort newest first by default and support offering, movement type, actor, and time filters.

## 8. API Design

All list responses use:

```json
{
  "items": [],
  "page": 1,
  "pageSize": 20,
  "totalItems": 0,
  "totalPages": 0
}
```

Page numbers start at `1`. The default page size is `20`; the maximum is `100`. Every endpoint uses an allowlist of sortable fields and adds a stable ID tiebreaker.

### 8.1 CMS routes

- `GET/POST /api/cms/categories`
- `PUT /api/cms/categories/:categoryId`
- `GET/POST /api/cms/tags`
- `PUT /api/cms/tags/:tagId`
- `GET/POST /api/cms/products`
- `GET/PUT /api/cms/products/:productId`
- `POST /api/cms/products/:productId/images`
- `PUT /api/cms/products/:productId/images/order`
- `DELETE /api/cms/products/:productId/images/:imageId`
- `GET/POST /api/cms/offerings`
- `GET/PUT /api/cms/offerings/:offeringId`
- `POST /api/cms/offerings/:offeringId/inventory-adjustments`
- `GET /api/cms/inventory-movements`

Create and update responses return the complete canonical entity. Product responses include category, tags, ordered images, and a summarized offering count. Offering responses include calculated effective price and availability.

### 8.2 Public routes

- `GET /api/catalog/categories`
- `GET /api/catalog/tags`
- `GET /api/catalog/products`
- `GET /api/catalog/products/:slug`
- `GET /api/catalog/search`
- `GET /api/catalog/images/:imageId`

Public product lists and search return active products in active categories with at least one active offering. They include the primary image and offering-level minimum effective price, promotion presence, and availability summary. Product detail returns its ordered gallery, active category, active tags, and active offerings.

Search matches normalized product name, product code, description, category name, active tag names, offering labels, and SKUs using escaped SQLite `LIKE` predicates in Phase 2. The initial catalog is small enough that FTS is unnecessary. Explicit indexes cover exact filters and joins; FTS can be introduced later without changing the response contract.

Supported public filters are category slug, tag slug, in-stock status, minimum effective price, and maximum effective price. Supported sorts are relevance for non-empty search, name, lowest effective price, and newest. Search text is trimmed and limited to 100 characters.

## 9. CMS Experience

The CMS adds navigation and pages for categories, tags, products, offerings, and inventory movements. Owner, admin, and operations users see these routes; delivery users do not.

Each index page uses TanStack Table in manual pagination, sorting, and filtering mode. URL query parameters are the source of truth for list state so refresh and browser navigation preserve the view. Empty, loading, error, and no-result states are explicit.

### 9.1 Taxonomy

Category and tag pages use compact tables with name, slug, status, usage count, and updated time. Create and edit forms validate names and slugs before submission. Deactivation conflicts explain which active products prevent the change.

### 9.2 Products

The product table shows primary image, code, name, category, active offering count, status, and updated time. The product editor manages descriptive fields, category, tags, activation, and the ordered image gallery. Upload progress and per-image validation errors remain local to the gallery; successful mutations invalidate only affected product queries.

### 9.3 Offerings and inventory

The offering table shows SKU, product, pack label, list price, effective price, discount, stock, low-stock state, status, and updated time. Offering editing does not expose stock as a normal field.

An inventory adjustment action displays current stock, accepts the desired stock count and required reason, previews the calculated delta, and submits the current version. The movement ledger is read-only and links each row back to its offering.

All forms retain the existing Soft Logistics visual language, visible focus treatment, associated labels, inline field errors, keyboard operation, and responsive behavior. Dense desktop tables become horizontally contained card/list presentations on narrow screens without hiding operational values.

## 10. Error Handling

Phase 2 uses the existing structured API error envelope and request ID behavior.

| Status | Phase 2 use |
|---|---|
| `400` | Malformed JSON, multipart, pagination, sorting, or filter combinations |
| `401` | Authentication required |
| `403` | Authenticated role lacks the required permission |
| `404` | Entity or public image is unavailable to the caller |
| `409` | Duplicate identifier, stale version, activation/deactivation conflict, image limit, or concurrent image ordering conflict |
| `422` | Field, pack, pricing, discount, stock, alt-text, MIME, signature, or upload-size validation |
| `500` | Unexpected D1/R2 failure with a safe message and request ID |

Known database uniqueness and guarded-update failures are translated into stable conflict codes. Public errors never reveal inactive catalog records or R2 object keys. R2 and D1 implementation errors are not returned verbatim.

## 11. Testing Strategy

### 11.1 Shared tests

- Category, tag, product, offering, inventory, query, and pagination contracts
- Slug, code, and SKU normalization
- Fixed and basis-point discount calculations and rounding
- Pack-field combinations and effective-price invariants

Percentage discounts round down to the nearest minor unit, making the effective price deterministic: `discountMinor = floor(listPriceMinor * basisPoints / 10_000)`.

### 11.2 D1 and Worker tests

- Migration constraints, indexes, foreign keys, and global uniqueness
- CMS permission enforcement for all reads and mutations
- Category deactivation blocked by active products
- Tag deactivation and assignment behavior
- Product tag replacement and activation rules
- Five-image limit, ordering, signature/MIME/size validation, and generated keys
- R2 compensation after D1 image failure and public object streaming
- Offering activation, discount constraints, and stale-version conflicts
- Atomic guarded stock update and movement insertion
- No-change inventory rejection and immutable ledger behavior
- Public inactive-record exclusion, filtering, sorting, pagination, and search

### 11.3 React tests

- CMS route visibility by role
- Manual TanStack Table pagination, filters, sorting, and URL persistence
- Category, tag, product, and offering form validation and API errors
- Gallery upload, removal, reordering, primary-image indication, and five-image limit
- Inventory delta preview, required reason, conflict recovery, and ledger rendering
- Keyboard access, labels, focus, loading states, empty states, and narrow layouts

### 11.4 Phase verification

At completion, run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:worker
pnpm build
pnpm exec wrangler deploy --dry-run
```

The phase is complete only when every command exits successfully and the dry run validates both `DB` and `MEDIA` bindings.

## 12. Success Criteria

Phase 2 is complete when:

- Authorized owner, admin, and operations users can manage categories, tags, products, images, and offerings.
- Each product has at most five ordered images, served publicly without revealing R2 keys.
- Offerings model structured packs, integer prices, precise discounts, independent stock, and low-stock thresholds.
- Every stock mutation produces exactly one immutable movement in the same D1 transaction.
- Stale offering or inventory edits cannot silently overwrite newer values.
- Anonymous clients can browse, filter, sort, paginate, and search only the active sellable catalog.
- CMS tables remain usable with keyboard controls and on narrow screens.
- All Phase 2 tests and repository-wide verification pass.

## 13. Current Cloudflare References

- [Use R2 from Workers](https://developers.cloudflare.com/r2/api/workers/workers-api-usage/)
- [R2 Workers API reference](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)
- [D1 database Worker API and transactional batches](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- [Workers platform limits](https://developers.cloudflare.com/workers/platform/limits/)
