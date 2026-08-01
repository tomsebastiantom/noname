import { useStateValue } from "@json-render/react";
import { useState } from "react";
import type { TeamMemberRole, TeamUser } from "../../../auth/team-users";
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
import { Label } from "../../../components/ui/label";
import { ADMIN_STATE } from "../../../core/admin-state";
import type { ComponentCtx } from "../../../core/components/types";
import { mergeCatalogError, useCatalogSubmit } from "../../../core/use-catalog-submit";
import type { CatalogProps } from "../../../schemas/shared";
import { DataTable, type DataTableColumn } from "../shared/DataTable";

const ROLE_OPTIONS: TeamMemberRole[] = ["admin", "editor"];

type UsersAdminConfig = Record<string, never>;

type UsersAdminLabels = {
  title: string;
  description: string | null;
  loadingLabel: string;
  inviteSectionTitle: string;
  inviteSectionDescription: string;
  inviteLabel: string;
  invitingLabel: string;
  inviteSuccessMessage: string;
  roleUpdatedMessage: string;
  emptyTableMessage: string;
  emailColumnHeader: string;
  roleColumnHeader: string;
  mfaColumnHeader: string;
  statusColumnHeader: string;
  mfaEnabledLabel: string;
  mfaOffLabel: string;
};

export function UsersAdminForm({
  props,
}: ComponentCtx<CatalogProps<UsersAdminConfig, UsersAdminLabels>>) {
  const { labels } = props;
  const catalog = useCatalogSubmit();
  const { submit, pending, error, success, reset } = catalog;
  const users = (useStateValue(ADMIN_STATE.team.users) as TeamUser[] | undefined) ?? [];
  const loading = (useStateValue(ADMIN_STATE.team.loading) as boolean | undefined) ?? true;
  const loadError = useStateValue(ADMIN_STATE.team.error) as string | null | undefined;

  const [email, setEmail] = useState("");
  const [givenName, setGivenName] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [role, setRole] = useState<TeamMemberRole>("editor");

  async function handleInvite() {
    await submit({
      action: "inviteTeamUser",
      params: {
        email: email.trim(),
        givenName: givenName.trim() || undefined,
        familyName: familyName.trim() || undefined,
        role,
      },
      successMessage: labels.inviteSuccessMessage,
      onSuccess: () => {
        setEmail("");
        setGivenName("");
        setFamilyName("");
        setRole("editor");
      },
    });
  }

  async function handleRoleChange(userId: string, nextRole: TeamMemberRole) {
    reset();
    await submit({
      action: "updateTeamUserRole",
      params: { userId, role: nextRole },
      successMessage: labels.roleUpdatedMessage,
    });
  }

  const columns: DataTableColumn<TeamUser>[] = [
    {
      key: "email",
      header: labels.emailColumnHeader,
      cell: (row) => (
        <div>
          <p className="font-medium">{row.email}</p>
          {row.displayName !== row.email && (
            <p className="text-xs text-muted-foreground">{row.displayName}</p>
          )}
        </div>
      ),
    },
    {
      key: "role",
      header: labels.roleColumnHeader,
      cell: (row) => (
        <select
          className="rounded-md border border-input bg-background px-2 py-1 text-sm"
          value={row.role}
          onChange={(e) => void handleRoleChange(row.userId, e.target.value as TeamMemberRole)}
          onClick={(e) => e.stopPropagation()}
        >
          {ROLE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ),
    },
    {
      key: "mfa",
      header: labels.mfaColumnHeader,
      cell: (row) => (
        <Badge variant={row.mfaEnrolled ? "default" : "outline"}>
          {row.mfaEnrolled ? labels.mfaEnabledLabel : labels.mfaOffLabel}
        </Badge>
      ),
    },
    {
      key: "state",
      header: labels.statusColumnHeader,
      cell: (row) => (
        <span className="text-sm text-muted-foreground">
          {row.state.replace(/^USER_STATE_/, "").toLowerCase() || "active"}
        </span>
      ),
    },
  ];

  const displayError = mergeCatalogError(error, loadError);

  if (loading) {
    return <p className="text-muted-foreground">{labels.loadingLabel}</p>;
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{labels.title}</CardTitle>
          {labels.description && <CardDescription>{labels.description}</CardDescription>}
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            rows={users}
            rowKey={(row) => row.userId}
            emptyMessage={labels.emptyTableMessage}
          />
        </CardContent>
      </Card>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>{labels.inviteSectionTitle}</CardTitle>
          <CardDescription>{labels.inviteSectionDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleInvite();
            }}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="off"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="invite-given">First name</Label>
                <Input
                  id="invite-given"
                  value={givenName}
                  onChange={(e) => setGivenName(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="invite-family">Last name</Label>
                <Input
                  id="invite-family"
                  value={familyName}
                  onChange={(e) => setFamilyName(e.target.value)}
                  autoComplete="off"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-role">Role</Label>
              <select
                id="invite-role"
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={role}
                onChange={(e) => setRole(e.target.value as TeamMemberRole)}
              >
                {ROLE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? labels.invitingLabel : labels.inviteLabel}
            </Button>
          </form>
        </CardContent>
      </Card>

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
