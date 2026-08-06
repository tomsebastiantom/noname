import {
  collabPeerDisplayLabelsFromShell,
  formatCollabPeerLabel,
} from "../../collab/collab-peer-display";
import type { CollabPeerPresence } from "../../collab/presence";
import { peerPresenceColor } from "../../collab/presence";
import type { EditorShellLabels } from "../../schemas/components";
import { CollabAgentIcon, CollabHumanIcon } from "../collab/CollabPeerIcons";

export function CollabRemoteCursors({
  peers,
  labels,
}: Readonly<{
  peers: CollabPeerPresence[];
  labels: EditorShellLabels;
}>) {
  const displayLabels = collabPeerDisplayLabelsFromShell(labels);
  const visible = peers.filter(
    (peer) =>
      peer.peerKind === "human" &&
      peer.cursorX !== null &&
      peer.cursorY !== null &&
      Number.isFinite(peer.cursorX),
  );
  if (visible.length === 0) return null;

  return (
    <>
      {visible.map((peer) => {
        const color = peerPresenceColor(peer.peerId, peer.peerKind);
        const name = formatCollabPeerLabel(peer, displayLabels);
        const isAgent = peer.peerKind === "agent";
        const top = peer.cursorY ?? 0;
        const left = peer.cursorX ?? 0;
        return (
          <div
            key={peer.peerId}
            className={`editor-remote-cursor pointer-events-none absolute z-30${isAgent ? " editor-remote-cursor--agent" : ""}`}
            style={{ top, left }}
            title={name}
          >
            <span className="editor-remote-cursor-caret" style={{ backgroundColor: color }} />
            <span className="editor-remote-cursor-label" style={{ backgroundColor: color }}>
              {isAgent ? (
                <CollabAgentIcon className="editor-remote-cursor-icon" />
              ) : (
                <CollabHumanIcon className="editor-remote-cursor-icon" />
              )}
              <span className="editor-remote-cursor-name">{name}</span>
              {isAgent ? (
                <span className="editor-remote-cursor-badge">{labels.agentPeerBadgeLabel}</span>
              ) : null}
            </span>
          </div>
        );
      })}
    </>
  );
}
