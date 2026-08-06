import type { CollabPeerPresence } from "./presence";

export type CollabPeerDisplayLabels = {
  humanFallback: string;
  agentFallback: string;
};

export const COLLAB_HUMAN_FALLBACK = "Collaborator";
export const COLLAB_AGENT_FALLBACK = "Agent";

export function collabPeerDisplayLabelsFromShell(labels: {
  collabHumanFallbackLabel: string;
  collabAgentFallbackLabel: string;
}): CollabPeerDisplayLabels {
  return {
    humanFallback: labels.collabHumanFallbackLabel,
    agentFallback: labels.collabAgentFallbackLabel,
  };
}

export function formatCollabPeerLabel(
  peer: CollabPeerPresence,
  displayLabels: CollabPeerDisplayLabels = {
    humanFallback: COLLAB_HUMAN_FALLBACK,
    agentFallback: COLLAB_AGENT_FALLBACK,
  },
): string {
  if (peer.displayName?.trim()) {
    return peer.displayName.trim();
  }
  return peer.peerKind === "agent" ? displayLabels.agentFallback : displayLabels.humanFallback;
}

export function collabPeerTooltip(
  peer: CollabPeerPresence,
  displayLabels: CollabPeerDisplayLabels,
  agentBadgeLabel?: string,
): string {
  const name = formatCollabPeerLabel(peer, displayLabels);
  const selection = peer.selectedElementId ? ` · ${peer.selectedElementId}` : "";
  if (peer.peerKind === "agent") {
    const badge = agentBadgeLabel ?? displayLabels.agentFallback;
    return `${name} (${badge})${selection}`;
  }
  return `${name}${selection}`;
}

export function partitionCollabPeers(peers: CollabPeerPresence[]): {
  humans: CollabPeerPresence[];
  agents: CollabPeerPresence[];
} {
  const deduped = dedupeCollabPeersByUser(peers);
  const humans: CollabPeerPresence[] = [];
  const agents: CollabPeerPresence[] = [];
  for (const peer of deduped) {
    if (peer.peerKind === "agent") {
      agents.push(peer);
    } else {
      humans.push(peer);
    }
  }
  return { humans, agents };
}

/** One presence row per kind+user — prefer named peer when ticket refresh duplicates. */
export function dedupeCollabPeersByUser(peers: CollabPeerPresence[]): CollabPeerPresence[] {
  const byKey = new Map<string, CollabPeerPresence>();
  for (const peer of peers) {
    const key = `${peer.peerKind}:${peer.userId}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, peer);
      continue;
    }
    const existingNamed = Boolean(existing.displayName?.trim());
    const peerNamed = Boolean(peer.displayName?.trim());
    if (peerNamed || !existingNamed) {
      byKey.set(key, peer);
    }
  }
  return [...byKey.values()];
}

export function fillCollabCountTemplate(template: string, count: number): string {
  return template.replace("{count}", String(count));
}

/** Server-pushed agent-task lifecycle (collab WS), not a synthetic Live peer. */
export type LayoutAgentActivity = {
  taskId: string;
  registeredAgentId: string;
  agentLabel: string;
};
