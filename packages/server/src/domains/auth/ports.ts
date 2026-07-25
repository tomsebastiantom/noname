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
}

export interface AuthConfigUpdate {
  providers?: string[];
  idpIds?: Record<string, string>;
  allowPassword?: boolean;
}

export interface AuthService {
  login(input: LoginCredentials): Promise<LoginResult>;
  getConfig(orgId: string): Promise<AuthConfig>;
  updateConfig(orgId: string, patch: AuthConfigUpdate): Promise<AuthConfig>;
  startIdpLogin(input: OAuthStartInput): Promise<{ authorizeUrl: string }>;
  exchangeOAuthCallback(input: OAuthCallbackInput): Promise<LoginResult>;
}
