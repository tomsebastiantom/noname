# Noname Dev — Verification Reference

## Full clean-reset checklist (after `podman compose down -v`)

1. [ ] `podman compose up -d` — all 8 services healthy
2. [ ] `pnpm init:zitadel` — writes `.env` + `zitadel_keys/`
3. [ ] `pnpm --filter @noname/server db:push` — schema pushed
4. [ ] `pnpm dev` — server binds `:3000`
5. [ ] `pnpm --filter @noname/workers dev` — edge binds `:8787`
6. [ ] `pnpm --filter @noname/client dev` — client binds `:5173`
7. [ ] `pnpm seed:demo` — demo org `yogastore` created
8. [ ] `hosts` file has `127.0.0.1 yogastore.localhost`
9. [ ] Browser MCP connects (`mcp__browser__navigate` hits `/` and renders)

## API smoke tests (post-seed)

```bash
curl -sf http://localhost:3000/health
curl -sf -H "x-org-id: 387316114289393674" \
  http://localhost:3000/api/tenants/resolve/yogastore
curl -sf http://localhost:8080/.well-known/openid-configuration
curl -sf http://localhost:4466/health/ready
```

## Browser MCP smoke flows

1. `mcp__browser__navigate` → `http://yogastore.localhost:5173/`
2. Confirm storefront loads (no console errors)
3. `mcp__browser__navigate` → `http://yogastore.localhost:5173/login`
4. Confirm login form renders
5. `mcp__browser__navigate` → `http://yogastore.localhost:5173/admin`
6. Confirm admin dashboard loads
7. `mcp__browser__navigate` → `http://yogastore.localhost:5173/?edit=true`
8. Confirm visual editor loads
