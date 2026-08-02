import { markDevtoolsActive } from "@json-render/core";

/** Release from markDevtoolsActive — cleared on editor unmount. */
let release: (() => void) | null = null;

/**
 * Enable json-render element keys (`data-jr-key`) for canvas selection.
 * Called once when the editor lazy chunk loads, before the first Renderer pass.
 */
export function activateEditorDevtools(): void {
  if (!release) {
    release = markDevtoolsActive();
  }
}

export function releaseEditorDevtools(): void {
  release?.();
  release = null;
}
