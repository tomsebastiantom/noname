const STORAGE_TOKEN = "noname:access_token";
const CART_INSTANCE_KEY = "noname:cart_instance_id";
const CART_GUEST_KEY = "noname:cart_guest";

const PUBLISHABLE_KEY_KEY = "noname:publishable_key";

function authHeaders(): HeadersInit {
  const token = sessionStorage.getItem(STORAGE_TOKEN);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
    return headers;
  }
  // Anonymous storefront calls carry the store's publishable key (cached from
  // the public catalog manifest). No key = no anonymous surface (401).
  const storeKey = sessionStorage.getItem(PUBLISHABLE_KEY_KEY);
  if (storeKey) headers["x-publishable-key"] = storeKey;
  return headers;
}

/** Fetches + caches the store's publishable key from the public catalog. */
export async function getPublishableKey(): Promise<string | null> {
  const cached = sessionStorage.getItem(PUBLISHABLE_KEY_KEY);
  if (cached) return cached;
  const slug = window.location.hostname.split(".")[0] ?? "";
  try {
    const res = await fetch(`/api/tenants/${encodeURIComponent(slug)}/catalog`);
    const body = (await res.json()) as { data?: { publishableKey?: string | null } };
    const key = body.data?.publishableKey ?? null;
    if (key) sessionStorage.setItem(PUBLISHABLE_KEY_KEY, key);
    return key;
  } catch {
    return null;
  }
}

interface CartItem {
  productId: string;
  quantity: number;
}

interface ApiEnvelope<T> {
  data?: T;
}

interface MachineInstance {
  id: string;
  context: { items?: CartItem[] };
}

async function parseJson<T>(res: Response): Promise<T> {
  const body = (await res.json()) as ApiEnvelope<T> & { error?: string };
  if (!res.ok) {
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  if (body.data === undefined) {
    throw new Error("Missing response data");
  }
  return body.data;
}

let merging = false;

export async function getOrStartCart(): Promise<string> {
  // Lazy merge: covers logins that happened while this module wasn't loaded
  // (e.g. /login page without the commerce registry).
  if (!merging && sessionStorage.getItem(STORAGE_TOKEN) && sessionStorage.getItem(CART_GUEST_KEY)) {
    merging = true;
    try {
      await mergeGuestCartOnLogin();
    } finally {
      merging = false;
    }
  }
  const existing = sessionStorage.getItem(CART_INSTANCE_KEY);
  if (existing) return existing;

  const guest = !sessionStorage.getItem(STORAGE_TOKEN);
  if (guest) {
    // Prime the publishable key cache so anonymous calls carry it.
    await getPublishableKey();
  }
  const res = await fetch("/api/machines/cart/start", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ context: { items: [] } }),
  });
  const instance = await parseJson<MachineInstance>(res);
  sessionStorage.setItem(CART_INSTANCE_KEY, instance.id);
  if (guest) sessionStorage.setItem(CART_GUEST_KEY, "1");
  return instance.id;
}

/**
 * ZITADEL `sub` from stored token. Local decode — mirrors client
 * auth/session (extensions package can't import client code).
 */
function sessionSub(): string | null {
  const token = sessionStorage.getItem(STORAGE_TOKEN);
  const part = token?.split(".")[1];
  if (!part) return null;
  try {
    let base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4 !== 0) base64 += "=";
    const payload = JSON.parse(atob(base64)) as { sub?: unknown };
    return typeof payload.sub === "string" && payload.sub.trim() ? payload.sub.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Claim the guest cart for the signed-in user: a single atomic `claim`
 * transition stamps `ownerUserId` — no copy, no double-count on retry.
 * The guest flag clears only after success, so a post-login navigation that
 * unloads the page mid-merge simply retries on next cart interaction.
 * Same-tab only — guest id + token share sessionStorage.
 */
export async function mergeGuestCartOnLogin(): Promise<void> {
  if (!sessionStorage.getItem(CART_GUEST_KEY)) return;
  const guestId = sessionStorage.getItem(CART_INSTANCE_KEY);
  if (!guestId) {
    sessionStorage.removeItem(CART_GUEST_KEY);
    return;
  }
  const userId = sessionSub();
  if (!userId) return;
  const res = await fetch(`/api/machines/cart/${guestId}/claim`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ ownerUserId: userId }),
  });
  await parseJson<MachineInstance>(res);
  sessionStorage.removeItem(CART_GUEST_KEY);
}

export async function addProductToCart(productId: string, quantity: number): Promise<void> {
  const instanceId = await getOrStartCart();

  const getRes = await fetch(`/api/machines/cart/${instanceId}`, {
    headers: authHeaders(),
  });
  const instance = await parseJson<MachineInstance>(getRes);
  const items = Array.isArray(instance.context.items) ? [...instance.context.items] : [];
  items.push({ productId, quantity });

  const res = await fetch(`/api/machines/cart/${instanceId}/addToCart`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ items }),
  });
  const updated = await parseJson<MachineInstance>(res);
  if (!Array.isArray(updated.context.items)) {
    throw new Error("Cart update failed");
  }
}
