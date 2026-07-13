# Distributed Tracing — Planning & Analysis — 2026-07-11

## Problem

No observability into request flow across the stack. When a user action hits the frontend, triggers an agent task via Hono, enqueues to BullMQ, calls the AI Pipeline, and returns — there is no way to trace that full journey end-to-end. Debugging is blind: you correlate manual IDs across log lines.

## Recommendation: OpenTelemetry (OTel)

OTel is the CNCF standard for distributed tracing. It is vendor-neutral, has mature Node.js auto-instrumentation, and fits our stack without architectural changes.

### Why OTel over alternatives

| Option | Verdict |
|--------|---------|
| **OpenTelemetry** | ✅ Standard, auto-instruments our entire stack, vendor-neutral, zero-code for HTTP/DB/Redis |
| Custom trace IDs | ❌ Rebuilding what OTel does. Manual propagation through BullMQ headers, fetch, etc. |
| Sentry Performance | ❌ Focused on error/performance, not full distributed traces; less flexible |
| Datadog APM | ❌ Vendor lock-in, requires agent, paid |

---

## Stack Fit Analysis

### Server (`packages/server`)

| Component | OTel Coverage | Notes |
|-----------|---------------|-------|
| **Hono routes** | ✅ `@opentelemetry/instrumentation-http` | Auto-creates spans per HTTP request. No code changes. |
| **Drizzle + Postgres** | ✅ `@opentelemetry/instrumentation-pg` | Auto-creates spans per query. Captures SQL, latency, errors. |
| **BullMQ + ioredis** | ✅ `@opentelemetry/instrumentation-ioredis` | Auto-creates spans for Redis commands (enqueue, dequeue, status). |
| **AI Pipeline (callLLM)** | 🟡 Manual `startActiveSpan` needed | Core LLM call path is custom — add explicit spans for `generateLayout`, `generateContent`, `generateMachine` with `tenantId` and `model` attributes. |
| **Event Bus** | 🟡 Manual span for publish/handle | Cross-domain events are in-memory today — add a span per event publish + handler execution for causality tracking. |
| **AWS S3** | ✅ `@opentelemetry/instrumentation-aws-sdk` | Auto-captures S3 operations. |
| **Zod validation** | ❌ None | Not worth instrumenting. Schema parsing is sub-millisecond. |

### Frontend (future `packages/client`)

| Component | OTel Coverage | Notes |
|-----------|---------------|-------|
| **fetch() calls** | ✅ `@opentelemetry/instrumentation-fetch` | Auto-attaches W3C `traceparent` header to every API call. Backend continues the trace. |
| **User interactions** | 🟡 Manual spans | Optional: wrap button clicks, form submits as parent spans for user-journey tracing. |
| **XState machines (frontend)** | ❌ No auto-instrumentation | Optional later: custom XState inspector hook that creates spans on state transitions. |

### Cross-process propagation

```
Browser                     Hono Server                 BullMQ Worker
   │                            │                            │
   │ fetch('/api/agents/tasks') │                            │
   │ traceparent: abc123 ──────►│                            │
   │                            │ enqueue job                │
   │                            │ w/ traceparent in job data │
   │                            │ ──────────────────────────►│
   │                            │                            │
   │  ◄── 201 ─────────────────│   ◄── result ──────────────│
   │                            │                            │
   └── Jaeger UI: one trace, all spans ─────────────────────┘
```

**Key detail:** BullMQ job data must carry the W3C `traceparent` and `tracestate` headers manually (not auto-propagated across queue boundaries). The worker extracts them and re-establishes the parent span context before processing. This is ~5 lines of code.

---

## What We Need to Add

### 1. Dependencies (`packages/server/package.json`)

```
@opentelemetry/sdk-node
@opentelemetry/auto-instrumentations-node
@opentelemetry/exporter-trace-otlp-http
@opentelemetry/api  (already transitively included)
```

### 2. Tracing bootstrap (`packages/server/src/tracing.ts`)

Initialize the SDK before any other imports in `index.ts`. Configuration:
- `NodeTracerProvider` with `SimpleSpanProcessor` (or `BatchSpanProcessor` for prod)
- `OTLPTraceExporter` pointing at `http://localhost:4318/v1/traces` (Jaeger)
- All auto-instrumentations enabled
- Service name: `noname-server`
- Attributes: `deployment.environment` from env

### 3. Manual spans in AI Pipeline (`packages/server/src/domains/ai-pipeline/service.ts`)

Wrap each method (`generateLayout`, `generateContent`, `generateMachine`) + `callLLM` with active spans. Example span attributes:
- `ai.tenant_id` = tenantId
- `ai.operation` = `generate_layout` | `generate_content` | `generate_machine`
- `ai.model` = `mock` | `openai` | `anthropic`
- `ai.tokens` = token count (when real)
- `ai.prompt_length` = prompt length

### 4. BullMQ context propagation (`packages/server/src/domains/agent/`)

When enqueueing a job, inject W3C trace context into job data. In the worker, extract it and re-establish the span context so the worker's processing shows as a child span of the HTTP request that enqueued it.

### 5. Jaeger in docker-compose

```yaml
jaeger:
  image: jaegertracing/all-in-one:latest
  ports:
    - "16686:16686"   # UI
    - "4318:4318"     # OTLP HTTP
  environment:
    - COLLECTOR_OTLP_ENABLED=true
```

### 6. Frontend (when client exists)

`@opentelemetry/sdk-trace-web` + `@opentelemetry/instrumentation-fetch` → same OTLP exporter → same Jaeger instance.

---

## What We Do NOT Need Now

| Thing | Reason |
|-------|--------|
| **OpenTelemetry Collector** | Jaeger all-in-one accepts OTLP directly. Collector adds value at scale (filtering, sampling, multi-backend export) — defer until production. |
| **Metrics (OTel Metrics SDK)** | Separate concern. Traces first. Metrics via Prometheus later. |
| **Logs → OTel** | Pino/Winston structured logs are sufficient. Link logs to traces via `trace_id` field in log output. |
| **Tail sampling** | Simple head-sampling (100% in dev, configurable % in prod) via `Sampler` config is enough now. |
| **Grafana Tempo / Honeycomb / Lightstep** | Jaeger is free, local, and sufficient for development. Swap exporter URL for any OTLP-compatible backend later. |
| **Custom propagator for in-memory event bus** | Defer. Sync events run in-process — the trace context is already on the async context. |

---

## Implementation Order

| Step | File(s) | Effort | Depends on |
|------|---------|--------|------------|
| 1. Add Jaeger to docker-compose | `docker-compose.yml` | 5 min | — |
| 2. Install OTel packages | `packages/server/package.json` | 2 min | — |
| 3. Create tracing bootstrap | `packages/server/src/tracing.ts` | 15 min | Step 2 |
| 4. Wire bootstrap into index | `packages/server/src/index.ts` | 1 min | Step 3 |
| 5. Add manual spans to AI Pipeline | `packages/server/src/domains/ai-pipeline/service.ts` | 10 min | Step 3 |
| 6. Propagate trace context through BullMQ | `packages/server/src/domains/agent/service.ts`, `worker.ts` | 15 min | Step 3 |
| 7. Verify trace waterfall in Jaeger | — | 15 min | All above |

**Total: ~1 hour**

---

## Verification Checklist

After implementation, verify by hitting any Hono endpoint (e.g., `POST /api/agents/tasks`) and checking Jaeger UI at `http://localhost:16686`:

- [ ] Top-level span: `POST /api/agents/tasks` (HTTP request)
- [ ] Child span: `INSERT INTO agents_tasks` (Drizzle/Postgres)
- [ ] Child span: `RPUSH agent-tasks` (BullMQ enqueue via ioredis)
- [ ] Child span (in worker): `JOB agent-tasks` (worker processing)
- [ ] Child span (in worker): `ai-pipeline.generateLayout` (manual span)
- [ ] Child span (in worker): `SELECT FROM agents_tasks` (result fetch)

---

## Implementation Status (2026-07-11)

All steps completed. Typecheck and lint pass.

### Files created
| File | Purpose |
|------|---------|
| `packages/server/src/tracing.ts` | OTel SDK bootstrap — `resourceFromAttributes`, `BatchSpanProcessor`, `OTLPTraceExporter` → Jaeger, auto-instrumentations |

### Files modified
| File | Change |
|------|--------|
| `docker-compose.yml` | Added Jaeger all-in-one service (ports 16686, 4318) |
| `packages/server/package.json` | Added 6 OTel deps: `api`, `auto-instrumentations-node`, `exporter-trace-otlp-http`, `resources`, `sdk-node`, `sdk-trace` |
| `packages/server/src/index.ts` | `import { startTracing } from "./tracing"` as first statement |
| `packages/server/src/domains/ai-pipeline/service.ts` | `tracer.startActiveSpan` wrapping `callLLM` with `ai.tenant_id`, `ai.operation`, `ai.prompt_length`, `ai.model`, `ai.tokens` attributes |
| `packages/server/src/domains/agent/service.ts` | `propagation.inject(context.active(), carrier)` → `traceparent`/`tracestate` injected into BullMQ job data |
| `packages/server/src/domains/agent/queue.ts` | `AgentJobData` extended with optional `traceparent`/`tracestate` fields |
| `packages/server/src/domains/agent/worker.ts` | `propagation.extract` + `context.with` + `tracer.startActiveSpan` wrapping job processing with `agent.task_id`, `agent.tenant_id`, `agent.type` attributes |

### Dependencies (exact versions)
```
@opentelemetry/api: ^1.9.1
@opentelemetry/auto-instrumentations-node: ^0.78.0
@opentelemetry/exporter-trace-otlp-http: ^0.220.0
@opentelemetry/resources: ^2.9.0
@opentelemetry/sdk-node: ^0.220.0
@opentelemetry/sdk-trace: ^2.9.0
```
