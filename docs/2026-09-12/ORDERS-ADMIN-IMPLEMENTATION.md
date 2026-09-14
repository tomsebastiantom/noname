# Commerce Orders Admin Read View

> **Date:** 2026-09-12  
> **Status:** Initial read-only admin implementation

## Scope

The Orders admin view is a commerce-owned read surface over immutable evidence records. It does not create, edit, refund, cancel, or otherwise mutate orders.

The first slice supports:

- Authenticated Orders navigation at `/admin/orders`
- Paid commerce order listing
- Order/payment amount and currency display
- Payment reference display
- Paid timestamp display
- Selecting an order for immutable evidence details
- Inspecting typed evidence links
- Refresh and loading/error states
- Dedicated `commerce:orders_view` permission

## API boundary

The generic evidence API remains available at `/api/evidence`.

Commerce receives a protected route adapter:

```text
GET /api/commerce/orders/records
GET /api/commerce/orders/links/:recordId
GET /api/commerce/orders/audit
```

The adapter forces:

```text
permission = commerce:orders_view
type = commerce.order.created
subjectType = commerce.order
```

This prevents the client from using a generic evidence read route to bypass the commerce permission or query unrelated evidence types.

The browser only reads. Evidence writes remain server-side through `EvidenceService` and the commerce projection port.

## UI ownership

The client contributes:

```text
OrdersAdmin component
orders client API helper
orders admin state
loadOrdersAdmin action
selectOrderAdmin action
loadOrderLinks action
```

The client does not define order lifecycle behavior. It renders the commerce evidence projection and related records.

## Permission

Added:

```text
PERMISSIONS.COMMERCE_ORDERS_VIEW = "commerce:orders_view"
```

The permission is included in the admin permission bundle. The admin route mirrors the server permission and remains hidden for unauthorized users.

## Seeded admin layout

The demo seed now creates:

```text
admin_orders
```

The route table and admin navigation include:

```text
/admin/orders
```

## Verification

Expected verification commands:

```text
pnpm --filter @noname/client typecheck
pnpm --filter @noname/auth typecheck
pnpm --filter @noname/server typecheck
pnpm exec biome check .
pnpm test
pnpm build
```

## Deferred roadmap slices

Not included yet:

- Order cancellation
- Refund actions
- Fulfillment operations
- Inventory reservation
- Customer-facing order history
- Search by customer/email
- Cursor pagination beyond the evidence limit
- Order detail domain aggregate
- Refund/payment reconciliation
- Browser MCP live checkout-to-Orders verification

Those should be implemented only after the read projection has been verified against a live paid checkout and the permission boundary has been checked in the running admin.
