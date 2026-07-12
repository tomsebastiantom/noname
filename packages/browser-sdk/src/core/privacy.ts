export function isBot(): boolean {
  if (typeof navigator === "undefined") return true;

  if (navigator.webdriver && !(window as any).Cypress && !(window as any).playwright) {
    return true;
  }

  const ua = navigator.userAgent;
  return /Googlebot|AdsBot|bingbot|Baiduspider|YandexBot|HeadlessChrome/i.test(ua);
}

export function respectDNT(): boolean {
  return navigator.doNotTrack === "1" || (navigator as any).globalPrivacyControl === true;
}
