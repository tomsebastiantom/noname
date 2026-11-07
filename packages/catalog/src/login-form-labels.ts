import { z } from "zod";

const viewChromeSchema = {
  title: z.string(),
  description: z.string().nullable(),
};

export const loginViewFieldsSchema = z.object({
  login: z.object({
    ...viewChromeSchema,
    fields: z.object({
      email: z.string(),
      password: z.string(),
      dividerWithSocial: z.string(),
      dividerEmailOnly: z.string(),
      forgotPasswordLink: z.string(),
      showPassword: z.string(),
      hidePassword: z.string(),
      submit: z.string(),
      submitting: z.string(),
      noAccountPrompt: z.string(),
      createAccountLink: z.string(),
    }),
  }),
  forgot: z.object({
    ...viewChromeSchema,
    fields: z.object({
      email: z.string(),
      submit: z.string(),
      submitting: z.string(),
      back: z.string(),
    }),
  }),
  reset: z.object({
    ...viewChromeSchema,
    fields: z.object({
      newPassword: z.string(),
      submit: z.string(),
      submitting: z.string(),
    }),
  }),
  signup: z.object({
    ...viewChromeSchema,
    fields: z.object({
      givenName: z.string(),
      familyName: z.string(),
      email: z.string(),
      password: z.string(),
      submit: z.string(),
      submitting: z.string(),
      back: z.string(),
    }),
  }),
  mfa: z.object({
    ...viewChromeSchema,
    fields: z.object({
      code: z.string(),
      submit: z.string(),
      submitting: z.string(),
      back: z.string(),
    }),
  }),
});

export const loginFormMessagesSchema = z.object({
  noSignInMethods: z.string(),
  passwordResetSent: z.string(),
  passwordUpdated: z.string(),
  invalidHost: z.string(),
});

/** Default copy for seed — spec is source of truth at runtime. */
export const DEFAULT_LOGIN_FORM_VIEWS = {
  login: {
    title: "Welcome back",
    description: "Sign in to continue",
    fields: {
      email: "Email",
      password: "Password",
      dividerWithSocial: "Or continue with email",
      dividerEmailOnly: "Continue with email",
      forgotPasswordLink: "Forgot password?",
      showPassword: "Show",
      hidePassword: "Hide",
      submit: "Sign in",
      submitting: "Signing in…",
      noAccountPrompt: "No account?",
      createAccountLink: "Create one",
    },
  },
  forgot: {
    title: "Forgot password",
    description: "Enter your email and we will send reset instructions.",
    fields: {
      email: "Email",
      submit: "Send reset link",
      submitting: "Sending…",
      back: "Back to sign in",
    },
  },
  reset: {
    title: "Set new password",
    description: "Choose a new password for your account.",
    fields: {
      newPassword: "New password",
      submit: "Update password",
      submitting: "Saving…",
    },
  },
  signup: {
    title: "Create account",
    description: "Register with email and password.",
    fields: {
      givenName: "First name",
      familyName: "Last name",
      email: "Email",
      password: "Password",
      submit: "Create account",
      submitting: "Creating account…",
      back: "Back to sign in",
    },
  },
  mfa: {
    title: "Verify your identity",
    description: "Enter the code from your authenticator app.",
    fields: {
      code: "Authentication code",
      submit: "Continue",
      submitting: "Verifying…",
      back: "Back to sign in",
    },
  },
} as const;

export const DEFAULT_LOGIN_FORM_MESSAGES = {
  noSignInMethods: "No sign-in methods are enabled for this store.",
  passwordResetSent: "If an account exists for that email, we sent reset instructions.",
  passwordUpdated: "Password updated. You can sign in now.",
  invalidHost: "Use {slug}.localhost:5173/login — e.g. yogastore.localhost:5173/login",
} as const;

export type LoginViewFields = z.infer<typeof loginViewFieldsSchema>;
