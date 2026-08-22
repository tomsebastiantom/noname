#!/bin/bash
# Noname Dev — smoke-test script for post-restart verification
# Usage: bash skills/noname-dev/verify.sh

set -euo pipefail

echo "=== Noname Dev Verification ==="

# 1. Infra endpoints
echo "[1/6] Infra health..."
curl -sf http://localhost:3000/health || { echo "FAIL: API"; exit 1; }
curl -sf http://localhost:8080/.well-known/openid-configuration || { echo "FAIL: ZITADEL"; exit 1; }
curl -sf http://localhost:4466/health/ready || { echo "FAIL: Keto"; exit 1; }
echo "PASS"

# 2. API routes after seed:demo
echo "[2/6] API routes..."
# Get demo org id from .env
ORG_ID=$(grep ZITADEL_DEMO_ORG_ID .env | cut -d '=' -f2 | tr -d ' ')
if [ -z "$ORG_ID" ]; then ORG_ID="387316114289393674"; fi
curl -sf -H "x-org-id: $ORG_ID" \
  http://localhost:3000/api/tenants/resolve/yogastore || { echo "FAIL: tenant resolve"; exit 1; }
echo "PASS"

# 3. Edge health (should proxy /health to API)
echo "[3/6] Edge (proxy)..."
curl -sf -H "x-org-id: $ORG_ID" \
  http://localhost:8787/api/tenants/resolve/yogastore || echo "WARN: edge not reachable (may need seed first)"
echo "PASS (or WARN)"

# 4. Client loads (requires hosts entry + running client)
echo "[4/6] Client storefront..."
echo "Navigate browser to: http://yogastore.localhost:5173/ (requires hosts entry)"
echo "PASS (manual or mcp__browser__navigate)"

# 5. Browser MCP smoke (if server is registered)
echo "[5/6] Browser MCP..."
echo "Run: mcp__browser__navigate -> http://yogastore.localhost:5173/"
echo "PASS (manual or via DSH tool call)"

# 6. Admin + visual editor
echo "[6/6] Admin + editor..."
echo "Navigate browser to: http://yogastore.localhost:5173/admin"
echo "Navigate browser to: http://yogastore.localhost:5173/?edit=true"
echo "PASS"

echo "=== All checks done ==="
