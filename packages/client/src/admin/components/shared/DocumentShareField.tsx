import { useCallback, useEffect, useState } from "react";
import {
  type DocumentEditor,
  fetchDocumentEditors,
  fetchDocumentPublishers,
  grantDocumentEditor,
  grantDocumentPublisher,
  revokeDocumentEditor,
  revokeDocumentPublisher,
} from "../../../auth/document-scope";
import { fetchTeamUsers, type TeamUser } from "../../../auth/team-users";
import { Alert, AlertDescription } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import { Label } from "../../../components/ui/label";
import { mergeCatalogError, useCatalogSubmit } from "../../../core/use-catalog-submit";

export type DocumentShareFieldLabels = {
  shareTitle: string;
  shareHint: string;
  shareUserLabel: string;
  shareGrantLabel: string;
  shareGrantingLabel: string;
  shareRevokeLabel: string;
  shareRevokingLabel: string;
  shareGrantSuccessMessage: string;
  shareRevokeSuccessMessage: string;
  shareEmptyMessage: string;
  shareLoadingLabel: string;
};

export type DocumentPublisherShareFieldLabels = {
  publisherShareTitle: string;
  publisherShareHint: string;
  publisherShareUserLabel: string;
  publisherShareGrantLabel: string;
  publisherShareGrantingLabel: string;
  publisherShareRevokeLabel: string;
  publisherShareRevokingLabel: string;
  publisherShareGrantSuccessMessage: string;
  publisherShareRevokeSuccessMessage: string;
  publisherShareEmptyMessage: string;
  publisherShareLoadingLabel: string;
};

export type DocumentShareSlotLabels = DocumentShareFieldLabels & DocumentPublisherShareFieldLabels;

export type DocumentShareSlot = "editor" | "publisher";

type ResolvedShareLabels = DocumentShareFieldLabels;

function resolveShareLabels(
  labels: DocumentShareSlotLabels,
  slot: DocumentShareSlot,
): ResolvedShareLabels {
  if (slot === "editor") {
    return {
      shareTitle: labels.shareTitle,
      shareHint: labels.shareHint,
      shareUserLabel: labels.shareUserLabel,
      shareGrantLabel: labels.shareGrantLabel,
      shareGrantingLabel: labels.shareGrantingLabel,
      shareRevokeLabel: labels.shareRevokeLabel,
      shareRevokingLabel: labels.shareRevokingLabel,
      shareGrantSuccessMessage: labels.shareGrantSuccessMessage,
      shareRevokeSuccessMessage: labels.shareRevokeSuccessMessage,
      shareEmptyMessage: labels.shareEmptyMessage,
      shareLoadingLabel: labels.shareLoadingLabel,
    };
  }
  return {
    shareTitle: labels.publisherShareTitle,
    shareHint: labels.publisherShareHint,
    shareUserLabel: labels.publisherShareUserLabel,
    shareGrantLabel: labels.publisherShareGrantLabel,
    shareGrantingLabel: labels.publisherShareGrantingLabel,
    shareRevokeLabel: labels.publisherShareRevokeLabel,
    shareRevokingLabel: labels.publisherShareRevokingLabel,
    shareGrantSuccessMessage: labels.publisherShareGrantSuccessMessage,
    shareRevokeSuccessMessage: labels.publisherShareRevokeSuccessMessage,
    shareEmptyMessage: labels.publisherShareEmptyMessage,
    shareLoadingLabel: labels.publisherShareLoadingLabel,
  };
}

const SLOT_API = {
  editor: {
    fetch: fetchDocumentEditors,
    grant: grantDocumentEditor,
    revoke: revokeDocumentEditor,
  },
  publisher: {
    fetch: fetchDocumentPublishers,
    grant: grantDocumentPublisher,
    revoke: revokeDocumentPublisher,
  },
} as const;

function grantableUsers(
  users: TeamUser[],
  sharedIds: Set<string>,
  slot: DocumentShareSlot,
): TeamUser[] {
  return users.filter((user) => {
    if (sharedIds.has(user.userId)) return false;
    if (slot === "publisher") {
      return user.role === "publisher" || user.role === "admin";
    }
    return true;
  });
}

export function DocumentShareField({
  documentId,
  labels,
  slot,
}: {
  documentId: string;
  labels: DocumentShareSlotLabels;
  slot: DocumentShareSlot;
}) {
  const resolved = resolveShareLabels(labels, slot);
  const api = SLOT_API[slot];
  const fieldId = `${slot}-share-user-${documentId}`;
  const { run, error, success, reset } = useCatalogSubmit();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [members, setMembers] = useState<DocumentEditor[]>([]);
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [userId, setUserId] = useState("");
  const [granting, setGranting] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoadError(null);
    const [rows, teamUsers] = await Promise.all([api.fetch(documentId), fetchTeamUsers()]);
    setMembers(rows);
    setUsers(teamUsers);
  }, [api, documentId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void reload()
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  function userLabel(id: string): string {
    const user = users.find((u) => u.userId === id);
    return user ? `${user.displayName} (${user.email})` : id;
  }

  async function handleGrant() {
    if (!userId) return;
    reset();
    await run(
      async () => {
        await api.grant(documentId, userId);
        setUserId("");
        await reload();
      },
      {
        successMessage: resolved.shareGrantSuccessMessage,
        onPendingChange: setGranting,
      },
    );
  }

  async function handleRevoke(memberUserId: string) {
    reset();
    await run(
      async () => {
        await api.revoke(documentId, memberUserId);
        await reload();
      },
      {
        successMessage: resolved.shareRevokeSuccessMessage,
        onPendingChange: (pending) => setRevokingId(pending ? memberUserId : null),
      },
    );
  }

  const displayError = mergeCatalogError(error, loadError);

  if (loading) {
    return <p className="text-sm text-muted-foreground">{resolved.shareLoadingLabel}</p>;
  }

  const sharedIds = new Set(members.map((member) => member.id));
  const selectableUsers = grantableUsers(users, sharedIds, slot);

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-4">
      <div>
        <p className="text-sm font-medium text-foreground">{resolved.shareTitle}</p>
        <p className="text-xs text-muted-foreground">{resolved.shareHint}</p>
      </div>

      {members.length === 0 ? (
        <p className="text-sm text-muted-foreground">{resolved.shareEmptyMessage}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {members.map((member) => (
            <li
              key={member.id}
              className="flex flex-wrap items-center justify-between gap-2 text-sm"
            >
              <span>{userLabel(member.id)}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={granting || revokingId !== null}
                onClick={() => void handleRevoke(member.id)}
              >
                {revokingId === member.id
                  ? resolved.shareRevokingLabel
                  : resolved.shareRevokeLabel}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={fieldId}>{resolved.shareUserLabel}</Label>
        <select
          id={fieldId}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
        >
          <option value="">Select team member…</option>
          {selectableUsers.map((user) => (
            <option key={user.userId} value={user.userId}>
              {user.displayName} ({user.email})
            </option>
          ))}
        </select>
      </div>

      <Button
        type="button"
        variant="secondary"
        disabled={!userId || granting || revokingId !== null}
        onClick={() => void handleGrant()}
      >
        {granting ? resolved.shareGrantingLabel : resolved.shareGrantLabel}
      </Button>

      {displayError ? (
        <Alert variant="destructive">
          <AlertDescription>{displayError}</AlertDescription>
        </Alert>
      ) : null}

      {success ? (
        <Alert>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
