import { useStateValue } from "@json-render/react";
import { useState } from "react";
import type { CommsInboxItem } from "../../auth/notifications-settings";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import type { CoreActionName } from "../actions";
import { ADMIN_STATE } from "../admin-state";
import { useCommsInboxStream } from "../hooks/useCommsInboxStream";
import { mergeCatalogError } from "../use-catalog-submit";

export type CommsInboxPanelLabels = {
  title: string;
  description: string | null;
  loadingLabel: string;
  emptyLabel: string;
  refreshLabel: string;
  unreadOnlyLabel: string;
  allLabel: string;
  markReadLabel: string;
  columns: {
    when: string;
    title: string;
    trigger: string;
    status: string;
    actions: string;
  };
};

type InboxStatePaths = {
  loaded: string;
  loading: string;
  error: string;
};

type CommsInboxPanelProps = {
  labels: CommsInboxPanelLabels;
  enabled: boolean;
  executeAction: (name: CoreActionName, params: Record<string, unknown>) => void;
  error: string | null;
  clearError: () => void;
  statePaths?: InboxStatePaths;
  loadAction?: "loadCommsInbox" | "loadAccountInbox";
  markReadAction?: "markCommsInboxRead" | "markAccountInboxRead";
};

const ADMIN_INBOX_STATE = ADMIN_STATE.integrations.commsInbox;

function formatWhen(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function CommsInboxPanel({
  labels,
  enabled,
  executeAction,
  error,
  clearError,
  statePaths = ADMIN_INBOX_STATE,
  loadAction = "loadCommsInbox",
  markReadAction = "markCommsInboxRead",
}: CommsInboxPanelProps) {
  const [unreadOnly, setUnreadOnly] = useState(false);

  const rows = useStateValue(statePaths.loaded) as CommsInboxItem[] | null | undefined;
  const loading = (useStateValue(statePaths.loading) as boolean | undefined) ?? true;
  const loadError = useStateValue(statePaths.error) as string | null | undefined;

  useCommsInboxStream(() => {
    void executeAction(loadAction, { unreadOnly });
  }, enabled);

  const displayError = mergeCatalogError(error, loadError);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{labels.title}</CardTitle>
        {labels.description ? <CardDescription>{labels.description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {displayError ? (
          <Alert variant="destructive">
            <AlertDescription>{displayError}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={unreadOnly ? "default" : "outline"}
            size="sm"
            onClick={() => {
              clearError();
              setUnreadOnly(true);
              void executeAction(loadAction, { unreadOnly: true });
            }}
          >
            {labels.unreadOnlyLabel}
          </Button>
          <Button
            type="button"
            variant={!unreadOnly ? "default" : "outline"}
            size="sm"
            onClick={() => {
              clearError();
              setUnreadOnly(false);
              void executeAction(loadAction, { unreadOnly: false });
            }}
          >
            {labels.allLabel}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => {
              clearError();
              void executeAction(loadAction, { unreadOnly });
            }}
          >
            {labels.refreshLabel}
          </Button>
        </div>

        {loading && !rows ? (
          <p className="text-sm text-muted-foreground">{labels.loadingLabel}</p>
        ) : null}

        {!loading && (rows?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">{labels.emptyLabel}</p>
        ) : null}

        {(rows?.length ?? 0) > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4">{labels.columns.when}</th>
                  <th className="py-2 pr-4">{labels.columns.title}</th>
                  <th className="py-2 pr-4">{labels.columns.trigger}</th>
                  <th className="py-2 pr-4">{labels.columns.status}</th>
                  <th className="py-2">{labels.columns.actions}</th>
                </tr>
              </thead>
              <tbody>
                {rows?.map((row) => (
                  <tr key={row.id} className="border-b align-top">
                    <td className="py-2 pr-4 whitespace-nowrap">{formatWhen(row.createdAt)}</td>
                    <td className="py-2 pr-4">
                      <div className="font-medium">{row.title}</div>
                      <div className="text-muted-foreground">{row.body}</div>
                    </td>
                    <td className="py-2 pr-4">{row.trigger ?? "—"}</td>
                    <td className="py-2 pr-4">{row.readAt ? "read" : "unread"}</td>
                    <td className="py-2">
                      {!row.readAt ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            clearError();
                            void executeAction(markReadAction, { itemId: row.id });
                          }}
                        >
                          {labels.markReadLabel}
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
