# Single-Store Delivery Commerce Application Design

**Date:** 2026-08-09  
**Status:** Approved design  
**Target:** One independently deployed store per application instance

## 1. Product Summary

Build a delivery-commerce application with two experiences in one React application:

1. A customer storefront for registered customers and guests.
2. A responsive CMS for the store owner, administrators, operations staff, and delivery staff.

The store sells **offerings**, not raw product-master records. A product master contains descriptive catalog data. An offering combines a product with a sellable pack configuration, price, discount, and independently managed stock count.

The first release serves one physical store or warehouse. It accepts cash on delivery only and uses checkout-time inventory deduction. Adding an offering to a cart does not reserve stock.

## 2. Goals

- Let customers quickly discover, search, compare, and order active offerings.
- Support email/password accounts and anonymous guest checkout.
- Give store staff a complete catalog, inventory, order, delivery, and analytics workflow.
- Prevent overselling and duplicate orders through atomic, idempotent checkout.
- Preserve an immutable record of what the customer ordered and where it was sent.
- Provide secure QR or PIN confirmation for delivery completion.
- Keep the architecture appropriate for a small firm while preserving clean domain boundaries.

## 3. Explicit Non-Goals

The first release does not include:

- Multiple stores, tenants, or Better Auth organizations
- Store creation or store-onboarding routes
- Mobile OTP authentication
- Online payments
- Cart-time stock reservations or ten-minute inventory holds
- Live delivery GPS tracking
- Coupons, loyalty points, or referral programs
- Push or SMS notifications
- A separate delivery-agent application
- Multi-warehouse allocation

## 4. Users and Access

### 4.1 Customer identities

- Registered customers use Better Auth email/password authentication.
- Guests use an opaque, signed, HttpOnly browser-session identifier.
- Customers are normal application users; they are not organization members.
- Registered customers receive persistent order history, saved addresses, and reorder functionality.
- Guest orders remain accessible from the originating browser session. Guest order identifiers must not be enumerable.

### 4.2 CMS roles

CMS authorization is application-level and server-enforced:

| Role | Capabilities |
|---|---|
| `owner` | Full access, store settings, CMS user roles, catalog, inventory, orders, analytics, audit records |
| `admin` | Catalog, inventory, orders, analytics, and most store settings; cannot transfer or remove ownership |
| `operations` | Products, offerings, stock, and order fulfilment |
| `delivery` | Assigned/active delivery orders, delivery status, QR scanning, and PIN verification |

The first owner is provisioned during instance setup. UI visibility improves usability, but every privileged API endpoint independently checks the authenticated user's role and permission.

## 5. Navigation and Routes

The login screen is the application entry point. `/` redirects to `/login` unless an existing session can be routed directly.

### 5.1 Public and customer routes

- `/login` — email login, registration, password recovery, and **Continue as guest**
- `/shop` — storefront home
- `/search` — search results and filters
- `/products/:slug` — product details and offering selection
- `/cart` — cart lines and current totals
- `/checkout` — contact, delivery address, instructions, and COD confirmation
- `/orders/:orderNumber` — order status, ETA, cancellation, and delivery proof
- `/account` — customer profile, addresses, and order history

### 5.2 CMS routes

- `/cms` — operational dashboard
- `/cms/products`
- `/cms/categories`
- `/cms/tags`
- `/cms/offerings`
- `/cms/orders`
- `/cms/orders/:orderNumber`
- `/cms/customers`
- `/cms/analytics`
- `/cms/team`
- `/cms/audit`
- `/cms/settings/store`

The delivery role uses the same responsive CMS. On narrow screens it receives a simplified assigned-deliveries view, order details, and QR/PIN completion flow.

## 6. Visual and Interaction Direction

The approved direction is **Soft Logistics**, inspired by the supplied reference image.

- Warm peach and cream atmospheric backgrounds
- Off-white primary surfaces
- Near-black navigation, tracking, and operational panels
- Orange-red focal actions
- Compact typography, rounded cards, pill controls, and generous touch targets
- Friendly dimensional artwork for categories and product imagery
- Subtle, purposeful motion with reduced-motion support

The customer experience is mobile-first and optimized for thumb reach. The CMS shares the same tokens but uses denser layouts and TanStack Table for sortable, filterable tabular views. Decorative elements must never obscure price, stock, discount, status, or validation information.

## 7. Customer Experience

### 7.1 Storefront home

- Delivery-address summary
- Prominent search
- Category navigation
- Best-selling offerings
- Active promotions derived from offering discounts
- Recently ordered items for authenticated customers
- Persistent cart indicator showing item count and current total
- Fixed mobile navigation for Home, Search, Cart, Orders, and Account

### 7.2 Product and offering selection

The product page shows the product description, images, category, and all active offerings belonging to that product. Each offering displays its pack configuration, current price, discount, effective price, and availability. Selecting a different offering updates displayed values without navigating away.

### 7.3 Cart

- Add, increment, decrement, and remove offering lines
- Recalculate using current server prices
- Clearly identify inactive, unavailable, or repriced offerings
- Do not reserve or deduct stock
- Merge a guest cart into the registered account cart after sign-in, resolving duplicate offerings by quantity

### 7.4 Checkout

Checkout accepts cash on delivery only. Required delivery data:

- Recipient name
- Mobile number
- Address line 1
- Address line 2, optional
- Landmark, optional
- City
- State
- Postal code
- Latitude and longitude, optional
- Delivery instructions, optional

Browser geolocation may capture coordinates with explicit permission, but the customer must still provide a usable written address. There is no live location tracking.

Before placing an order, the server validates store hours, order cut-off rules, postal-code serviceability, offering activity, prices, discounts, and stock.

### 7.5 Orders

Registered customers see persistent order history and can reorder available items. Guests can view and cancel eligible orders from the originating browser session.

An order detail screen displays:

- Order number and placed time
- Current status and history timeline
- Expected delivery time
- Item and price breakdown
- Address snapshot and instructions
- Cancellation action when permitted
- Opaque QR code and six-digit fallback PIN while out for delivery

Status-based tracking is used. No driver location or live map is shown.

## 8. CMS Experience

### 8.1 Dashboard and analytics

Dashboard cards and charts show:

- Orders today and for the previous week
- Delivered revenue
- Units sold
- Average order value
- Cancellation count and rate
- Top products and offerings
- Low-stock offerings
- Live order queue

Analytics use the store's configured timezone. By default, sales metrics include delivered orders. Revenue means delivered COD collected, while units sold are the sum of delivered order-item quantities.

### 8.2 Product master

CMS users can create and edit:

- Unique product code
- Name and slug
- Description
- Base weight value and unit
- Category
- Tags
- Active status
- Ordered image gallery with alt text

Product images and store media are stored in Cloudflare R2. D1 stores object keys, metadata, ownership, and display order.

### 8.3 Offerings

An offering is the sellable SKU and contains:

- Parent product
- Customer-facing label
- Pack quantity and/or weight configuration
- List price in integer minor currency units
- Discount type: none, fixed amount, or percentage
- Discount value
- Independently managed stock count
- Low-stock threshold
- Active status
- Optimistic concurrency version

Stock exists only at offering level. Offerings of the same product do not share inventory.

### 8.4 Order operations

CMS users can search, filter, sort, and inspect orders. The order page supports acknowledgement, expected delivery time, valid status transitions, required reasons for rejection/cancellation, COD state, and status history.

### 8.5 Store settings

Authorized CMS users can update the singleton store profile:

- Store name and customer-facing description
- Logo, banner, and gallery images
- Owner/contact person name
- Mobile number and email
- Address, landmark, postal code, and optional coordinates
- External directions link
- Timezone
- Opening hours, weekly closures, and exceptional closures
- Order cut-off time
- Serviceable postal codes
- Customer-facing delivery and store instructions

There is no store creation interface. One store profile belongs to the deployed application instance.

## 9. Order Lifecycle

The primary path is:

`placed → confirmed → preparing → ready → out_for_delivery → delivered`

Terminal alternatives are `cancelled` and `rejected`.

### 9.1 Transition rules

- Successful checkout creates a `placed` order and deducts stock.
- CMS acknowledgement changes `placed` to `confirmed` and records an expected delivery time.
- Staff progress the order through `preparing`, `ready`, and `out_for_delivery`.
- Entering `out_for_delivery` enables delivery QR/PIN proof.
- Valid one-time proof changes the order to `delivered` and records COD collection.
- Customers may cancel only while `placed` or `confirmed`.
- Authorized CMS users may cancel or reject any undelivered order, with a required reason.
- Cancelling or rejecting restores the exact offering quantities once.
- Every transition records the actor, time, previous status, next status, and reason or metadata.

Order status and payment status are separate. COD payment states are `pending`, `collected`, and `exception`. Payment exceptions require an authorized actor and reason.

## 10. Inventory and Checkout Guarantees

The cart is a shopping list and never changes stock.

Checkout follows these invariants:

1. The client sends an idempotency key with the place-order request.
2. Shared Zod schemas validate the request shape.
3. The server re-reads active offerings and computes authoritative prices and totals.
4. A transactional D1 batch creates the order and snapshots, writes inventory movements, and deducts offering stock.
5. Database constraints and guarded writes abort the entire batch if any offering is inactive or lacks stock.
6. A repeated request with the same idempotency key returns the original result instead of placing a second order.

No partial order, partial item insertion, or partial stock deduction is allowed.

Price or availability changes return `409 Conflict` with affected offerings and current values. The cart remains intact so the customer can review and retry.

All inventory changes write an immutable movement record with offering, signed quantity delta, resulting quantity, reason, actor, related order when applicable, and timestamp. Movement types include checkout deduction, cancellation restoration, and manual adjustment.

## 11. Delivery Proof

- The QR encodes a high-entropy opaque token, never customer or order details.
- The six-digit PIN is a fallback for scanning failures.
- Only token and PIN hashes are stored.
- Proof is valid only for the associated `out_for_delivery` order and expires within the configured delivery window.
- Proof is one-time use and invalidated on delivery, cancellation, rejection, or regeneration.
- Verification and delivery transition occur atomically.
- Repeated verification returns the existing delivered result without applying a second transition.

## 12. Data Model

### 12.1 Authentication and access

- Better Auth generated user, account, session, and verification tables
- `user_profile`: customer details and account classification
- `cms_role`: user, role, status, granted by, and timestamps

### 12.2 Store and serviceability

- `store_profile`: singleton contact, address, timezone, directions, and configuration
- `store_media`: R2 object metadata and display order
- `store_hours`: weekday opening intervals
- `store_closure`: exceptional closure date ranges and reason
- `serviceable_postal_code`: allowed postal codes and active state

### 12.3 Catalog

- `category`
- `tag`
- `product`
- `product_tag`
- `product_image`
- `offering`
- `inventory_movement`

Catalog rows use soft deactivation where historical order references must remain valid. Frequently searched and joined fields receive explicit indexes.

### 12.4 Shopping and ordering

- `cart`: registered user or guest-session ownership
- `cart_item`: offering and requested quantity
- `customer_address`: reusable registered-customer addresses
- `order`
- `order_address`: immutable delivery snapshot
- `order_item`: immutable product, offering, pack, price, discount, and quantity snapshots
- `order_status_history`
- `delivery_proof`
- `checkout_idempotency`
- `audit_log`

Every domain row that needs money stores integer minor currency units. Timestamps are stored in UTC and presented in the store timezone.

## 13. Application Architecture

### 13.1 Frontend

- React and TypeScript
- Tailwind CSS with shared design tokens
- TanStack Query for server state, mutations, caching, and invalidation
- TanStack Table for all CMS tabular views
- Zod schemas shared with the backend where practical
- Route-level access guards for navigation ergonomics, backed by server authorization

TanStack Query is the source of truth for fetched server state. Local component state is restricted to presentation and transient input state.

### 13.2 Backend

- Hono API hosted on Cloudflare Workers
- Better Auth with email/password and the Drizzle SQLite adapter
- Drizzle ORM with Cloudflare D1
- Cloudflare R2 Worker binding for images
- Layered modules for authentication, authorization, catalog, cart, checkout, orders, delivery proof, store settings, and analytics

The Hono request layer parses input and maps errors. Domain services enforce business invariants. Repository modules encapsulate Drizzle/D1 access. Modules communicate through explicit typed interfaces rather than importing route internals.

### 13.3 Data flow

1. React submits a typed request.
2. Hono middleware resolves the Better Auth session or guest session.
3. Zod validates inputs.
4. Authorization checks role and resource access.
5. A focused domain service executes the use case.
6. A repository performs D1/R2 operations.
7. The API returns a stable success or structured error envelope.
8. TanStack Query updates or invalidates only affected cached resources.

## 14. Error Handling

The API returns stable machine-readable error codes with safe user-facing messages.

| HTTP status | Use |
|---|---|
| `400` | Malformed request or invalid query combination |
| `401` | Authentication required or invalid guest session |
| `403` | Authenticated but not permitted |
| `404` | Resource unavailable to the caller |
| `409` | Stock/price change, duplicate code, stale version, or illegal state transition |
| `422` | Field validation, unsupported postal code, store closed, or cut-off violation |
| `429` | Authentication or sensitive-action rate limit |
| `500` | Unexpected failure with correlation identifier |

Sensitive errors do not disclose whether unrelated users, orders, or CMS accounts exist. Checkout, cancellation, delivery proof, and stock adjustment endpoints are idempotent where retries could otherwise duplicate effects.

## 15. Security and Privacy

- Secure, HttpOnly, SameSite cookies in production
- Better Auth CSRF and origin checks remain enabled
- Email/password rate limiting and secure password-reset flow
- No public CMS registration
- Server-side authorization on every CMS mutation and read
- Exact-email lookup is never exposed publicly
- Guest-order access is scoped to an opaque signed browser session
- QR/PIN proof is hashed, expiring, and one-time
- R2 uploads validate MIME type, file size, ownership, and generated object keys
- Personally identifiable information is excluded from logs and QR payloads
- Audit records cover store settings, roles, catalog, inventory, orders, and delivery completion

## 16. High-Value MVP Additions

The design includes these operational features because they provide high value at low product complexity:

- Postal-code serviceability checks before checkout
- Store hours, closures, and order cut-off configuration
- Low-stock thresholds and dashboard indicators
- Immutable inventory adjustment ledger
- Registered-customer reorder
- Complete operational audit trail

## 17. Testing Strategy

### 17.1 Unit tests

- Shared Zod schemas
- Money and discount calculations
- Store-hours and cut-off evaluation
- Postal-code serviceability
- CMS permissions
- Order transition policy
- QR/PIN expiry and hashing

### 17.2 D1 integration tests

- Migrations and constraints
- Checkout rollback when any offering lacks stock
- Concurrent attempts to buy the final stock unit
- Idempotent checkout retry
- Cancellation/restoration exactly once
- Immutable inventory movement history
- Optimistic concurrency on offering edits

### 17.3 API tests

- Registered and guest cart flows
- Guest-order isolation
- Customer versus CMS authorization
- Structured validation and conflict errors
- R2 upload validation
- Order acknowledgement and status transitions
- QR scan and PIN fallback

### 17.4 Frontend and end-to-end tests

- Login, registration, and guest continuation
- Browse, search, offering selection, cart, and checkout
- Repricing and out-of-stock recovery
- Customer cancellation and reorder
- CMS catalog and offering management
- Order fulfilment and delivery completion
- Responsive customer and delivery-role layouts
- Keyboard navigation, focus states, labels, contrast, and reduced motion

## 18. Deployment and Operations

- One Cloudflare Worker deployment per store instance
- One D1 database and one R2 bucket binding per instance/environment
- Separate local, preview, and production configuration
- Secrets stored as Worker secrets, not committed variables
- Drizzle and Better Auth schema changes are migration-controlled
- `wrangler types` runs after binding changes
- Worker observability and correlation IDs support production diagnosis
- Database indexes cover product code/slug, offering product/activity, order number/status/time, customer history, inventory movement, and audit queries

## 19. Success Criteria

The MVP is successful when:

- A guest or registered customer can place a valid COD order without overselling stock.
- A registered customer can view history and reorder available offerings.
- CMS staff can manage catalog and offering-level inventory.
- Operations can acknowledge and fulfil an order through the approved state machine.
- Delivery staff can complete an out-for-delivery order using QR or PIN.
- Cancellation restores stock exactly once.
- Store details, hours, serviceability, and media are editable from CMS settings.
- Dashboard metrics match delivered order data for the configured store timezone.
- Permission, concurrency, failure, and responsive-accessibility tests pass.
