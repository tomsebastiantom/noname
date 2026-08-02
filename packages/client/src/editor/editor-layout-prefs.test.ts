import { describe, expect, it } from "vitest";
import { normalizeLayoutPrefs } from "./editor-layout-prefs";

describe("normalizeLayoutPrefs", () => {
  it("allows layers-only sidebar (blocks hidden, layers open)", () => {
    const next = normalizeLayoutPrefs({
      paletteWidth: 224,
      propsWidth: 288,
      paletteOpen: false,
      layersOpen: true,
      propsOpen: true,
      chromeOpen: true,
    });
    expect(next.paletteOpen).toBe(false);
    expect(next.layersOpen).toBe(true);
  });

  it("migrates legacy leftTab layers without forcing palette closed", () => {
    const next = normalizeLayoutPrefs({
      leftTab: "layers",
      paletteOpen: false,
      paletteWidth: 224,
      propsWidth: 288,
    });
    expect(next.layersOpen).toBe(true);
    expect(next.paletteOpen).toBe(true);
  });
});
