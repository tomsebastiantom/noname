/** CAN-SPAM / marketing email footer + List-Unsubscribe headers (I-c.6c). */

export function resolveCommunicationPreferencesUrl(storeSlug: string | null | undefined): string {
  const origin = process.env.STORE_PUBLIC_ORIGIN?.trim();
  if (origin) {
    return `${origin.replace(/\/$/, "")}/account/communication-preferences`;
  }
  const slug = storeSlug?.trim() || "yogastore";
  const port = process.env.CLIENT_DEV_PORT?.trim() || "5173";
  return `http://${slug}.localhost:${port}/account/communication-preferences`;
}

export function applyMarketingEmailCompliance(
  rendered: { subject: string; html: string; text: string },
  prefsUrl: string,
): { subject: string; html: string; text: string; headers: Record<string, string> } {
  const footerHtml =
    `<p style="font-size:12px;color:#666;margin-top:24px">` +
    `You're receiving this because you opted in to marketing emails. ` +
    `<a href="${prefsUrl}">Manage preferences</a>.</p>`;
  const footerText = `\n\nManage notification preferences: ${prefsUrl}`;

  return {
    subject: rendered.subject,
    html: rendered.html + footerHtml,
    text: (rendered.text ?? "") + footerText,
    headers: {
      "List-Unsubscribe": `<${prefsUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}
