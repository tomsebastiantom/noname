/**
 * Demo team users for permission + team scope UI testing.
 * Creates ZITADEL users, assigns roles, wires Keto store vs team scope.
 */
import { randomBytes } from "node:crypto";
import type { StaffRole } from "@noname/auth";
import { loginWithCredentials } from "../../packages/server/src/domains/auth/adapters/zitadel/client";
import { upsertUserTeamRole } from "../../packages/server/src/domains/auth/adapters/zitadel/authorizations";
import { findUserIdByEmail, registerHumanUser } from "../../packages/server/src/domains/auth/adapters/zitadel/users";
import { seedMarketingScopeDemo, seedOrgEditorAccess, subFromAccessToken } from "./keto-tuples";

export { subFromAccessToken };

export interface DemoTeamUserSpec {
  email: string;
  password: string;
  givenName: string;
  familyName: string;
  role: StaffRole;
  /** Human-readable note for seed output */
  access: string;
}

export function demoTeamUserSpecs(): DemoTeamUserSpec[] {
  return [
    {
      email: process.env.ZITADEL_DEMO_EDITOR_EMAIL?.trim() ?? "editor@zitadel.localhost",
      password: process.env.ZITADEL_DEMO_EDITOR_PASSWORD?.trim() ?? "NonameEditor1!",
      givenName: "Demo",
      familyName: "Editor",
      role: "editor",
      access: "Store-wide editor (Keto Store#editors)",
    },
    {
      email: process.env.ZITADEL_DEMO_MARKETING_EMAIL?.trim() ?? "marketing@zitadel.localhost",
      password: process.env.ZITADEL_DEMO_MARKETING_PASSWORD?.trim() ?? "NonameMarketing1!",
      givenName: "Demo",
      familyName: "Marketing",
      role: "editor",
      access: 'Marketing folder only — home layout in "marketing" folder',
    },
    {
      email: process.env.ZITADEL_DEMO_PUBLISHER_EMAIL?.trim() ?? "publisher@zitadel.localhost",
      password: process.env.ZITADEL_DEMO_PUBLISHER_PASSWORD?.trim() ?? "NonamePublisher1!",
      givenName: "Demo",
      familyName: "Publisher",
      role: "publisher",
      access: "Publish marketing-folder docs (Team#publishers + folder bind)",
    },
    {
      email: process.env.ZITADEL_DEMO_ACCESS_MANAGER_EMAIL?.trim() ?? "access@zitadel.localhost",
      password: process.env.ZITADEL_DEMO_ACCESS_MANAGER_PASSWORD?.trim() ?? "NonameAccess1!",
      givenName: "Carol",
      familyName: "Access",
      role: "access_manager",
      access: "Folders, teams, bindings, invite (all staff except admin)",
    },
    {
      email: process.env.ZITADEL_DEMO_ANALYST_EMAIL?.trim() ?? "analyst@zitadel.localhost",
      password: process.env.ZITADEL_DEMO_ANALYST_PASSWORD?.trim() ?? "NonameAnalyst1!",
      givenName: "Eve",
      familyName: "Analyst",
      role: "analyst",
      access: "Analytics only (org-wide, no Keto doc scope)",
    },
    {
      email: process.env.ZITADEL_DEMO_REPLAY_EMAIL?.trim() ?? "replay@zitadel.localhost",
      password: process.env.ZITADEL_DEMO_REPLAY_PASSWORD?.trim() ?? "NonameReplay1!",
      givenName: "Frank",
      familyName: "Replay",
      role: "replay_viewer",
      access: "Session replay only (session:replay)",
    },
    {
      email: process.env.ZITADEL_DEMO_FLAGS_EMAIL?.trim() ?? "flags@zitadel.localhost",
      password: process.env.ZITADEL_DEMO_FLAGS_PASSWORD?.trim() ?? "NonameFlags1!",
      givenName: "Grace",
      familyName: "Flags",
      role: "flags_manager",
      access: "Feature flags only",
    },
    {
      email: process.env.ZITADEL_DEMO_TRACE_EMAIL?.trim() ?? "trace@zitadel.localhost",
      password: process.env.ZITADEL_DEMO_TRACE_PASSWORD?.trim() ?? "NonameTrace1!",
      givenName: "Henry",
      familyName: "Trace",
      role: "trace_viewer",
      access: "Distributed traces only (traces:view)",
    },
  ];
}

async function ensureDemoTeamUser(
  orgId: string,
  projectId: string,
  spec: DemoTeamUserSpec,
): Promise<void> {
  let userId = await findUserIdByEmail(orgId, spec.email);
  if (!userId) {
    const created = await registerHumanUser(orgId, {
      email: spec.email,
      password: spec.password,
      givenName: spec.givenName,
      familyName: spec.familyName,
    });
    userId = created.userId;
    console.log(`Created demo user ${spec.email}`);
  } else {
    console.log(`Demo user ${spec.email} already exists`);
  }
  await upsertUserTeamRole(orgId, projectId, userId, spec.role);
  console.log(`Assigned ${spec.role} role to ${spec.email}`);
}

async function loginDemoSub(orgId: string, email: string, password: string): Promise<string | null> {
  const clientId = process.env.ZITADEL_CLIENT_ID?.trim();
  if (!clientId) return null;

  const redirectUri =
    process.env.ZITADEL_REDIRECT_URI?.trim() ?? "http://localhost:5173/auth/callback";

  try {
    const result = await loginWithCredentials({
      orgId,
      email,
      password,
      clientId,
      redirectUri,
      codeVerifier: randomBytes(32).toString("base64url"),
    });
    if (result.status !== "success") {
      console.warn(`Could not log in as ${email} (${result.status})`);
      return null;
    }
    return subFromAccessToken(result.accessToken);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`Could not log in as ${email}: ${message}`);
    return null;
  }
}

/** Create demo team users + Keto scope (store editors vs marketing team). */
export async function seedDemoTeamAndScope(options: {
  orgId: string;
  adminSub: string;
  storeSlug: string;
  orgHeaders: () => Record<string, string>;
}): Promise<void> {
  const projectId = process.env.ZITADEL_PROJECT_ID?.trim();
  if (!projectId) {
    console.warn("ZITADEL_PROJECT_ID not set — skip demo team users (run pnpm init:zitadel)");
    return;
  }

  const specs = demoTeamUserSpecs();
  for (const spec of specs) {
    await ensureDemoTeamUser(options.orgId, projectId, spec);
  }

  const editorSpec = specs[0]!;
  const marketingSpec = specs[1]!;
  const publisherSpec = specs[2]!;

  const editorSub = await loginDemoSub(options.orgId, editorSpec.email, editorSpec.password);
  const marketingSubOverride = process.env.DEMO_SCOPE_EDITOR_SUB?.trim();
  const marketingSub =
    marketingSubOverride ??
    (await loginDemoSub(options.orgId, marketingSpec.email, marketingSpec.password));
  const publisherSub = await loginDemoSub(
    options.orgId,
    publisherSpec.email,
    publisherSpec.password,
  );

  const storeEditorSubs = [options.adminSub, editorSub].filter((sub): sub is string => Boolean(sub));

  await seedOrgEditorAccess({
    orgId: options.orgId,
    editorSubs: storeEditorSubs,
    orgHeaders: options.orgHeaders,
  });

  if (marketingSub) {
    await seedMarketingScopeDemo({
      storeSlug: options.storeSlug,
      editorSub: marketingSub,
      publisherSub: publisherSub ?? undefined,
      orgHeaders: options.orgHeaders,
    });
  } else {
    console.warn("Marketing team scope skipped — could not resolve marketing user sub");
  }

  const adminEmail = process.env.ZITADEL_DEMO_ADMIN_EMAIL?.trim() ?? "admin@zitadel.localhost";
  console.log("\nDemo logins (yogastore.localhost:5173):");
  console.log(`  admin@…      ${adminEmail} — store admin`);
  for (const spec of specs) {
    console.log(`  ${spec.email.split("@")[0]}@…  ${spec.email} / ${spec.password} — ${spec.access}`);
  }
  console.log("  Test: marketing → edit home with ?edit=true; publisher → publish; replay → /admin/settings/replay");
}
