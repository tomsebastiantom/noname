import type { ContextSignal } from "./ports";

// Dependency-free signal extraction from HTTP headers.
// Signal categories follow TECH.md: user, device, network, geography,
// business, referral, time.
export function extractSignals(headers: Record<string, string>): ContextSignal[] {
  const h = normalize(headers);
  const signals: ContextSignal[] = [];

  // Device (from User-Agent)
  const ua = h["user-agent"] || "";
  const device = /mobile/i.test(ua) ? "mobile" : /tablet/i.test(ua) ? "tablet" : "desktop";
  signals.push({ category: "device", key: "type", value: device });
  if (/android/i.test(ua)) signals.push({ category: "device", key: "os", value: "android" });
  else if (/iphone|ipad|mac os/i.test(ua))
    signals.push({ category: "device", key: "os", value: "ios" });

  // Referral (from Referer)
  const referer = h.referer || "";
  let referral = "direct";
  if (/instagram/i.test(referer)) referral = "instagram";
  else if (/facebook/i.test(referer)) referral = "facebook";
  else if (/google/i.test(referer)) referral = "google";
  else if (referer) referral = "other";
  signals.push({ category: "referral", key: "source", value: referral });

  // Geography (best-effort from Cloudflare / forwarded headers)
  const country = h["cf-ipcountry"] || "";
  if (country)
    signals.push({ category: "geography", key: "country", value: country.toUpperCase() });

  // User tier (from cookie, if present)
  const cookie = h.cookie || "";
  const tierMatch = cookie.match(/tier=([a-z]+)/i);
  if (tierMatch)
    signals.push({ category: "user", key: "tier", value: tierMatch[1]!.toLowerCase() });

  // Time (server hour bucket, UTC)
  const hour = new Date().getUTCHours();
  const part = hour < 6 ? "night" : hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  signals.push({ category: "time", key: "part", value: part });

  return signals;
}

function normalize(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) out[k.toLowerCase()] = v;
  return out;
}
