# Delivery Application Implementation Roadmap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved single-store commerce application as six independently testable vertical phases.

**Architecture:** One React/Vite application serves a customer storefront and responsive CMS. A Hono Worker exposes typed domain APIs, Better Auth owns email/password identity, Drizzle accesses D1, and R2 stores images. Each phase ends with a runnable product slice and a clean verification checkpoint.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, React Router, TanStack Query, TanStack Table, Zod, Hono, Better Auth, Drizzle ORM, Cloudflare Workers, D1, R2, Vitest, Cloudflare Vitest pool, Testing Library, Playwright

---

## Shared File Boundaries

```text
src/
├── shared/
│   ├── contracts/         # Zod request/response contracts and inferred types
│   ├── domain/            # Pure money, status, permissions, and time rules
│   └── test/              # Shared factories used by browser and Worker tests
├── worker/
│   ├── app.ts             # Hono composition only
│   ├── index.ts           # Worker entrypoint only
│   ├── auth/              # Better Auth factory and session middleware
│   ├── db/                # Drizzle client, schema exports, migrations
│   ├── http/              # Error envelope and request middleware
│   └── modules/           # Feature-local routes, services, repositories
└── react-app/
    ├── app/               # Router, providers, route guards, shells
    ├── components/        # Shared visual primitives
    ├── lib/               # API client, auth client, formatting
    └── features/          # Feature-local screens, queries, and forms
```

Routes validate and translate HTTP. Services own business rules. Repositories own D1/R2 access. React features consume stable contracts and never import Worker modules.

## Phase Sequence

| Phase | Plan timing | Runnable outcome |
|---|---|---|
| 1 | Detailed now in `2026-08-09-foundation-auth-store-settings.md` | Login/registration/guest entry, CMS role guard, Soft Logistics shells, editable singleton store profile |
| 2 | Written after Phase 1 interfaces pass verification | CMS categories, tags, products, R2 images, offerings, stock ledger, public catalog APIs |
| 3 | Written after Phase 2 catalog contracts stabilize | Customer home, search, product/offering selection, registered and guest carts, cart merge |
| 4 | Written after Phase 3 cart behavior stabilizes | Address/serviceability validation, atomic COD checkout, customer history, cancellation, reorder |
| 5 | Written after Phase 4 order invariants pass concurrency tests | CMS order queue, state transitions, ETA, delivery QR/PIN, mobile delivery workflow, audit trail |
| 6 | Written after the complete operational flow exists | Dashboard analytics, low-stock reporting, accessibility, security, E2E coverage, deploy runbook |

Only the active phase receives implementation edits. At the end of each phase, run the complete repository verification and review the next phase plan against the code that now exists.

## Cross-Phase Invariants

- One store profile per deployment; no organization or tenant identifiers.
- All money uses integer minor units.
- All timestamps persist in UTC and render in the configured store timezone.
- All privileged Worker routes perform server-side role checks.
- Cart changes never change stock.
- Checkout and stock restoration are atomic and idempotent.
- Historical orders use snapshots and never depend on mutable catalog text or prices.
- Every stock mutation has an immutable inventory movement.
- Every operational order transition has an immutable history record.
- R2 object keys are generated server-side and never trust a client filename.

## Repository-Wide Verification

Run after every phase:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:worker
pnpm build
pnpm exec wrangler deploy --dry-run
```

Expected: every command exits `0`; test commands report no failures; the dry run reports valid `DB` and `MEDIA` bindings.
