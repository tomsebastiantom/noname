export const DEFAULT_CHECKOUT_CURRENCIES = ["CAD", "USD"] as const;

/** Return the ISO-4217 minor-unit exponent provided by the current runtime's CLDR data. */
export function currencyExponent(currency: string): number {
  const normalized = normalizeCurrency(currency);
  const resolved = new Intl.NumberFormat("en", {
    style: "currency",
    currency: normalized,
  }).resolvedOptions();
  const exponent = resolved.maximumFractionDigits ?? 2;
  if (!Number.isInteger(exponent) || exponent < 0 || exponent > 3) {
    throw new Error(`Unsupported currency exponent for ${normalized}`);
  }
  return exponent;
}

export function normalizeCurrency(currency: string): string {
  const normalized = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) throw new Error("Currency must be an ISO-4217 code");
  const supportedCodes = new Set(Intl.supportedValuesOf("currency"));
  if (!supportedCodes.has(normalized)) {
    throw new Error(`Currency ${normalized} is not a recognized ISO-4217 code`);
  }
  return normalized;
}

/** Convert a major-unit catalog price to integer minor units without float rounding. */
export function toMinorUnits(price: number, currency: string): number {
  if (!Number.isFinite(price) || price < 0) throw new Error("Price must be a non-negative number");
  const exponent = currencyExponent(currency);
  const scale = 10 ** exponent;
  const scaled = price * scale;
  const rounded = Math.round(scaled);
  const tolerance = Math.max(1e-8, Math.abs(scaled) * Number.EPSILON * 8);
  if (!Number.isSafeInteger(rounded) || Math.abs(scaled - rounded) > tolerance) {
    throw new Error(`Price has more precision than ${currency} allows`);
  }
  return rounded;
}

export function fromMinorUnits(amountMinor: number, currency: string, exponent?: number): number {
  if (!Number.isSafeInteger(amountMinor)) throw new Error("Amount must be an integer in minor units");
  const digits = exponent ?? currencyExponent(currency);
  if (!Number.isInteger(digits) || digits < 0 || digits > 3) {
    throw new Error("Invalid currency exponent");
  }
  return amountMinor / 10 ** digits;
}
