import { useCallback, useEffect, useState } from "react";
import { type FlagRow, listFlags, updateBooleanFlag } from "../../admin/flags";
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
import type { ComponentCtx } from "./types";

function flagValue(flag: FlagRow): unknown {
  const rule = flag.targeting.find((r) => r.priority === 0) ?? flag.targeting[0];
  return rule?.value ?? flag.defaultValue;
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
  const [flags, setFlags] = useState<FlagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadFlags = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setFlags(await listFlags());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFlags();
  }, [loadFlags]);

  async function toggleBoolean(flag: FlagRow) {
    if (flag.type !== "boolean") return;
    const next = !flagValue(flag);
    setToggling(flag.id);
    setError(null);
    try {
      await updateBooleanFlag(flag, next === true);
      await loadFlags();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setToggling(null);
    }
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>{props.title}</CardTitle>
        {props.description ? <CardDescription>{props.description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {loading ? (
          <p className="text-sm text-muted-foreground">{props.loadingLabel}</p>
        ) : flags.length === 0 ? (
          <p className="text-sm text-muted-foreground">{props.emptyLabel}</p>
        ) : (
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
                      {toggling === flag.id
                        ? props.togglingLabel
                        : isOn
                          ? `Turn ${props.offLabel.toLowerCase()}`
                          : `Turn ${props.onLabel.toLowerCase()}`}
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
