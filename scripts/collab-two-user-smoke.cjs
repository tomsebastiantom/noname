/**
 * Two-user layout collab smoke: editor WS peer while admin stays in browser.
 * Run: node scripts/collab-two-user-smoke.cjs
 */
require("dotenv/config");

const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const crypto = require("node:crypto");
const Automerge = require("@automerge/automerge");
const { WebSocketClientAdapter } = require("@automerge/automerge-repo-network-websocket");

const API = process.env.API_BASE ?? "http://localhost:3000";
const API_PORT = Number(new URL(API).port || "3000");
const STORE = "yogastore";

const oidc = JSON.parse(
  readFileSync(join(__dirname, "../packages/client/public/oidc.json"), "utf8"),
);

function codeVerifier() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  let out = "";
  for (let i = 0; i < 64; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

async function apiLogin(email, password) {
  const res = await fetch(`${API}/api/auth/${STORE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      codeVerifier: codeVerifier(),
      clientId: oidc.clientId,
      redirectUri: oidc.redirectUri,
    }),
  });
  const json = await res.json();
  const token = json.data?.accessToken;
  if (!token) throw new Error(`Login failed for ${email}: ${JSON.stringify(json)}`);
  return token;
}

async function apiData(path, token, orgId, init) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Org-Id": orgId,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${path}: ${json.error ?? res.status}`);
  return json.data;
}

class LayoutCollabWsClient extends WebSocketClientAdapter {
  onPresenceMessage = null;

  constructor(url) {
    super(url);
    const parentOnOpen = this.onOpen;
    this.onOpen = () => parentOnOpen.call(this);
  }

  onMessage = (event) => {
    if (typeof event.data === "string") {
      this.onPresenceMessage?.(event.data);
      return;
    }
    const data = event.data;
    if (data instanceof ArrayBuffer) {
      this.receiveMessage(new Uint8Array(data));
      return;
    }
    if (ArrayBuffer.isView(data)) {
      const view = data;
      this.receiveMessage(
        new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength)),
      );
    }
  };

  sendPresence(raw) {
    if (this.socket?.readyState === 1) this.socket.send(raw);
  }
}

function layoutCollabWsUrl(port, ticket) {
  return `ws://127.0.0.1:${port}/api/collab/layout/ws?collab_ticket=${encodeURIComponent(ticket)}`;
}

async function awaitCollabDocHandle(repo, documentId) {
  const progress = repo.findWithProgress(documentId);
  if (progress.untilReady) return progress.untilReady(["ready", "unavailable"]);
  if (progress.state === "ready" || progress.state === "unavailable") return progress.handle;
  await progress.handle.whenReady(["ready", "unavailable"]);
  return progress.handle;
}

function patchPromoContent(spec, content) {
  const next = JSON.parse(JSON.stringify(spec));
  next.elements.promo.props.labels.content = content;
  return next;
}

function applyPromoContent(handle, prevSpec, nextSpec) {
  handle.change((draft) => {
    draft.elements.promo.props.labels.content = nextSpec.elements.promo.props.labels.content;
  });
}

async function main() {
  const { interpretAsDocumentId, Repo, initializeWasm } = await import(
    "@automerge/automerge-repo/slim"
  );
  const wasmBytes = readFileSync(
    join(__dirname, "../node_modules/@automerge/automerge/dist/mjs/automerge.wasm"),
  );
  await initializeWasm(wasmBytes);
  const orgId = (await fetch(`${API}/api/tenants/resolve/${STORE}`).then((r) => r.json())).data
    .orgId;

  const editorToken = await apiLogin(
    "editor@zitadel.localhost",
    process.env.ZITADEL_DEMO_EDITOR_PASSWORD?.trim() ?? "NonameEditor1!",
  );

  const layouts = await apiData(
    "/api/documents/layout?templateName=home&segment=default",
    editorToken,
    orgId,
  );
  const layout = layouts[0];
  if (!layout) throw new Error("home layout not found");

  const layoutDocumentId = layout.id;
  const prevSpec = layout.data.spec;
  const marker = `[editor-smoke ${Date.now()}]`;
  const nextSpec = patchPromoContent(prevSpec, `${marker} Two-user collab OK`);

  const { ticket } = await apiData("/api/collab/layout/ticket", editorToken, orgId, {
    method: "POST",
    body: JSON.stringify({ layoutDocumentId, displayName: "Demo Editor" }),
  });

  const adapter = new LayoutCollabWsClient(layoutCollabWsUrl(API_PORT, ticket));
  let peerNames = [];
  adapter.onPresenceMessage = (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type !== "presence-sync") return;
      peerNames = (msg.peers ?? [])
        .map((p) => p.displayName)
        .filter((n) => n && String(n).trim());
      console.log("presence-sync peers:", peerNames.join(", ") || "(none)");
    } catch {
      // ignore
    }
  };

  const repo = new Repo({
    network: [adapter],
    peerId: `layout-smoke-editor-${crypto.randomUUID()}`,
  });

  const handle = await awaitCollabDocHandle(
    repo,
    interpretAsDocumentId(layoutDocumentId),
  );
  await adapter.whenReady();
  await new Promise((r) => setTimeout(r, 600));

  adapter.sendPresence(
    JSON.stringify({
      type: "presence",
      peerKind: "human",
      displayName: "Demo Editor",
      selectedElementId: "promo",
      cursorX: null,
      cursorY: null,
    }),
  );
  await new Promise((r) => setTimeout(r, 400));

  applyPromoContent(handle, prevSpec, nextSpec);
  await new Promise((r) => setTimeout(r, 1000));

  const content = handle.doc()?.elements?.promo?.props?.labels?.content;
  console.log("Editor applied promo:", content);
  if (!String(content).includes(marker)) throw new Error("Editor local apply failed");

  const hasOtherHuman = peerNames.some((n) => n !== "Demo Editor");
  console.log(
    hasOtherHuman
      ? "PASS: editor saw other human peer (admin browser)"
      : "WARN: editor did not see admin in presence yet",
  );

  await repo.shutdown();
  adapter.disconnect();
  console.log("SUCCESS — editor peer applied change; check admin browser tab");
}

main().catch((err) => {
  console.error("SMOKE FAILED:", err);
  process.exit(1);
});
