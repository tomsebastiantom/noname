import { useMemo, useState } from "react";
import {
  collabPeerDisplayLabelsFromShell,
  collabPeerTooltip,
  fillCollabCountTemplate,
  formatCollabPeerLabel,
  partitionCollabPeers,
} from "../../collab/collab-peer-display";
import type { CollabPeerPresence } from "../../collab/presence";
import { peerPresenceColor } from "../../collab/presence";
import type { EditorShellLabels } from "../../schemas/components";
import { CollabAgentIcon, CollabHumanIcon } from "../collab/CollabPeerIcons";

import "./collab-presence.css";

function CollabPeerChip({
  peer,
  labels,
}: Readonly<{
  peer: CollabPeerPresence;
  labels: EditorShellLabels;
}>) {
  const displayLabels = collabPeerDisplayLabelsFromShell(labels);
  const name = formatCollabPeerLabel(peer, displayLabels);
  const color = peerPresenceColor(peer.peerId, peer.peerKind);
  const isAgent = peer.peerKind === "agent";
  const tooltip = collabPeerTooltip(peer, displayLabels, labels.agentPeerBadgeLabel);

  return (
    <span
      className={`editor-collab-peer-chip${isAgent ? " editor-collab-peer-chip--agent" : ""}`}
      title={tooltip}
    >
      {isAgent ? (
        <CollabAgentIcon className="editor-collab-peer-icon" />
      ) : (
        <CollabHumanIcon className="editor-collab-peer-icon" />
      )}
      <span className="editor-collab-peer-dot" style={{ backgroundColor: color }} />
      <span className="editor-collab-peer-name">{name}</span>
      {isAgent ? (
        <span className="editor-collab-peer-badge">{labels.agentPeerBadgeLabel}</span>
      ) : null}
    </span>
  );
}

function CollabPeerGroup({
  kind,
  peers,
  labels,
}: Readonly<{
  kind: "human" | "agent";
  peers: CollabPeerPresence[];
  labels: EditorShellLabels;
}>) {
  const [expanded, setExpanded] = useState(false);
  if (peers.length === 0) return null;

  if (peers.length === 1) {
    return <CollabPeerChip peer={peers[0]!} labels={labels} />;
  }

  const countLabel = fillCollabCountTemplate(
    kind === "human" ? labels.collabPeopleCountTemplate : labels.collabAgentsCountTemplate,
    peers.length,
  );
  const toggleLabel = expanded ? labels.collabCollapseGroupLabel : labels.collabExpandGroupLabel;

  return (
    <span className="editor-collab-group-list">
      <button
        type="button"
        className={`editor-collab-group-toggle${kind === "agent" ? " editor-collab-group-toggle--agent" : ""}`}
        aria-expanded={expanded}
        title={toggleLabel}
        onClick={() => setExpanded((current) => !current)}
      >
        {kind === "agent" ? (
          <CollabAgentIcon className="editor-collab-peer-icon" />
        ) : (
          <CollabHumanIcon className="editor-collab-peer-icon" />
        )}
        <span>{countLabel}</span>
      </button>
      {expanded
        ? peers.map((peer) => <CollabPeerChip key={peer.peerId} peer={peer} labels={labels} />)
        : null}
    </span>
  );
}

export function CollabPresenceBar({
  connected,
  peers,
  selfDisplayName,
  labels,
}: Readonly<{
  connected: boolean;
  peers: CollabPeerPresence[];
  selfDisplayName: string;
  labels: EditorShellLabels;
}>) {
  const { humans, agents } = useMemo(() => partitionCollabPeers(peers), [peers]);
  const alone = humans.length === 0 && agents.length === 0;

  return (
    <div className="editor-collab-presence">
      <span className="editor-collab-presence-live">{labels.collabLiveLabel}</span>
      <span
        className={`editor-collab-presence-dot ${connected ? "bg-emerald-500" : "bg-amber-500"}`}
        title={connected ? labels.collabConnectedTitle : labels.collabReconnectingTitle}
      />
      <span className="editor-collab-presence-sep" aria-hidden>
        ·
      </span>
      <span
        className="editor-collab-peer-chip"
        title={`${labels.collabSelfLabel} (${selfDisplayName})`}
      >
        <CollabHumanIcon className="editor-collab-peer-icon" />
        <span className="editor-collab-peer-name">{labels.collabSelfLabel}</span>
      </span>
      {alone ? (
        <>
          <span className="editor-collab-presence-sep" aria-hidden>
            ·
          </span>
          <span>{labels.collabEditingAloneLabel}</span>
        </>
      ) : (
        <>
          {humans.length > 0 ? (
            <>
              <span className="editor-collab-presence-sep" aria-hidden>
                ·
              </span>
              <CollabPeerGroup kind="human" peers={humans} labels={labels} />
            </>
          ) : null}
          {agents.length > 0 ? (
            <>
              <span className="editor-collab-presence-sep" aria-hidden>
                ·
              </span>
              <CollabPeerGroup kind="agent" peers={agents} labels={labels} />
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
