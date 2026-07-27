import { useActions, useStateValue } from "@json-render/react";
import { type FormEvent, useEffect, useState } from "react";
import type { TeamMemberRole, TeamUser } from "../../auth/team-users";
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
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { ADMIN_STATE } from "../admin-state";
import { DataTable, type DataTableColumn } from "./DataTable";
import type { ComponentCtx } from "./types";

const ROLE_OPTIONS: TeamMemberRole[] = ["admin", "editor"];

export function UsersAdminForm({
  props,
}: ComponentCtx<{
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
}>) {
  const { execute } = useActions();
  const users = (useStateValue(ADMIN_STATE.team.users) as TeamUser[] | undefined) ?? [];
  const loading = (useStateValue(ADMIN_STATE.team.loading) as boolean | undefined) ?? true;
  const loadError = useStateValue(ADMIN_STATE.team.error) as string | null | undefined;

  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [givenName, setGivenName] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [role, setRole] = useState<TeamMemberRole>("editor");

  useEffect(() => {
    void execute({ action: "listTeamUsers" });
  }, [execute]);

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    setInviting(true);
    setError(null);
    setSuccess(null);
    try {
      await execute({
        action: "inviteTeamUser",
        params: {
          email: email.trim(),
          givenName: givenName.trim() || undefined,
          familyName: familyName.trim() || undefined,
          role,
        },
      });
      setEmail("");
      setGivenName("");
      setFamilyName("");
      setRole("editor");
      setSuccess(props.inviteSuccessMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setInviting(false);
    }
  }

  async function handleRoleChange(userId: string, nextRole: TeamMemberRole) {
    setError(null);
    setSuccess(null);
    try {
      await execute({ action: "updateTeamUserRole", params: { userId, role: nextRole } });
      setSuccess(props.roleUpdatedMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const columns: DataTableColumn<TeamUser>[] = [
    {
      key: "email",
      header: props.emailColumnHeader,
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
      header: props.roleColumnHeader,
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
      header: props.mfaColumnHeader,
      cell: (row) => (
        <Badge variant={row.mfaEnrolled ? "default" : "outline"}>
          {row.mfaEnrolled ? props.mfaEnabledLabel : props.mfaOffLabel}
        </Badge>
      ),
    },
    {
      key: "state",
      header: props.statusColumnHeader,
      cell: (row) => (
        <span className="text-sm text-muted-foreground">
          {row.state.replace(/^USER_STATE_/, "").toLowerCase() || "active"}
        </span>
      ),
    },
  ];

  const displayError = error ?? loadError ?? null;

  if (loading) {
    return <p className="text-muted-foreground">{props.loadingLabel}</p>;
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{props.title}</CardTitle>
          {props.description && <CardDescription>{props.description}</CardDescription>}
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            rows={users}
            rowKey={(row) => row.userId}
            emptyMessage={props.emptyTableMessage}
          />
        </CardContent>
      </Card>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>{props.inviteSectionTitle}</CardTitle>
          <CardDescription>{props.inviteSectionDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void handleInvite(e)} className="flex flex-col gap-4">
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
            <Button type="submit" disabled={inviting}>
              {inviting ? props.invitingLabel : props.inviteLabel}
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
