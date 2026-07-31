import { useActions, useStateValue } from "@json-render/react";
import { type ReactNode, useState } from "react";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { ADMIN_STATE } from "../../core/admin-state";
import type { ComponentCtx } from "../../core/components/types";
import type { FlagRow } from "../flags";

function flagValue(flag: FlagRow): unknown {
  const rule = flag.targeting.find((r) => r.priority === 0) ?? flag.targeting[0];
  return rule?.value ?? flag.defaultValue;
}

function flagListBody(
  loading: boolean,
  flags: FlagRow[],
  labels: { loadingLabel: string; emptyLabel: string },
  renderFlags: () => ReactNode,
): ReactNode {
  if (loading) {
    return <p className="text-sm text-muted-foreground">{labels.loadingLabel}</p>;
  }
  if (flags.length === 0) {
    return <p className="text-sm text-muted-foreground">{labels.emptyLabel}</p>;
  }
  return renderFlags();
}

function booleanToggleLabel(
  toggling: boolean,
  isOn: boolean,
  labels: { togglingLabel: string; onLabel: string; offLabel: string },
): string {
  if (toggling) return labels.togglingLabel;
  if (isOn) return `Turn ${labels.offLabel.toLowerCase()}`;
  return `Turn ${labels.onLabel.toLowerCase()}`;
}

export function FeatureFlagsAdmin({
  props,
}: ComponentCtx<{
  title: string;
  description: string | null;
  loadingLabel: string;
  emptyLabel: string;
  onLabel: string;
  offLabel: string;
  togglingLabel: string;
}>) {
  const { execute } = useActions();

  const flags = (useStateValue(ADMIN_STATE.flags.flags) as FlagRow[] | undefined) ?? [];
  const loading = (useStateValue(ADMIN_STATE.flags.loading) as boolean | undefined) ?? true;
  const loadError = useStateValue(ADMIN_STATE.flags.error) as string | null | undefined;
  const [toggling, setToggling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggleBoolean(flag: FlagRow) {
    if (flag.type !== "boolean") return;
    const next = flagValue(flag) !== true;
    setToggling(flag.id);
    setError(null);
    try {
      await execute({
        action: "toggleBooleanFlag",
        params: { flagId: flag.id, value: next },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setToggling(null);
    }
  }

  const displayError = error ?? loadError ?? null;

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>{props.title}</CardTitle>
        {props.description ? <CardDescription>{props.description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {displayError ? (
          <Alert variant="destructive">
            <AlertDescription>{displayError}</AlertDescription>
          </Alert>
        ) : null}
        {flagListBody(loading, flags, props, () => (
          <ul className="divide-y rounded-md border">
            {flags.map((flag) => {
              const value = flagValue(flag);
              const isOn = value === true;
              return (
                <li
                  key={flag.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm font-medium">{flag.key}</p>
                    {flag.description ? (
                      <p className="text-sm text-muted-foreground">{flag.description}</p>
                    ) : null}
                    <div className="mt-1 flex gap-2">
                      <Badge variant="outline">{flag.type}</Badge>
                      <Badge variant={isOn ? "default" : "secondary"}>
                        {isOn ? props.onLabel : props.offLabel}
                      </Badge>
                    </div>
                  </div>
                  {flag.type === "boolean" ? (
                    <Button
                      type="button"
                      variant={isOn ? "outline" : "default"}
                      disabled={toggling === flag.id}
                      onClick={() => void toggleBoolean(flag)}
                    >
                      {booleanToggleLabel(toggling === flag.id, isOn, props)}
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ))}
      </CardContent>
    </Card>
  );
}
