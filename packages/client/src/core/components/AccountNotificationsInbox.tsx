import { isLoggedIn } from "../../auth/session";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import type { CatalogProps } from "../../schemas/shared";
import { useCatalogSubmit } from "../use-catalog-submit";
import { CommsInboxPanel, type CommsInboxPanelLabels } from "./CommsInboxPanel";
import { useMountAction } from "./MountAction";
import type { ComponentCtx } from "./types";

type AccountNotificationsLabels = CommsInboxPanelLabels & {
  forbiddenLabel: string;
};

export function AccountNotificationsInbox({
  props,
}: ComponentCtx<CatalogProps<Record<string, never>, AccountNotificationsLabels>>) {
  const { labels } = props;
  const loggedIn = isLoggedIn();
  const { executeAction, error, clearError } = useCatalogSubmit();

  useMountAction("loadCommsInbox", { unreadOnly: false });

  if (!loggedIn) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{labels.title}</CardTitle>
          {labels.description ? <CardDescription>{labels.description}</CardDescription> : null}
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{labels.forbiddenLabel}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <CommsInboxPanel
      labels={labels}
      enabled={loggedIn}
      executeAction={executeAction}
      error={error}
      clearError={clearError}
    />
  );
}
