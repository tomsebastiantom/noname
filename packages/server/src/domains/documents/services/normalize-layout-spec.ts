type SpecElement = {
  type?: string;
  props?: Record<string, unknown>;
};

/** Fix common LLM mistakes on Text blocks (content belongs under props.labels.content). */
export function normalizeLayoutSpec(spec: Record<string, unknown>): Record<string, unknown> {
  const next = JSON.parse(JSON.stringify(spec)) as Record<string, unknown>;
  const elements = next.elements as Record<string, SpecElement> | undefined;
  if (!elements || typeof elements !== "object") return next;

  for (const el of Object.values(elements)) {
    if (el.type !== "Text" || !el.props || typeof el.props !== "object") continue;
    const props = el.props;
    const labels =
      props.labels && typeof props.labels === "object" && !Array.isArray(props.labels)
        ? ({ ...(props.labels as Record<string, unknown>) } as Record<string, unknown>)
        : ({} as Record<string, unknown>);

    if (typeof props.content === "string" && labels.content === undefined) {
      labels.content = props.content;
      delete props.content;
    }
    if (typeof props.text === "string" && labels.content === undefined) {
      labels.content = props.text;
      delete props.text;
    }
    if (typeof labels.text === "string" && labels.content === undefined) {
      labels.content = labels.text;
      delete labels.text;
    }

    if (Object.keys(labels).length > 0) {
      props.labels = labels;
    }
  }

  return next;
}

export function layoutSpecsEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
