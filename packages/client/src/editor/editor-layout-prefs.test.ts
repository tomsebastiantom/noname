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

  it("defaults agentOpen to false", () => {
    const next = normalizeLayoutPrefs({});
    expect(next.agentOpen).toBe(false);
  });

  it("preserves agentOpen through normalizeLayoutPrefs", () => {
    const next = normalizeLayoutPrefs({
      paletteWidth: 224,
      propsWidth: 288,
      paletteOpen: true,
      layersOpen: false,
      propsOpen: false,
      agentOpen: true,
      chromeOpen: true,
      canvasPreview: "full",
    });
    expect(next.agentOpen).toBe(true);
    expect(next.propsOpen).toBe(false);
  });

  it("prefers agent over properties when both are open in stored prefs", () => {
    const next = normalizeLayoutPrefs({
      propsOpen: true,
      agentOpen: true,
    });
    expect(next.agentOpen).toBe(true);
    expect(next.propsOpen).toBe(false);
  });

  it("preserves agentChatClearedAt through normalizeLayoutPrefs", () => {
    const next = normalizeLayoutPrefs({
      paletteWidth: 224,
      propsWidth: 288,
      agentChatClearedAt: { layout_abc: "2026-08-06T12:00:00.000Z" },
    });
    expect(next.agentChatClearedAt.layout_abc).toBe("2026-08-06T12:00:00.000Z");
  });
});
