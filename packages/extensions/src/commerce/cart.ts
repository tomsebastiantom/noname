const STORAGE_TOKEN = "noname:access_token";
const CART_INSTANCE_KEY = "noname:cart_instance_id";

function authHeaders(): HeadersInit {
  const token = sessionStorage.getItem(STORAGE_TOKEN);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
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

export async function getOrStartCart(): Promise<string> {
  const existing = sessionStorage.getItem(CART_INSTANCE_KEY);
  if (existing) return existing;

  const res = await fetch("/api/machines/start", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ machineName: "cart", context: { items: [] } }),
  });
  const instance = await parseJson<MachineInstance>(res);
  sessionStorage.setItem(CART_INSTANCE_KEY, instance.id);
  return instance.id;
}

export async function addProductToCart(productId: string, quantity: number): Promise<void> {
  const instanceId = await getOrStartCart();

  const getRes = await fetch(`/api/machines/instances/${instanceId}`, {
    headers: authHeaders(),
  });
  const instance = await parseJson<MachineInstance>(getRes);
  const items = Array.isArray(instance.context.items) ? [...instance.context.items] : [];
  items.push({ productId, quantity });

  const res = await fetch(`/api/machines/${instanceId}/addToCart`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ items }),
  });
  const updated = await parseJson<MachineInstance>(res);
  if (!Array.isArray(updated.context.items)) {
    throw new Error("Cart update failed");
  }
}
