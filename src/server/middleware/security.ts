import { Application, Request } from 'express';
import helmet from 'helmet';
import { config } from '../config/index.js';

/**
 * Detect if the request came over TLS via a reverse proxy.
 * Checks common headers set by proxies when terminating TLS.
 */
export function isProxiedHttps(req: Request): boolean {
  // X-Forwarded-Proto is the standard header for proxied protocol
  if (req.headers['x-forwarded-proto'] === 'https') {
    return true;
  }
  // Some proxies use X-Forwarded-Ssl
  if (req.headers['x-forwarded-ssl'] === 'on') {
    return true;
  }
  // Check if req.secure is set (requires trust proxy)
  if (req.secure) {
    return true;
  }
  return false;
}

/**
 * Check if the app URL is configured as HTTPS
 */
export function isAppUrlHttps(): boolean {
  return config.appUrl.startsWith('https://');
}

/**
 * Determine if we should use secure cookies.
 * Returns true if:
 * - Running in production AND
 * - Either APP_URL is https:// OR we're behind a TLS-terminating proxy
 */
export function shouldUseSecureCookies(): boolean {
  if (config.nodeEnv !== 'production') {
    return false;
  }
  // If APP_URL is https, always use secure cookies
  return isAppUrlHttps();
}

/**
 * Configure security middleware for the Express app.
 * This sets up:
 * - Helmet for security headers (HSTS, frame-ancestors, referrer-policy, etc.)
 * - Disables x-powered-by header
 * - Configures trust proxy for reverse proxy scenarios
 */
export function configureSecurityMiddleware(app: Application): void {
  // Disable x-powered-by header (reveals Express/technology stack)
  app.disable('x-powered-by');

  // Enable trust proxy when in production or when APP_URL suggests a proxy setup
  // This allows req.secure, req.ip, and req.protocol to work correctly behind proxies
  if (config.nodeEnv === 'production' || isAppUrlHttps()) {
    // 'trust proxy' = 1 trusts the first proxy (most common setup)
    // For more complex setups, users can configure this differently
    app.set('trust proxy', 1);
  }

  // Configure Helmet with appropriate settings for a self-hosted app
  const useHttps = config.nodeEnv === 'production' && isAppUrlHttps();

  // Start with helmet's default CSP directives
  const cspDirectives = helmet.contentSecurityPolicy.getDefaultDirectives();

  // Remove upgrade-insecure-requests when not using HTTPS to prevent browser upgrade attempts
  if (!useHttps) {
    delete cspDirectives['upgrade-insecure-requests'];
  } else {
    // In case defaults change in the future, ensure it's set when using HTTPS
    // Only upgrade insecure requests when using HTTPS
    // This prevents browsers from trying HTTPS when serving over HTTP
    cspDirectives['upgrade-insecure-requests'] = [];
  }

  // Override defaults with our custom requirements (note: CSP uses kebab-case keys)
  cspDirectives['script-src'] = ["'self'", "'unsafe-eval'", "'wasm-unsafe-eval'"];
  cspDirectives['style-src'] = ["'self'", "'unsafe-inline'"];
  cspDirectives['img-src'] = ["'self'", 'data:', 'blob:'];
  cspDirectives['font-src'] = ["'self'", 'data:'];
  cspDirectives['connect-src'] = ["'self'"];

  app.use(
    helmet({
      // Content Security Policy - relaxed for SPA with API
      contentSecurityPolicy: {
        useDefaults: false, // We've already modified helmet's defaults above
        directives: cspDirectives,
      },

      // HTTP Strict Transport Security
      // Only enable HSTS in production with HTTPS
      strictTransportSecurity:
        config.nodeEnv === 'production' && isAppUrlHttps()
          ? {
              maxAge: 31536000, // 1 year
              includeSubDomains: false, // Don't force subdomains for self-hosted
            }
          : false,

      // Referrer Policy - strict but allows same-origin referrers
      referrerPolicy: {
        policy: 'strict-origin-when-cross-origin',
      },

      // X-Frame-Options - prevent clickjacking (backup for CSP frame-ancestors)
      frameguard: {
        action: 'sameorigin',
      },

      // X-Content-Type-Options - prevent MIME sniffing
      noSniff: true,

      // X-DNS-Prefetch-Control - disable DNS prefetching for privacy
      dnsPrefetchControl: {
        allow: false,
      },

      // X-Download-Options - prevent IE from executing downloads in site context
      ieNoOpen: true,

      // X-Permitted-Cross-Domain-Policies - restrict Adobe cross-domain policy
      permittedCrossDomainPolicies: {
        permittedPolicies: 'none',
      },

      // Origin-Agent-Cluster - request process isolation
      originAgentCluster: true,

      // Cross-Origin-Embedder-Policy - not needed for this app
      crossOriginEmbedderPolicy: false,

      // Cross-Origin-Opener-Policy - same-origin for security
      crossOriginOpenerPolicy: {
        policy: 'same-origin',
      },

      // Cross-Origin-Resource-Policy - same-origin for security
      crossOriginResourcePolicy: {
        policy: 'same-origin',
      },
    })
  );
}
