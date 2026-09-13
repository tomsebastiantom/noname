# Second Provider Mapping Fixture

## Scope

Implemented the next available checkout roadmap item without depending on Cloudflare deployment or another external provider account: prove the commerce callback mapping contract is provider-neutral.

## Implementation

`createCommerceProviderEventMappings()` now accepts provider mapping options:

- Integration ID
- Success event type
- Failure event type
- Optional expiry event type

The normal Stripe mapping remains the default. A second-provider fixture can use its own event names and payload aliases while producing the same provider-neutral machine events.

Supported correlation/payment aliases include:

- `metadata.machineInstanceId` and `metadata.machine_instance_id`
- `client_reference_id`
- `payment_intent` and `payment_reference`
- `amount_total` and `amount`
- `payment_status` and `status`

The normalized outputs remain:

```text
PAYMENT_SUCCEEDED
PAYMENT_FAILED
```

No provider-specific code was added to the generic integrations transport or machine domain.

## Verification

- Stripe mappings remain covered by the existing tests.
- Adyen-style fixture mapping with `payment.completed` and `payment.failed` passes.
- Second-provider fixture verifies correlation, payment reference, amount, currency, and failure reason.
- Worker/browser runtime remains unchanged.
- Live Browser MCP smoke still passes for desktop, mobile, and tablet storefront scenarios with zero console errors.
- Focused vertical tests — PASS, 4 tests.
- Vertical typecheck — PASS.
- Full typecheck — PASS.
- Full test suite — PASS, 147 files / 521 tests.
- Full build — PASS.

This fixture proves the mapping seam without claiming a real Adyen delivery.
