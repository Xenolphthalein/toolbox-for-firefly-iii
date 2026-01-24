// Authentication types shared between client and server

/** Available authentication methods */
export type AuthMethod = 'none' | 'basic' | 'oidc' | 'firefly';

/** User information after successful authentication */
export interface AuthUser {
  id: string;
  username: string;
  email?: string;
  displayName?: string;
  authMethod: AuthMethod;
}

/** Authentication status response */
export interface AuthStatus {
  authenticated: boolean;
  user: AuthUser | null;
  /** Available auth methods configured on the server */
  availableMethods: AuthMethod[];
  /** Whether authentication is required (false = no auth configured) */
  authRequired: boolean;
}

/** Login request for basic auth */
export interface BasicAuthLoginRequest {
  username: string;
  password: string;
}

/** Login response */
export interface AuthLoginResponse {
  success: boolean;
  user?: AuthUser;
  error?: string;
}

/** OIDC/OAuth configuration exposed to frontend */
export interface OAuthProviderInfo {
  method: 'oidc' | 'firefly';
  name: string;
  authUrl: string;
}
