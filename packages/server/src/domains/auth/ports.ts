export interface LoginCredentials {
  orgId: string;
  email: string;
  password: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}

export interface LoginResult {
  accessToken: string;
  expiresIn: number;
}

export interface LoginResponse {
  accessToken?: string;
  expiresIn?: number;
  mfaRequired?: boolean;
  sessionId?: string;
  sessionToken?: string;
  authRequestId?: string;
}

export interface PasswordResetRequestInput {
  orgId: string;
  email: string;
}

export interface PasswordResetConfirmInput {
  orgId: string;
  userId: string;
  verificationCode: string;
  newPassword: string;
}

export interface RegisterInput {
  orgId: string;
  email: string;
  password: string;
  givenName?: string;
  familyName?: string;
}

export interface MfaVerifyInput {
  orgId: string;
  sessionId: string;
  sessionToken: string;
  authRequestId: string;
  totpCode: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}

export interface OAuthStartInput {
  orgId: string;
  provider: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
}

export interface OAuthCallbackInput {
  clientId: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
}

export interface AuthConfig {
  providers: string[];
  allowPassword: boolean;
  allowSignUp: boolean;
  allowPasswordReset: boolean;
  providerLabels: Record<string, string>;
  providerIcons: Record<string, string>;
}

export interface AuthConfigUpdate {
  providers?: string[];
  idpIds?: Record<string, string>;
  allowPassword?: boolean;
  allowSignUp?: boolean;
  allowPasswordReset?: boolean;
  googleOAuth?: {
    clientId: string;
    clientSecret: string;
  };
  githubOAuth?: {
    clientId: string;
    clientSecret: string;
  };
  appleOAuth?: {
    clientId: string;
    teamId: string;
    keyId: string;
    privateKey: string;
  };
}

export interface AuthService {
  login(input: LoginCredentials): Promise<LoginResponse>;
  verifyMfa(input: MfaVerifyInput): Promise<LoginResult>;
  requestPasswordReset(input: PasswordResetRequestInput): Promise<void>;
  confirmPasswordReset(input: PasswordResetConfirmInput): Promise<void>;
  register(input: RegisterInput): Promise<{ userId: string }>;
  getConfig(orgId: string): Promise<AuthConfig>;
  updateConfig(orgId: string, patch: AuthConfigUpdate): Promise<AuthConfig>;
  startIdpLogin(input: OAuthStartInput): Promise<{ authorizeUrl: string }>;
  exchangeOAuthCallback(input: OAuthCallbackInput): Promise<LoginResult>;
}
