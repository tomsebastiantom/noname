---
title: Build your first Noname store
sidebar_position: 1
status: current
owner: platform
last_verified: 2026-09-14
audience: [new-developer]
---

# Build your first Noname store

> **Tutorial** · 10 minutes

You will start Noname, seed a demo tenant, and open a storefront with Commerce enabled.

## 1. Start the local stack

From the repository root:

```bash
pnpm dev
```

## 2. Seed the demo environment

In another terminal:

```bash
pnpm seed:demo:full
```

The full profile runs platform and Commerce seed steps in dependency order.

## 3. Open the storefront

Open:

```text
http://yogastore.localhost:5173/
```

You should see the seeded storefront and Commerce product content.

## 4. Open the admin

Open:

```text
http://yogastore.localhost:5173/admin
```

Use the local seeded admin credentials.

## What happened

The platform profile created the tenant, layouts, pages, users, and authorization. The Commerce profile added product and checkout demonstration data.

## Next steps

- [Seed a Commerce environment](../operations/seed-a-commerce-demo)
- [Understand the system](../concepts/system-overview)
- [Verify checkout](../operations/verify-a-checkout)
