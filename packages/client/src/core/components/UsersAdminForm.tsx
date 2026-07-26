import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
  fetchTeamUsers,
  inviteTeamUser,
  type TeamMemberRole,
  type TeamUser,
  updateTeamUserRole,
} from "../../auth/team-users";
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
import { DataTable, type DataTableColumn } from "./DataTable";
import type { ComponentCtx } from "./types";

const ROLE_OPTIONS: TeamMemberRole[] = ["admin", "editor"];

export function UsersAdminForm({
  props,
}: ComponentCtx<{
  title: string;
  description: string | null;
}>) {
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [givenName, setGivenName] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [role, setRole] = useState<TeamMemberRole>("editor");

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await fetchTeamUsers());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    setInviting(true);
    setError(null);
    setSuccess(null);
    try {
      await inviteTeamUser({
        email: email.trim(),
        givenName: givenName.trim() || undefined,
        familyName: familyName.trim() || undefined,
        role,
      });
      setEmail("");
      setGivenName("");
      setFamilyName("");
      setRole("editor");
      setSuccess("Invite sent — they will receive an email to set their password.");
      await loadUsers();
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
      await updateTeamUserRole(userId, nextRole);
      setUsers((prev) => prev.map((u) => (u.userId === userId ? { ...u, role: nextRole } : u)));
      setSuccess("Role updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const columns: DataTableColumn<TeamUser>[] = [
    {
      key: "email",
      header: "Email",
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
      header: "Role",
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
      header: "MFA",
      cell: (row) => (
        <Badge variant={row.mfaEnrolled ? "default" : "outline"}>
          {row.mfaEnrolled ? "Enabled" : "Off"}
        </Badge>
      ),
    },
    {
      key: "state",
      header: "Status",
      cell: (row) => (
        <span className="text-sm text-muted-foreground">
          {row.state.replace(/^USER_STATE_/, "").toLowerCase() || "active"}
        </span>
      ),
    },
  ];

  if (loading) {
    return <p className="text-muted-foreground">Loading team members…</p>;
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
            emptyMessage="No team members yet."
          />
        </CardContent>
      </Card>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Invite team member</CardTitle>
          <CardDescription>
            Creates a ZITADEL user in this org and emails them a link to set their password.
          </CardDescription>
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
              {inviting ? "Sending invite…" : "Send invite"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
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
