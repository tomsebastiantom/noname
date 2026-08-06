# Live orchestrate via local LiteLLM (aiplayground)

> **Use when:** `MASTRA_ORCHESTRATE_MOCK=false` and you want real planner + tools against Autodesk AIS models through your [aiplayground](file:///Users/sebastt/Downloads/aiplayground) proxy.

## Why LiteLLM?

Noname’s agent planner speaks **OpenAI-compatible** HTTP (`/v1/chat/completions`). It does **not** talk to APS/AIS OAuth directly.

Your **aiplayground** repo runs LiteLLM on `:4000` and routes to AIS:

```
Noname API (Mastra) → http://localhost:4000/v1 → APS OAuth → AIS playground models
```

Same pattern as Claude Code / Grok in `aiplayground/AGENTS-SETUP.md`.

You do **not** need a personal OpenAI API key for local dev when the proxy is up — noname auto-uses `sk-local` if `OPENAI_BASE_URL` is set and `NODE_ENV !== production`.

---

## 1. Start aiplayground proxy

```bash
cd /Users/sebastt/Downloads/aiplayground
pip install -r requirements.txt
./scripts/start_proxy.sh
```

Verify:

```bash
curl http://localhost:4000/v1/models -H "Authorization: Bearer anything"
python scripts/check_proxy.py
```

Ensure your APS client id is **authorized** for the model you pick (`./scripts/authorize_models.sh --config`).

---

## 2. Configure noname server

Edit **`packages/server/.env`** (API loads this file, not repo root):

```bash
MASTRA_ORCHESTRATE_MOCK=false
OPENAI_BASE_URL=http://localhost:4000/v1
MASTRA_PLANNER_MODEL=openai/playground-gpt-5-mini
```

Optional — explicit key (anything works with local LiteLLM):

```bash
OPENAI_API_KEY=anything
```

**Model names** must match `aiplayground/config/config.yaml` `model_name` entries, e.g.:

| MASTRA_PLANNER_MODEL | LiteLLM model |
|----------------------|---------------|
| `openai/playground-gpt-5-mini` | `playground-gpt-5-mini` |
| `openai/playground-gpt-5-6-terra` | `playground-gpt-5-6-terra` |
| `openai/playground-claude-sonnet-5` | `playground-claude-sonnet-5` |

The `openai/` prefix is for noname’s provider routing; the bare name is what LiteLLM receives (handled in `resolve-planner-model.ts`).

---

## 3. Restart API

```bash
# from repo root or packages/server
pnpm dev
```

Confirm tracing line if you use Jaeger: `[tracing] OTLP exporter → ...`

---

## 4. Run agent from editor

1. Open visual editor → **Agent** tab
2. Select **Local test agent**
3. Send a prompt

Check task in Admin → Agents → Tasks or:

```sql
SELECT id, status, model, error, output->>'summary' FROM agent_tasks ORDER BY created_at DESC LIMIT 3;
```

Live run: `model` should be `openai/playground-gpt-5-mini` (or your spec), not `mock-orchestrate`.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Invalid model name … openai/playground-…` | Update server — planner must send bare model id to LiteLLM (`providerId` + `modelId` config). |
| `401 ClientID is not allowed` | Authorize model in APS: `amp deployments authorize --deployment-name=… --client-id=$APS_CLIENT_ID --env=stg` |
| Proxy connection refused | Start `./scripts/start_proxy.sh` in aiplayground |
| Still `mock-orchestrate` | `MASTRA_ORCHESTRATE_MOCK` still true or API not restarted after `.env` change |
| `Assertion failed` | Often collab/Automerge, not LLM — see [AGENT-CHAT-OBSERVABILITY.md](./AGENT-CHAT-OBSERVABILITY.md) |
| Empty LLM response | Try another model; some playground models return empty at low `max_tokens` |

### Quick LLM smoke test (bypass noname)

```bash
curl http://localhost:4000/v1/chat/completions \
  -H "Authorization: Bearer anything" \
  -H "Content-Type: application/json" \
  -d '{"model":"playground-gpt-5-mini","messages":[{"role":"user","content":"Say hi"}],"max_tokens":50}'
```

---

## Code references

| Piece | Path |
|-------|------|
| Base URL + auto `sk-local` | `packages/server/src/domains/agent/mastra/llm-env.ts` |
| Planner model resolution | `packages/server/src/domains/agent/mastra/resolve-planner-model.ts` |
| Orchestrate executor | `packages/server/src/domains/agent/mastra/executor.ts` |
| ai-pipeline (tool LLM calls) | `packages/server/src/domains/ai-pipeline/providers.ts` |
