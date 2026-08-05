import type { AgentArtifact } from "./types";

export interface ArtifactCollector {
  push(artifact: AgentArtifact): void;
  list(): AgentArtifact[];
}

export function createArtifactCollector(): ArtifactCollector {
  const artifacts: AgentArtifact[] = [];
  return {
    push(artifact) {
      artifacts.push(artifact);
    },
    list() {
      return [...artifacts];
    },
  };
}

export function extractLayoutSpec(response: unknown): Record<string, unknown> {
  if (response && typeof response === "object") {
    const row = response as Record<string, unknown>;
    if (row.spec && typeof row.spec === "object" && !Array.isArray(row.spec)) {
      return row.spec as Record<string, unknown>;
    }
    return row;
  }
  return { type: "container", props: {}, children: [] };
}

export function extractContentData(response: unknown): Record<string, unknown> {
  if (response && typeof response === "object" && !Array.isArray(response)) {
    return response as Record<string, unknown>;
  }
  return { title: "Generated content", body: String(response ?? "") };
}
