import { z } from "zod";

export const loginBodySchema = z.object({
  email: z.email(),
  password: z.string().min(1),
  codeVerifier: z.string().min(43).max(128),
  clientId: z.string().min(1),
  redirectUri: z.url(),
});

export const oauthStartQuerySchema = z.object({
  clientId: z.string().min(1),
  redirectUri: z.url(),
  codeChallenge: z.string().min(43).max(128),
});

export const oauthCallbackBodySchema = z.object({
  code: z.string().min(1),
  codeVerifier: z.string().min(43).max(128),
  clientId: z.string().min(1),
  redirectUri: z.url(),
});

export const authConfigUpdateSchema = z.object({
  providers: z.array(z.enum(["google", "github", "apple"])).optional(),
  idpIds: z.record(z.string(), z.string()).optional(),
  allowPassword: z.boolean().optional(),
  allowSignUp: z.boolean().optional(),
  allowPasswordReset: z.boolean().optional(),
  requireMfaForAdmin: z.boolean().optional(),
  googleOAuth: z
    .object({
      clientId: z.string().min(1),
      clientSecret: z.string().min(1),
    })
    .optional(),
  githubOAuth: z
    .object({
      clientId: z.string().min(1),
      clientSecret: z.string().min(1),
    })
    .optional(),
  appleOAuth: z
    .object({
      clientId: z.string().min(1),
      teamId: z.string().min(1),
      keyId: z.string().min(1),
      privateKey: z.string().min(1),
    })
    .optional(),
});

export const passwordResetRequestSchema = z.object({
  email: z.email(),
});

export const passwordResetConfirmSchema = z.object({
  userId: z.string().min(1),
  verificationCode: z.string().min(1),
  newPassword: z.string().min(8),
});

export const registerBodySchema = z.object({
  email: z.email(),
  password: z.string().min(8),
  givenName: z.string().min(1).optional(),
  familyName: z.string().min(1).optional(),
});

export const mfaVerifyBodySchema = z.object({
  sessionId: z.string().min(1),
  sessionToken: z.string().min(1),
  authRequestId: z.string().min(1),
  totpCode: z.string().min(1),
  codeVerifier: z.string().min(43).max(128),
  clientId: z.string().min(1),
  redirectUri: z.url(),
});

export const mfaEnrollmentConfirmSchema = z.object({
  code: z.string().min(1),
});

export const scopeCatalogSchema = z.object({
  slug: z.string().min(1),
  label: z.string().min(1).optional(),
});

export const staffRoleSchema = z.enum([
  "admin",
  "access_manager",
  "publisher",
  "editor",
  "analyst",
  "replay_viewer",
  "flags_manager",
]);

export const staffInviteSchema = z.object({
  email: z.email(),
  givenName: z.string().min(1).optional(),
  familyName: z.string().min(1).optional(),
  role: staffRoleSchema.default("editor"),
});

/** @deprecated use staffInviteSchema */
export const teamInviteSchema = staffInviteSchema;

export const teamRoleUpdateSchema = z.object({
  role: staffRoleSchema,
});
