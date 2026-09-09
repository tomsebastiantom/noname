# XState Workflow Proof — Payment with Stock Reservation

This example shows what XState can model and what requires a durable runtime.

## JSON machine

```json
{
  "id": "payment-order",
  "initial": "reserving_stock",
  "context": {
    "orderRef": null,
    "paymentRef": null,
    "attempt": 0,
    "reservedUntil": null,
    "failureReason": null
  },
  "states": {
    "reserving_stock": {
      "invoke": {
        "id": "reserve-stock",
        "src": "reserveStock",
        "onDone": {
          "target": "awaiting_payment",
          "actions": "storeReservation"
        },
        "onError": {
          "target": "stock_failed",
          "actions": "storeFailure"
        }
      }
    },
    "awaiting_payment": {
      "entry": "setPaymentDeadline",
      "after": {
        "24_HOURS": "payment_expired"
      },
      "on": {
        "PAYMENT_SUCCEEDED": {
          "target": "paid",
          "actions": "storePayment"
        },
        "PAYMENT_FAILED": {
          "target": "retrying_payment",
          "actions": "storeFailure"
        }
      }
    },
    "retrying_payment": {
      "entry": "incrementAttempt",
      "always": [
        {
          "guard": "attemptsRemain",
          "target": "awaiting_payment"
        },
        {
          "target": "payment_failed"
        }
      ]
    },
    "payment_expired": {
      "invoke": {
        "id": "request-payment-approval",
        "src": "requestPaymentApproval",
        "onDone": "compensating_stock",
        "onError": "compensating_stock"
      }
    },
    "compensating_stock": {
      "invoke": {
        "id": "release-stock",
        "src": "releaseStock",
        "onDone": "payment_failed",
        "onError": "compensation_failed"
      }
    },
    "paid": {
      "type": "final"
    },
    "stock_failed": {
      "type": "final"
    },
    "payment_failed": {
      "type": "final"
    },
    "compensation_failed": {
      "type": "final"
    }
  }
}
```

## What XState handles

- State graph and legal transitions.
- Guards such as `attemptsRemain`.
- Context updates through actions.
- Delayed transitions using `after`.
- Invoked actors using `invoke`, with success and failure events.
- Compensation as an explicit state and transition.
- Child actors and parallel/compound state structure.

## What an XState actor alone does not guarantee

An actor running in a server process loses its timer, invoked work, and in-memory child actors if that process crashes. A persisted snapshot can restore the machine structure, but the application still needs durable scheduling, retry ownership, idempotency, and external-effect tracking.

## Runtime choices

| Requirement | XState actor only | XState + BullMQ | XState + durable workflow runtime |
|---|---:|---:|---:|
| Immediate state transitions | Yes | Yes | Yes |
| Guards and context | Yes | Yes | Yes |
| 24-hour wait surviving crashes | No | Yes, with explicit delayed jobs | Yes |
| Retry provider call | Manual | Yes | Yes |
| Human approval signal | Manual event route | Queue/event integration | Native workflow signal pattern |
| Compensation | Modeled, execution is manual | Job-driven | Durable step/workflow-driven |
| Full execution history/replay | No | Partial job/audit history | Yes, depending on runtime |

## Recommended interpretation

Keep this JSON as the workflow definition and XState as the transition authority. For the current cart/payment flow, use XState plus Postgres and the provider-event BullMQ queue. If the product requires the full 24-hour reservation, durable timer, approval, retry, and compensation workflow, execute the declared effects through a durable runtime such as Restate, DBOS, Temporal, or Cloudflare Workflows. Do not let that runtime independently choose machine states.

The runtime adapter should:

1. Load and validate the JSON definition.
2. Create or restore the XState actor.
3. Execute declared effects durably and idempotently.
4. Feed effect results back as XState events.
5. Persist the resulting state/context or versioned snapshot.
6. Resume from the persisted workflow instance after failure.
