import { useAdminRouteAccess } from "../../../auth/admin-access";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import type { CommsInboxPanelLabels } from "../../../core/components/CommsInboxPanel";
import { CommsInboxPanel } from "../../../core/components/CommsInboxPanel";
import { useMountAction } from "../../../core/components/MountAction";
import type { ComponentCtx } from "../../../core/components/types";
import { useCatalogSubmit } from "../../../core/use-catalog-submit";
import type { CatalogProps } from "../../../schemas/shared";

type CommsInboxLabels = CommsInboxPanelLabels & {
  forbiddenLabel: string;
};

export function CommsInboxAdmin({
  props,
}: ComponentCtx<CatalogProps<Record<string, never>, CommsInboxLabels>>) {
  const { labels } = props;
  const canAccess = useAdminRouteAccess("integrations");
  const { executeAction, error, clearError } = useCatalogSubmit();

  useMountAction("loadCommsInbox", { unreadOnly: false });

  if (canAccess === false) {
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

  if (canAccess === null) {
    return <p className="text-sm text-muted-foreground">{labels.loadingLabel}</p>;
  }

  return (
    <CommsInboxPanel
      labels={labels}
      enabled={canAccess === true}
      executeAction={executeAction}
      error={error}
      clearError={clearError}
    />
  );
}
