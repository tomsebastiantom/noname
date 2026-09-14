# Generic Checkout Provider Adapters

> **Documentation status (2026-09-14):** Design/reference material, not implementation proof. See [`../2026-09-14/AUTHORITATIVE-ROADMAP-CURRENT.md`](../2026-09-14/AUTHORITATIVE-ROADMAP-CURRENT.md).

The commerce capability does not know Stripe, Shopify, PayPal, or any provider endpoint. It resolves a provider adapter by configured integration ID and gives that adapter the generic Nango `proxyProvider` port.

```ts
const stripeLikeAdapter = {
  async createSession(request, proxy) {
    const result = await proxy({
      orgId: request.orgId,
      integrationId: request.integrationId,
      method: "POST",
      endpoint: "/provider-specific-session-endpoint",
      data: {
        amount: request.amount,
        currency: request.currency,
        metadata: request.metadata,
        idempotencyKey: request.idempotencyKey,
      },
    });

    return {
      externalCheckoutId: providerResponseId(result),
      redirectUrl: providerResponseUrl(result),
    };
  },
};
```

The provider-specific endpoint and response parsing belong only in the adapter. The commerce capability consumes the stable contract:

```ts
{ externalCheckoutId: string; redirectUrl: string }
```

The first registered adapter is Stripe through Nango. Adding a provider means registering another adapter; the generic capability route, machine engine, Nango transport, and browser contract do not change. Provider credentials remain in Nango.
