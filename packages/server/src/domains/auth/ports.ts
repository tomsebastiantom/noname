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

export interface AuthService {
  login(input: LoginCredentials): Promise<LoginResult>;
}
