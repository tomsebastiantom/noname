/** Relative time for activity labels (browser Intl — not product copy strings). */
export function formatTimeAgo(iso: string, nowMs = Date.now(), locale = "en"): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";

  const diffSec = Math.round((then - nowMs) / 1000);
  const absSec = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  if (absSec < 60) return rtf.format(diffSec, "second");
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, "minute");
  const diffHour = Math.round(diffSec / 3600);
  if (Math.abs(diffHour) < 24) return rtf.format(diffHour, "hour");
  const diffDay = Math.round(diffSec / 86400);
  if (Math.abs(diffDay) < 7) return rtf.format(diffDay, "day");
  const diffWeek = Math.round(diffSec / 604800);
  return rtf.format(diffWeek, "week");
}
