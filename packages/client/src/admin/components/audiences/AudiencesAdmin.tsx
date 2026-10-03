import { useActions, useStateValue } from "@json-render/react";
import { useEffect, useMemo, useState } from "react";
import { useAdminRouteAccess } from "../../../auth/admin-access";
import { Alert, AlertDescription } from "../../../components/ui/alert";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import type { CoreActionName } from "../../../core/actions";
import { ADMIN_STATE } from "../../../core/admin-state";
import type { ComponentCtx } from "../../../core/components/types";
import type { LayoutSummary } from "../../../documents/layout-entries";
import {
  audienceListViewState,
  buildAudienceCondition,
  buildAudienceExpiry,
  buildExperienceBinding,
  canActivateAudienceVersion,
  formatAttributionWindowDays,
  isRegisteredPredicate,
} from "../../audience-authoring";
import type {
  AudienceBindingPerformance,
  AudienceDefinition,
  AudienceDefinitionVersion,
  AudienceOperator,
  AudiencePerformanceSummary,
  ExperienceBinding,
  RegisteredActivityType,
} from "../../audiences";

type AudiencesLabels = {
  title: string;
  description: string | null;
  loadingLabel: string;
  emptyLabel: string;
  forbiddenLabel: string;
  createTitle: string;
  keyLabel: string;
  keyPlaceholder: string;
  createLabel: string;
  createPendingLabel: string;
  ruleTitle: string;
  activityLabel: string;
  fieldLabel: string;
  operatorLabel: string;
  valueLabel: string;
  valuePlaceholder: string;
  actionLabel: string;
  assignLabel: string;
  removeLabel: string;
  expiryDaysLabel: string;
  saveDraftLabel: string;
  savePendingLabel: string;
  validateLabel: string;
  activateLabel: string;
  archiveLabel: string;
  bindingsTitle: string;
  pageKeyLabel: string;
  localeLabel: string;
  layoutLabel: string;
  goalEventLabel: string;
  windowDaysLabel: string;
  addBindingLabel: string;
  observationalNotice: string;
  metricsTitle: string;
  servedLabel: string;
  renderedLabel: string;
  exposedAccountsLabel: string;
  outcomesLabel: string;
  outcomeRateLabel: string;
};

const OPERATORS: AudienceOperator[] = [
  "equals",
  "notEquals",
  "in",
  "gt",
  "gte",
  "lt",
  "lte",
  "exists",
];
const OPERATOR_LABELS: Record<AudienceOperator, string> = {
  equals: "equals",
  notEquals: "does not equal",
  in: "is one of",
  gt: "greater than",
  gte: "at least",
  lt: "less than",
  lte: "at most",
  exists: "is present",
};

function activityId(activity: RegisteredActivityType): string {
  return `${activity.type}@${activity.version}`;
}

function findActivity(
  types: RegisteredActivityType[],
  id: string,
): RegisteredActivityType | undefined {
  return types.find((activity) => activityId(activity) === id);
}

function aggregateRate(rate: number | null): string {
  return rate === null ? "Suppressed" : `${(rate * 100).toFixed(1)}%`;
}

function aggregateCount(
  count: number | null,
  minimumSampleSize: number,
  sampleStatus: AudienceBindingPerformance["sampleStatus"],
): string {
  if (count !== null) return count.toLocaleString();
  return sampleStatus === "insufficient_exposed_accounts"
    ? "Suppressed"
    : `<${minimumSampleSize} (suppressed)`;
}

export function AudiencesAdmin({ props }: Readonly<ComponentCtx<AudiencesLabels>>) {
  const labels = props;
  const canManage = useAdminRouteAccess("audiences");
  const canViewAnalytics = useAdminRouteAccess("analytics");
  const { execute } = useActions();
  const definitions =
    (useStateValue(ADMIN_STATE.audiences.definitions) as AudienceDefinition[] | undefined) ?? [];
  const activityTypes =
    (useStateValue(ADMIN_STATE.audiences.activityTypes) as RegisteredActivityType[] | undefined) ??
    [];
  const bindings =
    (useStateValue(ADMIN_STATE.audiences.bindings) as ExperienceBinding[] | undefined) ?? [];
  const layouts =
    (useStateValue(ADMIN_STATE.audiences.layouts) as LayoutSummary[] | undefined) ?? [];
  const performance = useStateValue(ADMIN_STATE.audiences.performance) as
    | AudiencePerformanceSummary
    | null
    | undefined;
  const loading = (useStateValue(ADMIN_STATE.audiences.loading) as boolean | undefined) ?? true;
  const loadError = useStateValue(ADMIN_STATE.audiences.error) as string | null | undefined;
  const validation = useStateValue(ADMIN_STATE.audiences.validation) as
    | { valid: boolean; audienceKey?: string; version?: number }
    | null
    | undefined;

  const [selectedKey, setSelectedKey] = useState("");
  const [newKey, setNewKey] = useState("");
  const [activityChoice, setActivityChoice] = useState("");
  const [field, setField] = useState("");
  const [operator, setOperator] = useState<AudienceOperator>("equals");
  const [conditionValue, setConditionValue] = useState("");
  const [ruleAction, setRuleAction] = useState<"assign" | "remove">("assign");
  const [expiryDays, setExpiryDays] = useState("30");
  const [pageKey, setPageKey] = useState("/");
  const [locale, setLocale] = useState("");
  const [layoutChoice, setLayoutChoice] = useState("");
  const [goalEvent, setGoalEvent] = useState("");
  const [attributionDays, setAttributionDays] = useState("30");
  const [pending, setPending] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const selectedDefinition = definitions.find((definition) => definition.key === selectedKey);
  const selectedActivity = findActivity(activityTypes, activityChoice);
  const activityFields = selectedActivity ? Object.keys(selectedActivity.fields).sort() : [];
  const selectedField = selectedActivity?.fields[field];
  const allowedOperators = useMemo(
    () => OPERATORS.filter((candidate) => selectedField?.operators.includes(candidate)),
    [selectedField],
  );
  const activeVersion = selectedDefinition?.activeVersion ?? null;
  const layoutVariant = layouts.find((layout) => `${layout.id}@${layout.segment}` === layoutChoice);
  const goalCandidates = activityTypes;
  const currentError = localError ?? loadError ?? null;

  useEffect(() => {
    if (!selectedKey) return;
    void execute({ action: "loadAudienceBindings", params: { audienceKey: selectedKey } });
  }, [execute, selectedKey]);

  useEffect(() => {
    const firstActivity = activityTypes[0];
    if (!activityChoice && firstActivity) setActivityChoice(activityId(firstActivity));
  }, [activityChoice, activityTypes]);

  useEffect(() => {
    if (selectedActivity && !selectedActivity.fields[field])
      setField(Object.keys(selectedActivity.fields).sort()[0] ?? "");
  }, [field, selectedActivity]);

  useEffect(() => {
    if (selectedField && !selectedField.operators.includes(operator))
      setOperator(selectedField.operators[0] ?? "equals");
  }, [operator, selectedField]);

  useEffect(() => {
    const firstLayout = layouts[0];
    if (!layoutChoice && firstLayout) setLayoutChoice(`${firstLayout.id}@${firstLayout.segment}`);
  }, [layoutChoice, layouts]);

  useEffect(() => {
    const firstGoal = goalCandidates[0];
    if (!goalEvent && firstGoal) setGoalEvent(firstGoal.type);
  }, [goalCandidates, goalEvent]);

  useEffect(() => {
    const activeBinding = bindings.find((binding) => binding.status === "active");
    if (selectedKey && activeBinding && canViewAnalytics === true) {
      void execute({ action: "loadAudiencePerformance", params: { audienceKey: selectedKey } });
    }
  }, [bindings, canViewAnalytics, execute, selectedKey]);

  async function runAction(
    action: CoreActionName,
    params?: Record<string, unknown>,
  ): Promise<boolean> {
    setPending(true);
    setLocalError(null);
    try {
      await execute(params ? { action, params } : { action });
      return true;
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      setPending(false);
    }
  }

  async function handleCreateAudience(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const key = newKey.trim();
    if (!/^[a-z][a-z0-9_-]{1,63}$/.test(key)) {
      setLocalError("Use a stable key: lowercase letters, numbers, underscore or hyphen.");
      return;
    }
    const created = await runAction("createAudience", { key });
    if (created) {
      setSelectedKey(key);
      setNewKey("");
    }
  }

  async function handleCreateVersion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (!selectedDefinition || !selectedActivity)
        throw new Error("Choose an audience and registered activity");
      const condition = buildAudienceCondition({
        activity: selectedActivity,
        field,
        operator,
        value: conditionValue,
      });
      const expiry = buildAudienceExpiry(Number(expiryDays));
      await runAction("createAudienceVersion", {
        audienceKey: selectedDefinition.key,
        activityType: selectedActivity.type,
        activityVersion: selectedActivity.version,
        condition,
        action: ruleAction,
        expiry,
      });
      setConditionValue("");
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleCreateBinding(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (!selectedDefinition || !layoutVariant)
        throw new Error("Choose a published experience variant");
      const input = buildExperienceBinding({
        pageKey,
        locale,
        schemaId: layoutVariant.id,
        variantId: layoutVariant.segment,
        goalEvent,
        attributionDays: Number(attributionDays),
        approvedGoalEvents: goalCandidates.map((activity) => activity.type),
      });
      await runAction("createAudienceBinding", { audienceKey: selectedDefinition.key, input });
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error));
    }
  }

  if (canManage === null)
    return <p className="text-sm text-muted-foreground">{labels.loadingLabel}</p>;
  if (canManage === false) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{labels.forbiddenLabel}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {currentError ? (
        <Alert variant="destructive">
          <AlertDescription>{currentError}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{labels.title}</CardTitle>
          {labels.description ? <CardDescription>{labels.description}</CardDescription> : null}
        </CardHeader>
        <CardContent className="space-y-5">
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(event) => void handleCreateAudience(event)}
          >
            <div className="min-w-56 flex-1 space-y-1">
              <label className="text-sm font-medium" htmlFor="audience-key">
                {labels.keyLabel}
              </label>
              <Input
                id="audience-key"
                value={newKey}
                placeholder={labels.keyPlaceholder}
                onChange={(event) => setNewKey(event.target.value)}
              />
            </div>
            <Button type="submit" disabled={pending || !newKey.trim()}>
              {pending ? labels.createPendingLabel : labels.createLabel}
            </Button>
          </form>

          {audienceListViewState(loading, definitions.length) === "loading" ? (
            <p className="text-sm text-muted-foreground">{labels.loadingLabel}</p>
          ) : audienceListViewState(loading, definitions.length) === "empty" ? (
            <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              {labels.emptyLabel}
            </p>
          ) : (
            <div className="space-y-3">
              <label className="block space-y-1 text-sm font-medium">
                <span>{labels.createTitle}</span>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={selectedKey}
                  onChange={(event) => setSelectedKey(event.target.value)}
                >
                  <option value="">Select an audience</option>
                  {definitions.map((definition) => (
                    <option key={definition.key} value={definition.key}>
                      {definition.key} · {definition.status}
                    </option>
                  ))}
                </select>
              </label>
              {selectedDefinition ? (
                <AudienceDefinitionPanel
                  labels={labels}
                  definition={selectedDefinition}
                  activityTypes={activityTypes}
                  bindings={bindings}
                  layouts={layouts}
                  activeVersion={activeVersion}
                  validation={validation?.audienceKey === selectedKey ? validation : null}
                  canViewAnalytics={canViewAnalytics === true}
                  performance={performance ?? null}
                  pending={pending}
                  activityChoice={activityChoice}
                  setActivityChoice={setActivityChoice}
                  selectedActivity={selectedActivity}
                  activityFields={activityFields}
                  field={field}
                  setField={setField}
                  operator={operator}
                  setOperator={setOperator}
                  allowedOperators={allowedOperators}
                  conditionValue={conditionValue}
                  setConditionValue={setConditionValue}
                  ruleAction={ruleAction}
                  setRuleAction={setRuleAction}
                  expiryDays={expiryDays}
                  setExpiryDays={setExpiryDays}
                  pageKey={pageKey}
                  setPageKey={setPageKey}
                  locale={locale}
                  setLocale={setLocale}
                  layoutChoice={layoutChoice}
                  setLayoutChoice={setLayoutChoice}
                  goalEvent={goalEvent}
                  setGoalEvent={setGoalEvent}
                  goalCandidates={goalCandidates}
                  attributionDays={attributionDays}
                  setAttributionDays={setAttributionDays}
                  layoutVariant={layoutVariant}
                  runAction={runAction}
                  onCreateVersion={handleCreateVersion}
                  onCreateBinding={handleCreateBinding}
                />
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

type DefinitionPanelProps = {
  labels: AudiencesLabels;
  definition: AudienceDefinition;
  activityTypes: RegisteredActivityType[];
  bindings: ExperienceBinding[];
  layouts: LayoutSummary[];
  activeVersion: number | null;
  validation: { valid: boolean; version?: number } | null;
  canViewAnalytics: boolean;
  performance: AudiencePerformanceSummary | null;
  pending: boolean;
  activityChoice: string;
  setActivityChoice: (value: string) => void;
  selectedActivity: RegisteredActivityType | undefined;
  activityFields: string[];
  field: string;
  setField: (value: string) => void;
  operator: AudienceOperator;
  setOperator: (value: AudienceOperator) => void;
  allowedOperators: AudienceOperator[];
  conditionValue: string;
  setConditionValue: (value: string) => void;
  ruleAction: "assign" | "remove";
  setRuleAction: (value: "assign" | "remove") => void;
  expiryDays: string;
  setExpiryDays: (value: string) => void;
  pageKey: string;
  setPageKey: (value: string) => void;
  locale: string;
  setLocale: (value: string) => void;
  layoutChoice: string;
  setLayoutChoice: (value: string) => void;
  goalEvent: string;
  setGoalEvent: (value: string) => void;
  goalCandidates: RegisteredActivityType[];
  attributionDays: string;
  setAttributionDays: (value: string) => void;
  layoutVariant: LayoutSummary | undefined;
  runAction: (action: CoreActionName, params?: Record<string, unknown>) => Promise<boolean>;
  onCreateVersion: (event: React.FormEvent<HTMLFormElement>) => void;
  onCreateBinding: (event: React.FormEvent<HTMLFormElement>) => void;
};

function AudienceDefinitionPanel(props: DefinitionPanelProps) {
  const { labels, definition, pending } = props;
  const drafts = [...(definition.versions ?? [])].sort((a, b) => b.version - a.version);
  const activeBinding = props.bindings.find((binding) => binding.status === "active");
  const selectedBindingLayout = props.layouts.find(
    (layout) => layout.id === props.layoutChoice.split("@")[0],
  );
  const showMetrics = props.canViewAnalytics && activeBinding && props.performance;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge variant={definition.status === "active" ? "default" : "secondary"}>
            {definition.status}
          </Badge>
          {props.activeVersion ? (
            <span className="text-sm text-muted-foreground">
              Active version {props.activeVersion}
            </span>
          ) : null}
        </div>
        {definition.status !== "archived" ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              if (
                window.confirm(
                  "Archive this audience? It will no longer be available for future experience selection.",
                )
              )
                void props.runAction("archiveAudience", { audienceKey: definition.key });
            }}
          >
            {labels.archiveLabel}
          </Button>
        ) : null}
      </div>

      {definition.status !== "archived" ? (
        <Card>
          <CardHeader>
            <CardTitle>{labels.ruleTitle}</CardTitle>
            <CardDescription>
              Use only registered activity types and fields. Validation checks the saved draft and
              never submits an activity or assigns a member.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 md:grid-cols-2" onSubmit={props.onCreateVersion}>
              <Field label={labels.activityLabel}>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={props.activityChoice}
                  onChange={(event) => props.setActivityChoice(event.target.value)}
                >
                  {props.activityTypes.map((activity) => (
                    <option key={activityId(activity)} value={activityId(activity)}>
                      {activity.type} · v{activity.version}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={labels.fieldLabel}>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={props.field}
                  onChange={(event) => props.setField(event.target.value)}
                >
                  {props.activityFields.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={labels.operatorLabel}>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={props.operator}
                  onChange={(event) => props.setOperator(event.target.value as AudienceOperator)}
                >
                  {props.allowedOperators.map((item) => (
                    <option key={item} value={item}>
                      {OPERATOR_LABELS[item]}
                    </option>
                  ))}
                </select>
              </Field>
              {props.operator !== "exists" ? (
                <Field label={labels.valueLabel}>
                  <Input
                    value={props.conditionValue}
                    placeholder={
                      props.operator === "in" ? "paid, refunded" : labels.valuePlaceholder
                    }
                    onChange={(event) => props.setConditionValue(event.target.value)}
                  />
                </Field>
              ) : null}
              <Field label={labels.actionLabel}>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={props.ruleAction}
                  onChange={(event) =>
                    props.setRuleAction(event.target.value as "assign" | "remove")
                  }
                >
                  <option value="assign">{labels.assignLabel}</option>
                  <option value="remove">{labels.removeLabel}</option>
                </select>
              </Field>
              <Field label={labels.expiryDaysLabel}>
                <Input
                  type="number"
                  min="1"
                  max="3650"
                  value={props.expiryDays}
                  onChange={(event) => props.setExpiryDays(event.target.value)}
                />
              </Field>
              <div className="md:col-span-2">
                <Button
                  type="submit"
                  disabled={
                    pending ||
                    !props.selectedActivity ||
                    !props.field ||
                    !isRegisteredPredicate(props.selectedActivity, props.field, props.operator)
                  }
                >
                  {pending ? labels.savePendingLabel : labels.saveDraftLabel}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{labels.title} versions</CardTitle>
        </CardHeader>
        <CardContent>
          {drafts.length ? (
            <ul className="divide-y rounded-md border">
              {drafts.map((version) => {
                const isValidated =
                  props.validation?.valid === true && props.validation.version === version.version;
                const isCurrent = version.version === props.activeVersion;
                return (
                  <li key={version.version} className="space-y-3 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-medium">Version {version.version}</span>{" "}
                        <Badge variant={version.status === "active" ? "default" : "secondary"}>
                          {version.status}
                        </Badge>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {version.activityType} v{version.activityVersion} · {version.action} ·{" "}
                          {conditionSummary(version.condition)}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {version.status === "draft" ? (
                          <Button
                            type="button"
                            variant="outline"
                            disabled={pending}
                            onClick={() =>
                              void props.runAction("validateAudienceVersion", {
                                audienceKey: definition.key,
                                version: version.version,
                              })
                            }
                          >
                            {labels.validateLabel}
                          </Button>
                        ) : null}
                        {canActivateAudienceVersion(version.status, isValidated) ? (
                          <Button
                            type="button"
                            disabled={pending}
                            onClick={() =>
                              void props.runAction("activateAudienceVersion", {
                                audienceKey: definition.key,
                                version: version.version,
                              })
                            }
                          >
                            {labels.activateLabel}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    {isCurrent ? (
                      <p className="text-xs text-muted-foreground">
                        Rule activation does not backfill prior activities.
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No rule versions yet. Create a draft using registered activity metadata.
            </p>
          )}
        </CardContent>
      </Card>

      {definition.status !== "archived" ? (
        <Card>
          <CardHeader>
            <CardTitle>{labels.bindingsTitle}</CardTitle>
            <CardDescription>
              Bindings select published finite layouts for a normalized page/route and optional
              locale. Membership never depends on these request fields.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form className="grid gap-4 md:grid-cols-2" onSubmit={props.onCreateBinding}>
              <Field label={labels.pageKeyLabel}>
                <Input
                  value={props.pageKey}
                  onChange={(event) => props.setPageKey(event.target.value)}
                  placeholder="/products"
                />
              </Field>
              <Field label={labels.localeLabel}>
                <Input
                  value={props.locale}
                  onChange={(event) => props.setLocale(event.target.value)}
                  placeholder="en-US (optional)"
                />
              </Field>
              <Field label={labels.layoutLabel}>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={props.layoutChoice}
                  onChange={(event) => props.setLayoutChoice(event.target.value)}
                >
                  {props.layouts.map((layout) => (
                    <option key={layout.id} value={`${layout.id}@${layout.segment}`}>
                      {layout.templateName} · {layout.segment}
                    </option>
                  ))}
                </select>
                {!props.layouts.length ? (
                  <span className="text-xs text-muted-foreground">
                    No published layout variants are available.
                  </span>
                ) : null}
              </Field>
              <Field label={labels.goalEventLabel}>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={props.goalEvent}
                  onChange={(event) => props.setGoalEvent(event.target.value)}
                >
                  {props.goalCandidates.map((activity) => (
                    <option key={activityId(activity)} value={activity.type}>
                      {activity.type} · v{activity.version}
                    </option>
                  ))}
                </select>
                {!props.goalCandidates.length ? (
                  <span className="text-xs text-muted-foreground">
                    No registered outcome events are available.
                  </span>
                ) : null}
              </Field>
              <Field label={labels.windowDaysLabel}>
                <Input
                  type="number"
                  min="1"
                  max="30"
                  step="any"
                  value={props.attributionDays}
                  onChange={(event) => props.setAttributionDays(event.target.value)}
                />
              </Field>
              <div className="md:col-span-2">
                <Button
                  type="submit"
                  disabled={pending || !props.layoutVariant || !props.goalEvent}
                >
                  {labels.addBindingLabel}
                </Button>
              </div>
            </form>
            {props.bindings.length ? (
              <ul className="divide-y rounded-md border">
                {[...props.bindings]
                  .sort((a, b) => b.version - a.version)
                  .map((binding) => (
                    <li
                      key={binding.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-4"
                    >
                      <div>
                        <p className="font-medium">
                          v{binding.version} · {binding.pageKey}
                          {binding.locale ? ` · ${binding.locale}` : " · all locales"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {binding.schemaId} / {binding.variantId} · goal: {binding.goalEvent} ·{" "}
                          {formatAttributionWindowDays(binding.attributionWindowDays)} days
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={binding.status === "active" ? "default" : "secondary"}>
                          {binding.status}
                        </Badge>
                        {binding.status === "draft" ? (
                          <Button
                            type="button"
                            disabled={pending}
                            onClick={() =>
                              void props.runAction("activateAudienceBinding", {
                                audienceKey: definition.key,
                                version: binding.version,
                              })
                            }
                          >
                            {labels.activateLabel}
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No experience bindings yet.</p>
            )}
            {selectedBindingLayout ? (
              <p className="text-xs text-muted-foreground">
                New binding target: {selectedBindingLayout.templateName} (
                {selectedBindingLayout.status}).
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {showMetrics ? (
        <Card>
          <CardHeader>
            <CardTitle>{labels.metricsTitle}</CardTitle>
            <CardDescription>{labels.observationalNotice}</CardDescription>
            <p className="text-xs text-muted-foreground">
              Results are withheld below {props.performance!.minimumSampleSize} distinct exposed
              accounts; outcome counts and rates also require at least{" "}
              {props.performance!.minimumSampleSize} distinct outcome accounts.
            </p>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {props.performance!.bindings.length ? (
              <table className="w-full min-w-[56rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Binding</th>
                    <th className="px-3 py-2 font-medium">{labels.servedLabel}</th>
                    <th className="px-3 py-2 font-medium">{labels.renderedLabel}</th>
                    <th className="px-3 py-2 font-medium">{labels.exposedAccountsLabel}</th>
                    <th className="px-3 py-2 font-medium">{labels.outcomesLabel}</th>
                    <th className="px-3 py-2 font-medium">{labels.outcomeRateLabel}</th>
                  </tr>
                </thead>
                <tbody>
                  {props.performance!.bindings.map((binding) => (
                    <tr
                      key={`${binding.bindingId}:${binding.bindingVersion}:${binding.audienceDefinitionVersion}`}
                      className="border-b last:border-0"
                    >
                      <th className="px-3 py-2 text-left font-medium">
                        {binding.bindingId} · v{binding.bindingVersion} · audience v
                        {binding.audienceDefinitionVersion ?? "unknown"}
                      </th>
                      <td className="px-3 py-2">
                        {aggregateCount(
                          binding.servedDecisionCount,
                          props.performance!.minimumSampleSize,
                          binding.sampleStatus,
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {aggregateCount(
                          binding.renderedDecisionCount,
                          props.performance!.minimumSampleSize,
                          binding.sampleStatus,
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {aggregateCount(
                          binding.exposedAccountCount,
                          props.performance!.minimumSampleSize,
                          binding.sampleStatus,
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {aggregateCount(
                          binding.outcomeAccountCount,
                          props.performance!.minimumSampleSize,
                          binding.sampleStatus,
                        )}
                      </td>
                      <td className="px-3 py-2">{aggregateRate(binding.outcomeRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-muted-foreground">
                No aggregate experience decisions are available in this window.
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: each Field wraps its native input or select child.
    <label className="space-y-1 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}

function conditionSummary(condition: AudienceDefinitionVersion["condition"]): string {
  if ("field" in condition)
    return `${condition.field} ${condition.operator}${condition.value === undefined ? "" : ` ${JSON.stringify(condition.value)}`}`;
  return `registered condition (${"all" in condition ? condition.all.length : condition.any.length} terms)`;
}
