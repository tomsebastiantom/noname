import { describe, expect, it } from "vitest";
import { currencyExponent, fromMinorUnits, normalizeCurrency, toMinorUnits } from "./money";

describe("Commerce money units", () => {
  it("uses ISO currency exponents for two-, zero-, and three-fraction currencies", () => {
    expect(currencyExponent("CAD")).toBe(2);
    expect(currencyExponent("USD")).toBe(2);
    expect(currencyExponent("JPY")).toBe(0);
    expect(currencyExponent("KWD")).toBe(3);
    expect(toMinorUnits(12.34, "CAD")).toBe(1234);
    expect(toMinorUnits(125, "JPY")).toBe(125);
    expect(toMinorUnits(1.234, "KWD")).toBe(1234);
    expect(fromMinorUnits(1234, "KWD")).toBe(1.234);
  });

  it("rejects unsupported precision and malformed currency codes", () => {
    expect(() => toMinorUnits(1.005, "CAD")).toThrow("more precision");
    expect(() => toMinorUnits(1.5, "JPY")).toThrow("more precision");
    expect(() => normalizeCurrency("US")).toThrow("ISO-4217");
    expect(() => normalizeCurrency("ZZZ")).toThrow();
  });
});
