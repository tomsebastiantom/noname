import { useActions, useStateValue } from "@json-render/react";
import { useState } from "react";
import { useAdminRouteAccess } from "../../../auth/admin-access";
import { Alert, AlertDescription } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { ADMIN_STATE } from "../../../core/admin-state";
import type { ComponentCtx } from "../../../core/components/types";
import type { CatalogProps } from "../../../schemas/shared";
import type { ReplaySessionSummary } from "../../session-replay";
import { DataTable, type DataTableColumn } from "../shared/DataTable";
import { ReplayPlayer } from "./ReplayPlayer";

type SessionReplayConfig = Record<string, never>;

type SessionReplayLabels = {
  title: string;
  description: string | null;
  loadingLabel: string;
  empty: string;
  sessionColumnHeader: string;
  chunksColumnHeader: string;
  lastSeenColumnHeader: string;
  previewTitle: string;
  previewLoadingLabel: string;
  loadChunkLabel: string;
  playSessionLabel: string;
  playerLoadingLabel: string;
  forbiddenLabel: string;
  noChunksLabel: string;
};

export function SessionReplayAdmin({
  props,
}: ComponentCtx<CatalogProps<SessionReplayConfig, SessionReplayLabels>>) {
  const { labels } = props;
  const canViewReplay = useAdminRouteAccess("replay");
  const { execute } = useActions();
  const sessions =
    (useStateValue(ADMIN_STATE.replay.sessions) as ReplaySessionSummary[] | undefined) ?? [];
  const loading = (useStateValue(ADMIN_STATE.replay.loading) as boolean | undefined) ?? true;
  const loadError = useStateValue(ADMIN_STATE.replay.error) as string | null | undefined;
  const selectedSessionId = useStateValue(ADMIN_STATE.replay.selectedSessionId) as
    | string
    | null
    | undefined;
  const chunkPreview = useStateValue(ADMIN_STATE.replay.chunkPreview) as
    | { storageKey: string; eventCount: number }
    | null
    | undefined;
  const chunkLoading =
    (useStateValue(ADMIN_STATE.replay.chunkLoading) as boolean | undefined) ?? false;
  const playerEvents = useStateValue(ADMIN_STATE.replay.playerEvents) as
    | Record<string, unknown>[]
    | null
    | undefined;
  const playerLoading =
    (useStateValue(ADMIN_STATE.replay.playerLoading) as boolean | undefined) ?? false;

  const [selected, setSelected] = useState<ReplaySessionSummary | null>(null);

  const columns: DataTableColumn<ReplaySessionSummary>[] = [
    {
      key: "sessionId",
      header: labels.sessionColumnHeader,
      cell: (row) => <span className="font-mono text-xs">{row.sessionId}</span>,
    },
    {
      key: "chunks",
      header: labels.chunksColumnHeader,
      cell: (row) => row.chunkCount,
    },
    {
      key: "lastSeen",
      header: labels.lastSeenColumnHeader,
      cell: (row) => new Date(row.lastTimestamp).toLocaleString(),
    },
  ];

  async function handleSelectSession(row: ReplaySessionSummary) {
    setSelected(row);
    if (row.storageKeys.length === 0) return;
    await execute({
      action: "playReplaySession",
      params: { sessionId: row.sessionId, storageKeys: row.storageKeys },
    });
  }

  if (canViewReplay === null) {
    return <p className="text-sm text-muted-foreground">{labels.loadingLabel}</p>;
  }

  if (canViewReplay === false) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{labels.forbiddenLabel}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {loadError ? (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{labels.title}</CardTitle>
          {labels.description ? <CardDescription>{labels.description}</CardDescription> : null}
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">{labels.loadingLabel}</p>
          ) : (
            <DataTable
              columns={columns}
              rows={sessions}
              rowKey={(row) => row.sessionId}
              onRowClick={handleSelectSession}
              emptyMessage={labels.empty}
            />
          )}
        </CardContent>
      </Card>

      {selected ? (
        <Card>
          <CardHeader>
            <CardTitle>{labels.previewTitle}</CardTitle>
            <CardDescription className="font-mono text-xs">{selected.sessionId}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {selected.storageKeys.length === 0 ? (
              <p className="text-sm text-muted-foreground">{labels.noChunksLabel}</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={playerLoading && selectedSessionId === selected.sessionId}
                    onClick={() =>
                      void execute({
                        action: "playReplaySession",
                        params: {
                          sessionId: selected.sessionId,
                          storageKeys: selected.storageKeys,
                        },
                      })
                    }
                  >
                    {labels.playSessionLabel}
                  </Button>
                </div>
                <ul className="space-y-2 text-sm">
                  {selected.storageKeys.map((key) => (
                    <li key={key} className="flex flex-wrap items-center gap-2">
                      <code className="rounded bg-muted px-2 py-1 text-xs">{key}</code>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={chunkLoading && selectedSessionId === selected.sessionId}
                        onClick={() =>
                          void execute({
                            action: "loadReplayChunk",
                            params: { storageKey: key, sessionId: selected.sessionId },
                          })
                        }
                      >
                        {labels.loadChunkLabel}
                      </Button>
                    </li>
                  ))}
                </ul>
                {chunkLoading ? (
                  <p className="text-sm text-muted-foreground">{labels.previewLoadingLabel}</p>
                ) : null}
                {chunkPreview && selectedSessionId === selected.sessionId ? (
                  <p className="text-sm">
                    <span className="font-medium">{chunkPreview.eventCount}</span> rrweb events in{" "}
                    <code className="text-xs">{chunkPreview.storageKey}</code>
                  </p>
                ) : null}
                {playerLoading && selectedSessionId === selected.sessionId ? (
                  <p className="text-sm text-muted-foreground">{labels.playerLoadingLabel}</p>
                ) : null}
                {playerEvents &&
                playerEvents.length > 0 &&
                selectedSessionId === selected.sessionId ? (
                  <ReplayPlayer events={playerEvents} />
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
