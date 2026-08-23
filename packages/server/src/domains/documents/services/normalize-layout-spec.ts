type SpecElement = {
  type?: string;
  props?: Record<string, unknown>;
};

/** Fix common LLM mistakes on TextBase blocks (copy lives at props.content — flat props). */
export function normalizeLayoutSpec(spec: Record<string, unknown>): Record<string, unknown> {
  const next = JSON.parse(JSON.stringify(spec)) as Record<string, unknown>;
  const elements = next.elements as Record<string, SpecElement> | undefined;
  if (!elements || typeof elements !== "object") return next;

  for (const el of Object.values(elements)) {
    if (el.type !== "TextBase" || !el.props || typeof el.props !== "object") continue;
    const props = el.props;
    if (typeof props.text === "string" && props.content === undefined) {
      props.content = props.text;
      delete props.text;
    }
  }

  return next;
}

export function layoutSpecsEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
