# Phase 5: Order Operations and Delivery Proof — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give CMS staff a complete order-operations workflow — acknowledgement, ETA, valid status transitions, cancellation/rejection with reasons, COD state, and status history — and give delivery staff one-time QR/PIN proof verification, plus an immutable audit trail.

**Architecture:** Extend the existing `shared/domain/order.ts` with a pure transition policy. Add `delivery_proof` and `audit_log` D1 tables. Add CMS order routes guarded by `order:manage`, delivery routes guarded by a new `order:deliver` + existing `delivery:complete`, reusing the Phase 4 guarded-batch pattern for atomic transitions and exactly-once stock restoration. React consumes stable contracts through TanStack Query and TanStack Table.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, React Router, TanStack Query, TanStack Table, Zod, Hono, Drizzle ORM, Cloudflare Workers, D1, Vitest, Cloudflare Vitest pool, Testing Library.

---

## Scope (from approved design)

Phase 5 covers design sections §8.4, §9, §9.1, §11, §4.2 (delivery role), §5.2 (`/cms/orders`, `/cms/orders/:orderNumber`, `/cms/audit`), §7.5 (customer QR/PIN display), §12.4 (`delivery_proof`, `audit_log`), and §15 (hashed/expiring/one-time proof, audit records).

Phase 5 does **not** include: dashboard analytics, low-stock reporting, `/cms/customers`, accessibility/security hardening, or E2E coverage (those are Phase 6).

## Open design decisions (confirm before execution)

1. **Raw proof display vs "only hashes stored".** §11 says only token and PIN *hashes* are stored, but §7.5 requires the customer order-detail screen to display the raw QR token and PIN while `out_for_delivery`. Recommended resolution: `delivery_proof` stores `token_hash` and `pin_hash` (the verification values) **and** AES-256-GCM-encrypted `token`/`pin` blobs keyed by a Worker secret, so the plaintext never sits in D1. Verification compares hashes; customer display decrypts. (Simpler alternative if the user prefers: store raw `token`/`pin` alongside hashes and drop the "hashes only" constraint.)
2. **"Assigned" delivery orders.** The approved data model has no driver-assignment table, so "assigned" is interpreted as **all `out_for_delivery` orders** (the delivery queue). If per-driver assignment is wanted, it needs a new table and a separate plan.
3. **Delivery window expiry.** Reuse the store `order_cutoff_minutes` concept is wrong; add a configurable `deliveryProofTtlMinutes` (default e.g. 720) to the singleton `store_profile`, or hard-code a constant. Recommended: a named constant `DELIVERY_PROOF_TTL_MS` for now, promoted to store settings in Phase 6.

---

## File Structure

```text
src/
├── shared/
│   ├── contracts/order.ts            # extend: transition/proof/audit contracts
│   └── domain/order.ts               # extend: transition map, proof helpers
├── worker/
│   ├── auth/permissions.ts           # add order:deliver permission
│   ├── db/schema/
│   │   ├── orders.ts                 # add delivery_proof table
│   │   └── audit.ts                  # new: audit_log table
│   └── modules/
│       ├── orders/
│       │   ├── order-transitions.ts  # new: pure transition service
│       │   ├── delivery-proof.ts     # new: generate/hash/verify/regenerate
│       │   ├── order-repository.ts   # extend: list/detail/transition/proof/audit
│       │   ├── order-service.ts      # extend: CMS + delivery operations
│       │   └── order-routes.ts       # extend: /api/cms/orders*, /api/cms/delivery/*
│       └── audit/
│           └── audit-routes.ts       # new: GET /api/cms/audit
└── react-app/
    ├── features/
    │   ├── orders/
    │   │   ├── cms-orders-api.ts     # new: CMS order + audit query/mutations
    │   │   ├── cms-orders-page.tsx   # new: order queue (TanStack Table)
    │   │   ├── cms-order-detail.tsx  # new: actions, history, COD, ETA
    │   │   ├── delivery-orders.tsx   # new: delivery mobile queue + verify
    │   │   └── order-detail-page.tsx # extend: render QR/PIN while out_for_delivery
    │   └── audit/audit-page.tsx      # new: /cms/audit
    └── app/router.tsx                # extend: /cms/orders, /cms/orders/:n, /cms/audit, /cms/deliver
```

---

## Task 1: Order transition policy (pure domain)

**Files:**
- Modify: `src/shared/domain/order.ts`
- Test: `src/shared/domain/order.test.ts`

Add a pure transition map and actor-aware predicate. Reuse the existing `orderStatusValues` / `paymentStatusValues`.

- [ ] **Step 1: Write the failing test**

```ts
// src/shared/domain/order.test.ts (append)
describe("order transitions", () => {
  it("walks the fulfilment path in order", () => {
    expect(canTransitionOrder("placed", "confirmed", "cms")).toBe(true);
    expect(canTransitionOrder("confirmed", "preparing", "cms")).toBe(true);
    expect(canTransitionOrder("preparing", "ready", "cms")).toBe(true);
    expect(canTransitionOrder("ready", "out_for_delivery", "cms")).toBe(true);
    expect(canTransitionOrder("out_for_delivery", "delivered", "cms")).toBe(true);
  });

  it("allows customer cancel only while placed or confirmed", () => {
    expect(canTransitionOrder("placed", "cancelled", "customer")).toBe(true);
    expect(canTransitionOrder("confirmed", "cancelled", "customer")).toBe(true);
    expect(canTransitionOrder("preparing", "cancelled", "customer")).toBe(false);
  });

  it("allows CMS cancel or reject of any undelivered order", () => {
    for (const from of ["placed", "confirmed", "preparing", "ready", "out_for_delivery"]) {
      expect(canTransitionOrder(from, "cancelled", "cms")).toBe(true);
      expect(canTransitionOrder(from, "rejected", "cms")).toBe(true);
    }
  });

  it("never leaves a terminal status", () => {
    for (const from of ["delivered", "cancelled", "rejected"]) {
      for (const to of orderStatusValues) expect(canTransitionOrder(from, to, "cms")).toBe(false);
    }
  });

  it("rejects same-status and unknown transitions", () => {
    expect(canTransitionOrder("placed", "placed", "cms")).toBe(false);
    expect(canTransitionOrder("confirmed", "out_for_delivery", "cms")).toBe(false); // skips a step
  });
});
```

- [ ] **Step 2: Run it to confirm it fails** — `pnpm test -- src/shared/domain/order.test.ts`

- [ ] **Step 3: Implement the transition map**

```ts
// src/shared/domain/order.ts (append)
export type TransitionActor = "customer" | "cms";

const cmsForward: Record<OrderStatus, OrderStatus[]> = {
  placed: ["confirmed", "cancelled", "rejected"],
  confirmed: ["preparing", "cancelled", "rejected"],
  preparing: ["ready", "cancelled", "rejected"],
  ready: ["out_for_delivery", "cancelled", "rejected"],
  out_for_delivery: ["delivered", "cancelled", "rejected"],
  delivered: [],
  cancelled: [],
  rejected: [],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus, actor: TransitionActor): boolean {
  if (from === to) return false;
  if (actor === "customer") return canCustomerCancelOrder(from) && to === "cancelled";
  return (cmsForward[from] ?? []).includes(to);
}

export function requireReason(to: OrderStatus): boolean {
  return to === "cancelled" || to === "rejected" || to === "delivered";
}
```

- [ ] **Step 4: Run the test** — `pnpm test -- src/shared/domain/order.test.ts` → PASS
- [ ] **Step 5: Commit** — `git commit -m "feat: add order transition policy"`

---

## Task 2: `delivery_proof` and `audit_log` schema

**Files:**
- Modify: `src/worker/db/schema/orders.ts`
- Create: `src/worker/db/schema/audit.ts`
- Modify: `src/worker/db/schema/index.ts`
- Test: `src/worker/db/schema/orders.test.ts`

- [ ] **Step 1: Add `deliveryProof` to `orders.ts`**

```ts
export const deliveryProof = sqliteTable(
  "delivery_proof",
  {
    orderId: text("order_id").primaryKey().references(() => commerceOrder.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    pinHash: text("pin_hash").notNull(),
    tokenEnc: text("token_enc").notNull(), // AES-GCM, base64 (see Task 6)
    pinEnc: text("pin_enc").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    consumedAt: integer("consumed_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    check("delivery_proof_token_hash_check", sql`length(${table.tokenHash}) = 64 and ${table.tokenHash} not glob '*[^0-9a-f]*'`),
    check("delivery_proof_pin_hash_check", sql`length(${table.pinHash}) = 64 and ${table.pinHash} not glob '*[^0-9a-f]*'`),
    check("delivery_proof_expiry_check", sql`${table.expiresAt} > ${table.createdAt}`),
  ],
);
```

- [ ] **Step 2: Create `audit.ts`**

```ts
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./auth";

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "restrict" }),
    action: text("action").notNull(), // e.g. "order.transition", "delivery.proof_verified"
    entityType: text("entity_type").notNull(), // e.g. "order"
    entityId: text("entity_id").notNull(),
    metadata: text("metadata"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("auditLogActorCreatedIdx").on(table.actorUserId, table.createdAt),
    index("auditLogEntityCreatedIdx").on(table.entityType, table.entityId, table.createdAt),
  ],
);
```

Export both from `src/worker/db/schema/index.ts`.

- [ ] **Step 3: Add schema tests** (reject short/hex-invalid hashes, reject expired `expiresAt <= createdAt`, FK cascade on order delete).
- [ ] **Step 4: Generate + apply the migration** — `pnpm db:generate && pnpm db:migrate:local` then `pnpm test:worker -- src/worker/db/schema/orders.test.ts`
- [ ] **Step 5: Commit** — `git commit -m "feat: add delivery proof and audit schema"`

---

## Task 3: Transition and proof contracts

**Files:**
- Modify: `src/shared/contracts/order.ts`
- Test: `src/shared/contracts/order.test.ts`

- [ ] **Step 1: Add schemas**

```ts
export const orderTransitionInputSchema = z
  .object({
    toStatus: z.enum(orderStatusValues),
    reason: z.string().trim().min(1).max(500).optional(),
    expectedDeliveryAt: timestampSchema.nullable().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (requireReason(value.toStatus) && !value.reason) {
      ctx.addIssue({ code: "custom", path: ["reason"], message: "A reason is required for this transition" });
    }
    if (value.toStatus === "confirmed" && !value.expectedDeliveryAt) {
      ctx.addIssue({ code: "custom", path: ["expectedDeliveryAt"], message: "An expected delivery time is required to acknowledge" });
    }
  });

export const verifyDeliveryInputSchema = z
  .object({
    token: z.string().trim().min(16).max(256).optional(),
    pin: z.string().regex(/^\d{6}$/).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (Boolean(value.token) === Boolean(value.pin)) {
      ctx.addIssue({ code: "custom", path: ["token"], message: "Provide exactly one of token or pin" });
    }
  });

export const deliveryProofResponseSchema = z.object({
  orderId: idSchema,
  qrToken: z.string().min(16).max(256), // raw token to render as QR (customer view)
  pin: z.string().regex(/^\d{6}$/),
  expiresAt: timestampSchema,
});

export const orderDetailSchema /* extend */ = orderDetailSchema.extend({
  deliveryProof: deliveryProofResponseSchema.nullable(),
});
```

Note: `orderDetailSchema` is currently declared once and used by both customer and CMS views. Extending it adds `deliveryProof: null` to every detail; the customer mapping must decrypt only when the order is `out_for_delivery` (see Task 10).

- [ ] **Step 2: Add contract tests** (reason required for cancel/reject, ETA required for acknowledge, token XOR pin, valid/invalid pin format).
- [ ] **Step 3: Commit** — `git commit -m "feat: add order transition and proof contracts"`

---

## Task 4: Order repository extensions

**Files:**
- Modify: `src/worker/modules/orders/order-repository.ts`

Add `listCmsOrders`, `getCmsOrder`, `transitionOrder`, and proof/audit helpers. `listCmsOrders` mirrors `listOrders` but filters by status/search and is **not** owner-scoped:

```ts
async listCmsOrders(query: { page: number; pageSize: number; status?: string; search?: string }): Promise<{ items: StoredOrder[]; totalItems: number }> {
  const where: string[] = [];
  const binds: unknown[] = [];
  if (query.status) { where.push("o.status = ?"); binds.push(query.status); }
  if (query.search) {
    where.push("(o.order_number LIKE ? OR EXISTS (SELECT 1 FROM order_address a WHERE a.order_id = o.id AND (a.recipient_name LIKE ? OR a.mobile LIKE ?)))");
    const term = `%${query.search}%`;
    binds.push(term, term, term);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  // ... SELECT with clause, ORDER BY o.placed_at DESC, o.id DESC LIMIT ? OFFSET ?
  // ... SELECT count(*) with clause
}
```

`transitionOrder` reuses the Phase 4 guarded-batch pattern: a guarded `UPDATE commerce_order` (status + version CAS) followed by a `INSERT INTO order_status_history ... WHERE EXISTS(order at expectedVersion+1)`, and — for cancel/reject — the same `UPDATE offering ... stock_quantity + ? WHERE version = ? AND stock_quantity = ? AND EXISTS(order cancelled/rejected AND version = ?)` + `INSERT INTO inventory_movement` restoration block already proven in `cancel()`. Extract that restoration block into a shared private helper so customer cancel, CMS cancel, and CMS reject all call it.

- [ ] Write `listCmsOrders`/`getCmsOrder`/`transitionOrder` tests against the local D1 (acknowledge sets `expected_delivery_at`; reject restores stock exactly once under a double-submit).
- [ ] Commit — `git commit -m "feat: extend order repository for CMS operations"`

---

## Task 5: CMS order + delivery routes

**Files:**
- Modify: `src/worker/auth/permissions.ts`
- Modify: `src/worker/modules/orders/order-service.ts`
- Modify: `src/worker/modules/orders/order-routes.ts`

Add the permission and wire routes:

```ts
// permissions.ts
export type Permission = /* existing */ | "order:deliver";
// permissionsByRole.delivery = ["delivery:complete", "order:deliver"];
```

Routes (all server-side role checks):

```ts
routes.get("/cms/orders", requirePermission("order:manage"), list);
routes.get("/cms/orders/:orderNumber", requirePermission("order:manage"), detail);
routes.post("/cms/orders/:orderNumber/transition", requirePermission("order:manage"), transition); // acknowledge/progress/cancel/reject
routes.get("/cms/delivery/orders", requirePermission("order:deliver"), activeDeliveries); // status = out_for_delivery
routes.post("/cms/delivery/orders/:orderNumber/verify", requirePermission("delivery:complete"), verifyProof);
```

Service `transition()` validates `orderTransitionInputSchema`, re-reads the order, asserts `canTransitionOrder(current, toStatus, "cms")`, and for `out_for_delivery` generates + stores the proof (Task 6) inside the same transaction; for `delivered` the transition is only reachable via `verifyProof`. `verifyProof()` hashes the supplied token/pin, loads the proof, checks expiry/consumption, and atomically sets `delivered` + `payment_status = 'collected'` + `consumed_at`, returning the already-delivered detail on repeat.

- [ ] Add route tests: `401/403` for each route, acknowledge sets ETA + history, illegal transition returns `409`, cancel/reject restores stock, verify by token and by pin, expired proof returns `409`, repeat verify returns delivered without a second transition.
- [ ] Commit — `git commit -m "feat: add CMS order and delivery verification routes"`

---

## Task 6: Delivery proof generation and hashing

**Files:**
- Create: `src/worker/modules/orders/delivery-proof.ts`
- Test: `src/worker/modules/orders/delivery-proof.test.ts`

```ts
export type GeneratedProof = { token: string; pin: string; tokenHash: string; pinHash: string; tokenEnc: string; pinEnc: string };

export async function generateDeliveryProof(secretKey: CryptoKey, now = Date.now(), ttlMs = DELIVERY_PROOF_TTL_MS): Promise<GeneratedProof> {
  const token = encodeToken(crypto.getRandomValues(new Uint8Array(32))); // base64url, 43 chars
  const pin = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
  const [tokenHash, pinHash] = await Promise.all([sha256Hex(token), sha256Hex(pin)]);
  return {
    token, pin, tokenHash, pinHash,
    tokenEnc: await encryptSecret(secretKey, token),
    pinEnc: await encryptSecret(secretKey, pin),
  };
}

export async function verifyProofValue(proof: { tokenHash: string; pinHash: string }, value: { token?: string; pin?: string }): Promise<boolean> {
  if (value.token) return sha256Hex(value.token) === proof.tokenHash;
  if (value.pin) return sha256Hex(value.pin) === proof.pinHash;
  return false;
}
```

The AES-GCM secret key is derived from `env.BETTER_AUTH_SECRET` (or a dedicated `DELIVERY_PROOF_SECRET`) at request time. Unit-test `generateDeliveryProof` and `verifyProofValue` (round-trip, wrong pin, hash length 64 hex).

- [ ] Commit — `git commit -m "feat: add delivery proof generation and verification"`

---

## Task 7: Audit trail

**Files:**
- Create: `src/worker/modules/audit/audit-routes.ts`
- Modify: `src/worker/app.ts`

Write an `audit()` helper that appends an `INSERT INTO audit_log` statement to the existing D1 batch for every privileged transition (acknowledge, progress, cancel, reject, proof verify). Expose `GET /api/cms/audit` (guard `analytics:read`, or a dedicated `audit:read`) returning a paginated list. Never log proof tokens or PII — only action, entity id, actor id, and a safe metadata summary.

- [ ] Test that a transition writes an audit row and `/cms/audit` returns it; `403` for delivery role.
- [ ] Commit — `git commit -m "feat: add operational audit trail"`

---

## Task 8: CMS order queue UI

**Files:**
- Create: `src/react-app/features/orders/cms-orders-api.ts`
- Create: `src/react-app/features/orders/cms-orders-page.tsx`
- Test: `src/react-app/features/orders/cms-orders-page.test.tsx`

TanStack Table queue with columns: order number, placed time, customer, item count, total, status, payment status. Server-driven pagination + status filter + search, mirroring the existing catalog table pattern (`data-table.tsx`). Wire routes `/cms/orders` and `/cms/orders/:orderNumber` under the existing `CmsArea`/`CmsShell`.

- [ ] Test: renders rows, filters by status, navigates to detail.
- [ ] Commit — `git commit -m "feat: add CMS order queue"`

---

## Task 9: CMS order detail UI

**Files:**
- Create: `src/react-app/features/orders/cms-order-detail.tsx`
- Test: `src/react-app/features/orders/cms-order-detail.test.tsx`

Detail page shows snapshots, address, status history timeline, COD state, and ETA. Action controls derive from the transition map: Acknowledge (with ETA input), Advance (preparing/ready/out_for_delivery), Cancel and Reject (reason dialog). Disable actions while a mutation is pending; surface `409` as "reload and retry".

- [ ] Test: acknowledge prompts ETA, cancel requires reason, illegal next status is hidden.
- [ ] Commit — `git commit -m "feat: add CMS order detail actions"`

---

## Task 10: Customer QR/PIN display

**Files:**
- Modify: `src/react-app/features/orders/order-detail-page.tsx`
- Modify: `src/worker/modules/orders/order-service.ts` (map `deliveryProof`)

When the order is `out_for_delivery`, the customer detail maps the stored proof to `deliveryProof` by decrypting `tokenEnc`/`pinEnc`. The React page renders the token as a QR code (a dependency-free `<svg>` QR encoder helper, or a tiny local renderer) and shows the six-digit PIN, both labelled for screen readers.

- [ ] Test: proof rendered while out_for_delivery, absent otherwise.
- [ ] Commit — `git commit -m "feat: show delivery QR and PIN to customers"`

---

## Task 11: Delivery mobile workflow

**Files:**
- Create: `src/react-app/features/orders/delivery-orders.tsx`
- Modify: `src/react-app/app/router.tsx` (add `/cms/deliver`)

A simplified, thumb-friendly queue for the `delivery` role listing `out_for_delivery` orders, each opening a completion flow: scan the customer's QR (camera capture of the token via a text input paste or a lightweight QR scan lib) or type the six-digit PIN, then confirm `delivered`. On narrow screens this is the delivery role's primary surface.

- [ ] Test: active-only list, verify form requires exactly one of token/pin, success clears the order from the queue.
- [ ] Commit — `git commit -m "feat: add delivery mobile workflow"`

---

## Task 12: README + full verification

**Files:**
- Modify: `README.md`

Update the status heading to Phase 1–5 and document the CMS order queue, transition rules, delivery proof, and audit trail. Then run:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:worker && pnpm build && pnpm exec wrangler deploy --dry-run
```

- [ ] Commit — `git commit -m "docs: update Phase 1-5 status"`

---

## Verification

Expected at the end of Phase 5: every command exits `0`; worker tests cover the transition policy, proof hashing/expiry/one-time verification, exactly-once restoration on cancel/reject, and role guards; the dry run reports valid `DB` and `MEDIA` bindings.

## What can be done next (Phase 6 preview)

Dashboard analytics, low-stock reporting, `/cms/customers`, accessibility and security hardening, rate limiting on sensitive actions, full E2E coverage, and the deploy runbook.
