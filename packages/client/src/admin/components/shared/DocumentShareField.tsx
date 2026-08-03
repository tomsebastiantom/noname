import { useCallback, useEffect, useState } from "react";
import {
  type DocumentEditor,
  fetchDocumentEditors,
  grantDocumentEditor,
  revokeDocumentEditor,
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

export function DocumentShareField({
  documentId,
  labels,
}: {
  documentId: string;
  labels: DocumentShareFieldLabels;
}) {
  const { run, error, success, reset } = useCatalogSubmit();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editors, setEditors] = useState<DocumentEditor[]>([]);
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [userId, setUserId] = useState("");
  const [granting, setGranting] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoadError(null);
    const [editorRows, teamUsers] = await Promise.all([
      fetchDocumentEditors(documentId),
      fetchTeamUsers(),
    ]);
    setEditors(editorRows);
    setUsers(teamUsers);
  }, [documentId]);

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
        await grantDocumentEditor(documentId, userId);
        await reload();
      },
      {
        successMessage: labels.shareGrantSuccessMessage,
        onPendingChange: setGranting,
      },
    );
  }

  async function handleRevoke(editorUserId: string) {
    reset();
    await run(
      async () => {
        await revokeDocumentEditor(documentId, editorUserId);
        await reload();
      },
      {
        successMessage: labels.shareRevokeSuccessMessage,
        onPendingChange: (pending) => setRevokingId(pending ? editorUserId : null),
      },
    );
  }

  const displayError = mergeCatalogError(error, loadError);

  if (loading) {
    return <p className="text-sm text-muted-foreground">{labels.shareLoadingLabel}</p>;
  }

  const sharedIds = new Set(editors.map((e) => e.id));
  const grantableUsers = users.filter((u) => !sharedIds.has(u.userId));

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-4">
      <div>
        <p className="text-sm font-medium text-foreground">{labels.shareTitle}</p>
        <p className="text-xs text-muted-foreground">{labels.shareHint}</p>
      </div>

      {editors.length === 0 ? (
        <p className="text-sm text-muted-foreground">{labels.shareEmptyMessage}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {editors.map((editor) => (
            <li
              key={editor.id}
              className="flex flex-wrap items-center justify-between gap-2 text-sm"
            >
              <span>{userLabel(editor.id)}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={granting || revokingId !== null}
                onClick={() => void handleRevoke(editor.id)}
              >
                {revokingId === editor.id ? labels.shareRevokingLabel : labels.shareRevokeLabel}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`share-user-${documentId}`}>{labels.shareUserLabel}</Label>
        <select
          id={`share-user-${documentId}`}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
        >
          <option value="">Select team member…</option>
          {grantableUsers.map((user) => (
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
        {granting ? labels.shareGrantingLabel : labels.shareGrantLabel}
      </Button>

      {displayError && (
        <Alert variant="destructive">
          <AlertDescription>{displayError}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
