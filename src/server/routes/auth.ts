import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import * as client from 'openid-client';
import {
  config,
  isAuthRequired,
  isBasicAuthConfigured,
  isOIDCConfigured,
  isFireflyOAuthConfigured,
  getAvailableAuthMethods,
} from '../config/index.js';
import {
  setAuthenticatedUser,
  clearAuthenticatedUser,
  getCurrentUser,
  getSessionId,
  getOrCreateCsrfToken,
  CSRF_TOKEN_HEADER,
  authRateLimit,
} from '../middleware/index.js';
import { clearSessionData } from '../services/index.js';
import { createLogger } from '../utils/logger.js';
import type {
  AuthStatus,
  AuthUser,
  AuthLoginResponse,
  OAuthProviderInfo,
} from '../../shared/types/auth.js';

const router = Router();
const logger = createLogger('Auth');

/**
 * Get the frontend URL for redirects.
 * In development, redirect to Vite dev server (first CORS origin).
 * In production, APP_URL serves both frontend and API.
 */
function getFrontendUrl(): string {
  if (config.nodeEnv === 'development' && config.corsOrigins.length > 0) {
    // Use first CORS origin (typically the Vite dev server)
    return config.corsOrigins[0];
  }
  return config.appUrl;
}

// Cache for OIDC configuration
let oidcConfig: client.Configuration | null = null;

/**
 * Initialize OIDC client configuration
 */
async function getOIDCConfig(): Promise<client.Configuration | null> {
  if (!isOIDCConfigured()) return null;

  if (oidcConfig) return oidcConfig;

  try {
    oidcConfig = await client.discovery(
      new URL(config.auth.oidc.issuerUrl),
      config.auth.oidc.clientId,
      config.auth.oidc.clientSecret
    );
    return oidcConfig;
  } catch (error) {
    logger.error('Failed to discover OIDC issuer:', error);
    return null;
  }
}

/**
 * Generate a random state parameter for OAuth flows
 */
function generateState(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Generate PKCE code verifier and challenge
 */
function generatePKCE(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

// ============================================
// Auth Status Endpoints
// ============================================

/**
 * Get authentication status
 * This endpoint is always accessible (no auth required)
 */
router.get('/status', (req: Request, res: Response) => {
  const user = getCurrentUser(req);
  const availableMethods = getAvailableAuthMethods();

  const response: AuthStatus = {
    authenticated: !!user,
    user,
    availableMethods,
    authRequired: isAuthRequired(),
  };

  res.json({ success: true, data: response });
});

/**
 * Get CSRF token for the client
 * Returns the token that must be included in the X-CSRF-Token header
 * for all state-changing requests (POST, PUT, DELETE, PATCH).
 *
 * The token is also set as a cookie by the csrfTokenCookie middleware,
 * but this endpoint provides an explicit way to retrieve it.
 */
router.get('/csrf-token', (req: Request, res: Response) => {
  const token = getOrCreateCsrfToken(req);

  res.json({
    success: true,
    data: {
      token,
      headerName: CSRF_TOKEN_HEADER,
    },
  });
});

/**
 * Get available OAuth providers for the login UI
 */
router.get('/providers', async (_req: Request, res: Response) => {
  const providers: OAuthProviderInfo[] = [];

  // OIDC Provider
  if (isOIDCConfigured()) {
    const oidc = await getOIDCConfig();
    if (oidc) {
      providers.push({
        method: 'oidc',
        name: 'Single Sign-On',
        authUrl: '/api/auth/oidc/login',
      });
    }
  }

  // Firefly OAuth Provider
  if (isFireflyOAuthConfigured()) {
    providers.push({
      method: 'firefly',
      name: 'Login with Firefly III',
      authUrl: '/api/auth/firefly/login',
    });
  }

  res.json({ success: true, data: providers });
});

// ============================================
// Basic Auth Endpoints
// ============================================

/**
 * Login with username/password (Basic Auth style)
 * Rate limited with progressive backoff on failures to prevent brute-force attacks.
 */
router.post('/basic/login', authRateLimit, (req: Request, res: Response) => {
  if (!isBasicAuthConfigured()) {
    res.status(400).json({
      success: false,
      error: 'Basic authentication is not configured',
    } satisfies AuthLoginResponse);
    return;
  }

  const { username, password } = req.body;

  if (!username || !password) {
    res.status(400).json({
      success: false,
      error: 'Username and password are required',
    } satisfies AuthLoginResponse);
    return;
  }

  // Validate credentials
  if (username === config.auth.basic.username && password === config.auth.basic.password) {
    const user: AuthUser = {
      id: 'basic-user',
      username: username,
      displayName: username,
      authMethod: 'basic',
    };

    setAuthenticatedUser(req, user);

    res.json({
      success: true,
      user,
    } satisfies AuthLoginResponse);
  } else {
    res.status(401).json({
      success: false,
      error: 'Invalid username or password',
    } satisfies AuthLoginResponse);
  }
});

// ============================================
// OIDC Endpoints
// ============================================

/**
 * Initiate OIDC login flow
 */
router.get('/oidc/login', async (req: Request, res: Response) => {
  const oidc = await getOIDCConfig();
  if (!oidc) {
    res.status(400).json({
      success: false,
      error: 'OIDC is not configured or unavailable',
    });
    return;
  }

  const state = generateState();
  const { codeVerifier, codeChallenge } = generatePKCE();

  // Store state and code verifier in session
  req.session.oauthState = state;
  req.session.codeVerifier = codeVerifier;

  const redirectUri = `${config.appUrl}/api/auth/oidc/callback`;

  const authUrl = client.buildAuthorizationUrl(oidc, {
    redirect_uri: redirectUri,
    scope: config.auth.oidc.scopes.join(' '),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  res.redirect(authUrl.href);
});

/**
 * OIDC callback handler
 */
router.get('/oidc/callback', async (req: Request, res: Response) => {
  const oidc = await getOIDCConfig();
  if (!oidc) {
    res.redirect(`${getFrontendUrl()}/?error=oidc_not_configured`);
    return;
  }

  const currentUrl = new URL(req.url, config.appUrl);

  // Verify state parameter
  const expectedState = req.session.oauthState;
  const codeVerifier = req.session.codeVerifier;

  if (!expectedState || !codeVerifier) {
    res.redirect(`${getFrontendUrl()}/login?error=invalid_session`);
    return;
  }

  try {
    // Exchange authorization code for tokens
    const tokens = await client.authorizationCodeGrant(oidc, currentUrl, {
      expectedState,
      pkceCodeVerifier: codeVerifier,
    });

    // Get user info
    const userInfo = await client.fetchUserInfo(
      oidc,
      tokens.access_token,
      tokens.claims()?.sub || ''
    );

    const user: AuthUser = {
      id: userInfo.sub,
      username: (userInfo.preferred_username as string) || userInfo.sub,
      email: userInfo.email as string | undefined,
      displayName:
        (userInfo.name as string) || (userInfo.preferred_username as string) || userInfo.sub,
      authMethod: 'oidc',
    };

    // Clean up session data
    delete req.session.oauthState;
    delete req.session.codeVerifier;

    // Set authenticated user
    setAuthenticatedUser(req, user);

    res.redirect(getFrontendUrl());
  } catch (error) {
    logger.error('OIDC callback error:', error);
    res.redirect(`${getFrontendUrl()}/login?error=authentication_failed`);
  }
});

// ============================================
// Firefly OAuth Endpoints
// ============================================

/**
 * Initiate Firefly III OAuth login flow
 */
router.get('/firefly/login', (req: Request, res: Response) => {
  if (!isFireflyOAuthConfigured()) {
    res.status(400).json({
      success: false,
      error: 'Firefly OAuth is not configured',
    });
    return;
  }

  const state = generateState();
  req.session.oauthState = state;

  logger.debug('Firefly OAuth login initiated:', {
    state,
    sessionId: req.sessionID,
    hasSession: Boolean(req.session),
  });

  const redirectUri = `${config.appUrl}/api/auth/firefly/callback`;

  // Build Firefly III OAuth authorization URL
  const authUrl = new URL('/oauth/authorize', config.firefly.apiUrl);
  authUrl.searchParams.set('client_id', config.auth.fireflyOAuth.clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', '');
  authUrl.searchParams.set('state', state);

  logger.debug('Redirecting to Firefly OAuth:', { authUrl: authUrl.href });
  res.redirect(authUrl.href);
});

/**
 * Firefly III OAuth callback handler
 */
router.get('/firefly/callback', async (req: Request, res: Response) => {
  if (!isFireflyOAuthConfigured()) {
    res.redirect(`${getFrontendUrl()}/login?error=firefly_oauth_not_configured`);
    return;
  }

  const { code, state, error } = req.query;

  if (error) {
    logger.error('Firefly OAuth error:', error);
    res.redirect(`${getFrontendUrl()}/login?error=${error}`);
    return;
  }

  // Verify state
  const expectedState = req.session.oauthState;
  logger.debug('Firefly OAuth callback state verification:', {
    receivedState: state,
    expectedState: expectedState || '(not set)',
    sessionId: req.sessionID,
    hasSession: Boolean(req.session),
  });
  if (!expectedState || state !== expectedState) {
    logger.warn(
      'Firefly OAuth state mismatch - possible causes: session not persisted, cookies blocked, or multiple browser tabs'
    );
    res.redirect(`${getFrontendUrl()}/login?error=invalid_state`);
    return;
  }

  const redirectUri = `${config.appUrl}/api/auth/firefly/callback`;
  const tokenUrl = `${config.firefly.apiUrl}/oauth/token`;

  try {
    // Build token request params
    // Support both confidential clients (with secret) and public clients (without)
    const tokenParams: Record<string, string> = {
      grant_type: 'authorization_code',
      client_id: config.auth.fireflyOAuth.clientId,
      redirect_uri: redirectUri,
      code: code as string,
    };

    // Only include client_secret if configured (for confidential clients)
    if (config.auth.fireflyOAuth.clientSecret) {
      tokenParams.client_secret = config.auth.fireflyOAuth.clientSecret;
    }

    // Debug logging
    logger.debug('Firefly OAuth token exchange:', {
      tokenUrl,
      clientId: config.auth.fireflyOAuth.clientId,
      redirectUri,
      hasSecret: Boolean(config.auth.fireflyOAuth.clientSecret),
      codeLength: (code as string)?.length,
    });

    // Exchange code for token
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(tokenParams),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      logger.error('Firefly token error:', errorText);
      logger.error('Token request details:', {
        tokenUrl,
        redirectUri,
        clientId: config.auth.fireflyOAuth.clientId,
      });
      res.redirect(`${getFrontendUrl()}/login?error=token_exchange_failed`);
      return;
    }

    const tokenData = (await tokenResponse.json()) as { access_token: string };
    const accessToken = tokenData.access_token;

    // Get user info from Firefly
    const userResponse = await fetch(`${config.firefly.apiUrl}/api/v1/about/user`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.api+json',
      },
    });

    if (!userResponse.ok) {
      res.redirect(`${getFrontendUrl()}/login?error=user_info_failed`);
      return;
    }

    interface FireflyUserResponse {
      data?: {
        id?: string;
        attributes?: {
          email?: string;
        };
      };
    }

    const userData = (await userResponse.json()) as FireflyUserResponse;
    const fireflyUser = userData.data?.attributes;

    const user: AuthUser = {
      id: userData.data?.id || 'firefly-user',
      username: fireflyUser?.email || 'firefly-user',
      email: fireflyUser?.email,
      displayName: fireflyUser?.email || 'Firefly III User',
      authMethod: 'firefly',
    };

    // Clean up session data
    delete req.session.oauthState;

    // Set authenticated user
    setAuthenticatedUser(req, user);

    res.redirect(getFrontendUrl());
  } catch (error) {
    logger.error('Firefly callback error:', error);
    res.redirect(`${getFrontendUrl()}/login?error=authentication_failed`);
  }
});

// ============================================
// Logout Endpoint
// ============================================

/**
 * Logout and clear session
 */
router.post('/logout', async (req: Request, res: Response) => {
  // Get session ID before destroying the session
  const sessionId = getSessionId(req);

  // Clear all in-memory session data (extenders, caches, etc.)
  try {
    await clearSessionData(sessionId);
  } catch (error) {
    logger.warn('Error clearing session data:', error);
  }

  // Destroy the Express session
  clearAuthenticatedUser(req, (err) => {
    if (err) {
      logger.error('Logout error:', err);
      res.status(500).json({
        success: false,
        error: 'Logout failed',
      });
      return;
    }

    res.json({ success: true });
  });
});

export default router;
