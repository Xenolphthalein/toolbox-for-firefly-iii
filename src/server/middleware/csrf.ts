import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { config, isAuthRequired } from '../config/index.js';
import { shouldUseSecureCookies } from './security.js';

// Extend Express Session with CSRF token
declare module 'express-session' {
  interface SessionData {
    /** CSRF token for request validation */
    csrfToken?: string;
  }
}

/** Header name for CSRF token */
export const CSRF_TOKEN_HEADER = 'x-csrf-token';

/** Cookie name for CSRF token (double-submit pattern) */
export const CSRF_COOKIE_NAME = 'firefly_toolbox_csrf';

/**
 * Generate a cryptographically secure CSRF token.
 */
function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Get or create CSRF token for the session.
 * Token is stored in the session and returned for use by the client.
 */
export function getOrCreateCsrfToken(req: Request): string {
  if (!req.session.csrfToken) {
    req.session.csrfToken = generateCsrfToken();
  }
  return req.session.csrfToken;
}

/**
 * Validate Origin/Referer header against allowed origins.
 * Returns true if the origin is allowed, false otherwise.
 */
function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return false;

  // Normalize origin (remove trailing slashes)
  const normalizedOrigin = origin.trim().replace(/\/+$/, '');

  // Check against configured CORS origins
  return config.corsOrigins.some((allowed) => {
    const normalizedAllowed = allowed.trim().replace(/\/+$/, '');
    return normalizedOrigin === normalizedAllowed;
  });
}

/**
 * Extract origin from Referer header if Origin is not present.
 * Browsers may send Referer but not Origin in some cases.
 */
function extractOriginFromReferer(referer: string | undefined): string | undefined {
  if (!referer) return undefined;

  try {
    const url = new URL(referer);
    return `${url.protocol}//${url.host}`;
  } catch {
    return undefined;
  }
}

/**
 * CSRF protection middleware.
 *
 * Implements two layers of protection:
 * 1. Origin/Referer validation - checks that requests come from allowed origins
 * 2. CSRF token validation - ensures requests include a valid token
 *
 * This middleware should be applied to all state-changing routes (POST, PUT, DELETE, PATCH).
 * GET/HEAD/OPTIONS requests are allowed through as they should be idempotent.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  // Skip CSRF check if auth is not required (user has explicitly opted into insecure mode)
  if (!isAuthRequired()) {
    return next();
  }

  // Safe methods don't need CSRF protection
  const safeMethod = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  if (safeMethod) {
    return next();
  }

  // Layer 1: Origin/Referer validation
  const origin = req.get('Origin') || extractOriginFromReferer(req.get('Referer'));

  if (!origin) {
    // No Origin or Referer header - reject the request
    // This prevents requests from non-browser contexts that don't send these headers
    // Note: Some legitimate browser scenarios (e.g., bookmarklets) may fail,
    // but this is acceptable for a security-focused application
    res.status(403).json({
      success: false,
      error: 'Missing Origin or Referer header',
    });
    return;
  }

  if (!isOriginAllowed(origin)) {
    res.status(403).json({
      success: false,
      error: 'Invalid origin',
    });
    return;
  }

  // Layer 2: CSRF token validation
  const tokenFromHeader = req.get(CSRF_TOKEN_HEADER);
  const tokenFromSession = req.session?.csrfToken;

  if (!tokenFromHeader || !tokenFromSession) {
    res.status(403).json({
      success: false,
      error: 'Missing CSRF token',
    });
    return;
  }

  // Timing-safe comparison to prevent timing attacks
  const headerBuffer = Buffer.from(tokenFromHeader);
  const sessionBuffer = Buffer.from(tokenFromSession);

  if (
    headerBuffer.length !== sessionBuffer.length ||
    !crypto.timingSafeEqual(headerBuffer, sessionBuffer)
  ) {
    res.status(403).json({
      success: false,
      error: 'Invalid CSRF token',
    });
    return;
  }

  next();
}

/**
 * Middleware to set CSRF token cookie (for double-submit pattern).
 * The cookie is readable by JavaScript (httpOnly: false) so the client
 * can read it and send it back in the header.
 *
 * This is applied to all responses so the client always has access to a valid token.
 */
export function csrfTokenCookie(req: Request, res: Response, next: NextFunction): void {
  // Skip if auth is not required
  if (!isAuthRequired()) {
    return next();
  }

  // Ensure we have a CSRF token in the session
  const token = getOrCreateCsrfToken(req);

  // Set the CSRF token as a cookie (readable by JavaScript)
  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false, // Must be false so JavaScript can read it
    secure: shouldUseSecureCookies(),
    sameSite: 'lax', // Lax mode to allow OAuth redirect flows
    path: '/',
  });

  next();
}
