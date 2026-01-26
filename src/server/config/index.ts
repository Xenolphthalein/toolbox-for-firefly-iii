import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Find .env file - works in both dev (src/server/config) and prod (dist/server/config)
// In dev with tsx: __dirname is src/server/config, .env is at project root (3 levels up)
// In prod: __dirname is dist/server/config, .env is at project root (3 levels up)
// Use debug: false to suppress dotenv promotional messages in production
const envPath = path.resolve(__dirname, '../../../.env');
dotenv.config({ path: envPath, debug: false });

// Also try loading from current working directory as fallback
dotenv.config({ debug: false });

import type { AuthMethod } from '../../shared/types/auth.js';
import crypto from 'crypto';

export type AIProvider = 'openai' | 'ollama' | 'none';

export interface Config {
  port: number;
  nodeEnv: string;
  corsOrigins: string[];
  appUrl: string;
  numberFormat: {
    locale: string;
    decimalSeparator: string;
    thousandsSeparator: string;
  };
  firefly: {
    apiUrl: string;
    apiToken: string;
  };
  ai: {
    provider: AIProvider;
    apiUrl: string;
    apiKey: string;
    model: string;
  };
  fints: {
    productId: string;
  };
  // Legacy openai config for backward compatibility
  openai: {
    apiKey: string;
    model: string;
  };
  auth: {
    method: AuthMethod;
    /** Explicitly enabled auth methods (from AUTH_METHODS env var). Empty = auto-detect */
    enabledMethods: AuthMethod[];
    sessionSecret: string;
    // Basic auth credentials
    basic: {
      username: string;
      password: string;
    };
    // OIDC configuration (Authentik, Keycloak, etc.)
    oidc: {
      issuerUrl: string;
      clientId: string;
      clientSecret: string;
      scopes: string[];
    };
    // Firefly III OAuth configuration
    fireflyOAuth: {
      clientId: string;
      clientSecret: string;
    };
  };
}

function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key] ?? defaultValue;
  if (value === undefined) {
    throw new Error(`Environment variable ${key} is required but not set`);
  }
  return value;
}

function getOptionalEnvVar(key: string, defaultValue: string = ''): string {
  return process.env[key] ?? defaultValue;
}

function detectAIProvider(): AIProvider {
  const explicitProvider = getOptionalEnvVar('AI_PROVIDER', '').toLowerCase();
  if (explicitProvider === 'openai' || explicitProvider === 'ollama') {
    return explicitProvider;
  }

  // Auto-detect based on which API key is set
  if (getOptionalEnvVar('OPENAI_API_KEY')) {
    return 'openai';
  }
  if (getOptionalEnvVar('OLLAMA_API_URL')) {
    return 'ollama';
  }

  return 'none';
}

function getAIApiUrl(provider: AIProvider): string {
  if (provider === 'ollama') {
    return getOptionalEnvVar('OLLAMA_API_URL', 'http://localhost:11434');
  }
  if (provider === 'openai') {
    return getOptionalEnvVar('OPENAI_API_URL', 'https://api.openai.com/v1');
  }
  return '';
}

function getAIModel(provider: AIProvider): string {
  const explicitModel = getOptionalEnvVar('AI_MODEL');
  if (explicitModel) return explicitModel;

  if (provider === 'ollama') {
    return getOptionalEnvVar('OLLAMA_MODEL', 'llama3.2');
  }
  if (provider === 'openai') {
    return getOptionalEnvVar('OPENAI_MODEL', 'gpt-4o-mini');
  }
  return '';
}

const detectedProvider = detectAIProvider();

/**
 * Parse the AUTH_METHODS env var into an array of enabled auth methods.
 * Returns empty array if not set (meaning auto-detect all configured methods).
 */
function parseEnabledAuthMethods(): AuthMethod[] {
  const methodsVar = getOptionalEnvVar('AUTH_METHODS', '');
  if (methodsVar) {
    const validMethods: AuthMethod[] = ['basic', 'oidc', 'firefly', 'none'];
    return methodsVar
      .split(',')
      .map((m) => m.trim().toLowerCase())
      .filter((m): m is AuthMethod => validMethods.includes(m as AuthMethod));
  }

  // Empty array means auto-detect all configured methods
  return [];
}

/**
 * Detect the primary auth method based on configuration.
 * This is used for backward compatibility and determining if auth is required.
 */
function detectAuthMethod(enabledMethods: AuthMethod[]): AuthMethod {
  // If 'none' is explicitly in the enabled list, no auth required
  if (enabledMethods.includes('none')) {
    return 'none';
  }

  // If methods are explicitly specified, use the first valid one
  if (enabledMethods.length > 0) {
    // Return the first enabled method that is also configured
    for (const method of enabledMethods) {
      if (
        method === 'basic' &&
        getOptionalEnvVar('AUTH_BASIC_USERNAME') &&
        getOptionalEnvVar('AUTH_BASIC_PASSWORD')
      ) {
        return 'basic';
      }
      if (
        method === 'oidc' &&
        getOptionalEnvVar('AUTH_OIDC_ISSUER_URL') &&
        getOptionalEnvVar('AUTH_OIDC_CLIENT_ID')
      ) {
        return 'oidc';
      }
      if (method === 'firefly' && getOptionalEnvVar('AUTH_FIREFLY_CLIENT_ID')) {
        return 'firefly';
      }
    }
    // If specified methods aren't configured, return 'none'
    return 'none';
  }

  // Auto-detect based on which config is set
  if (getOptionalEnvVar('AUTH_BASIC_USERNAME') && getOptionalEnvVar('AUTH_BASIC_PASSWORD')) {
    return 'basic';
  }
  if (getOptionalEnvVar('AUTH_OIDC_ISSUER_URL') && getOptionalEnvVar('AUTH_OIDC_CLIENT_ID')) {
    return 'oidc';
  }
  // FireflyIII OAuth - secret is optional (public clients don't need it)
  if (getOptionalEnvVar('AUTH_FIREFLY_CLIENT_ID')) {
    return 'firefly';
  }

  return 'none';
}

const enabledAuthMethods = parseEnabledAuthMethods();
const detectedAuthMethod = detectAuthMethod(enabledAuthMethods);

/**
 * Check if insecure mode (no authentication) is explicitly allowed.
 * This is a safety valve for users who understand the risks and want to run
 * without authentication (e.g., behind a VPN or trusted network).
 */
function isInsecureModeAllowed(): boolean {
  const value = getOptionalEnvVar('AUTH_ALLOW_INSECURE', '').toLowerCase();
  return value === 'true' || value === '1' || value === 'yes';
}

// Generate a random session secret if not provided (for development)
const defaultSessionSecret =
  process.env.NODE_ENV === 'production'
    ? '' // Must be set in production
    : crypto.randomBytes(32).toString('hex');

/**
 * Normalize and validate CORS origins:
 * - Trims whitespace
 * - Removes trailing slashes for consistency
 * - Filters out empty or invalid entries
 * - Adds APP_URL to allow reverse proxy scenarios
 */
function normalizeCorsOrigins(rawOrigins: string, appUrl: string): string[] {
  const origins = rawOrigins
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, '')) // trim and remove trailing slashes
    .filter((origin) => {
      if (!origin) return false;
      // Basic validation: must start with http:// or https://
      if (!/^https?:\/\//i.test(origin)) {
        // Note: Can't use logger here as config is loaded before logger initializes
        console.warn(`Invalid CORS origin (missing scheme): "${origin}"`);
        return false;
      }
      return true;
    });

  // Add APP_URL to origins if not already present (for reverse proxy support)
  const normalizedAppUrl = appUrl.trim().replace(/\/+$/, '');
  if (normalizedAppUrl && !origins.includes(normalizedAppUrl)) {
    origins.push(normalizedAppUrl);
  }

  return origins;
}

const appUrl = getOptionalEnvVar('APP_URL', 'http://localhost:3000');

export const config: Config = {
  port: parseInt(getEnvVar('PORT', '3000'), 10),
  nodeEnv: getEnvVar('NODE_ENV', 'development'),
  appUrl: appUrl.trim().replace(/\/+$/, ''),
  corsOrigins: normalizeCorsOrigins(
    getEnvVar('CORS_ORIGINS', 'http://localhost:5173,http://localhost:3000'),
    appUrl
  ),
  numberFormat: {
    locale: getOptionalEnvVar('NUMBER_FORMAT_LOCALE', 'en-US'),
    decimalSeparator: getOptionalEnvVar('NUMBER_FORMAT_DECIMAL', '.'),
    thousandsSeparator: getOptionalEnvVar('NUMBER_FORMAT_THOUSANDS', ','),
  },
  firefly: {
    apiUrl: getOptionalEnvVar('FIREFLY_API_URL', ''),
    apiToken: getOptionalEnvVar('FIREFLY_API_TOKEN', ''),
  },
  ai: {
    provider: detectedProvider,
    apiUrl: getAIApiUrl(detectedProvider),
    apiKey: getOptionalEnvVar('OPENAI_API_KEY', ''),
    model: getAIModel(detectedProvider),
  },
  fints: {
    // FinTS product registration ID - register at https://www.hbci-zka.de/register/hersteller.htm
    productId: getOptionalEnvVar('FINTS_PRODUCT_ID', ''),
  },
  // Legacy support
  openai: {
    apiKey: getOptionalEnvVar('OPENAI_API_KEY', ''),
    model: getOptionalEnvVar('OPENAI_MODEL', 'gpt-4o-mini'),
  },
  auth: {
    method: detectedAuthMethod,
    enabledMethods: enabledAuthMethods,
    sessionSecret: getOptionalEnvVar('AUTH_SESSION_SECRET', defaultSessionSecret),
    basic: {
      username: getOptionalEnvVar('AUTH_BASIC_USERNAME', ''),
      password: getOptionalEnvVar('AUTH_BASIC_PASSWORD', ''),
    },
    oidc: {
      issuerUrl: getOptionalEnvVar('AUTH_OIDC_ISSUER_URL', ''),
      clientId: getOptionalEnvVar('AUTH_OIDC_CLIENT_ID', ''),
      clientSecret: getOptionalEnvVar('AUTH_OIDC_CLIENT_SECRET', ''),
      scopes: getOptionalEnvVar('AUTH_OIDC_SCOPES', 'openid profile email').split(' '),
    },
    fireflyOAuth: {
      clientId: getOptionalEnvVar('AUTH_FIREFLY_CLIENT_ID', ''),
      clientSecret: getOptionalEnvVar('AUTH_FIREFLY_CLIENT_SECRET', ''),
    },
  },
};

export function isFireflyConfigured(): boolean {
  return Boolean(config.firefly.apiUrl && config.firefly.apiToken);
}

export function isOpenAIConfigured(): boolean {
  return config.ai.provider === 'openai' && Boolean(config.ai.apiKey);
}

export function isAIConfigured(): boolean {
  const provider = config.ai.provider;
  if (provider === 'openai') {
    return Boolean(config.ai.apiKey);
  }
  if (provider === 'ollama') {
    return Boolean(config.ai.apiUrl);
  }
  return false;
}

export function isFinTSConfigured(): boolean {
  return Boolean(config.fints.productId);
}

export function isAuthRequired(): boolean {
  return config.auth.method !== 'none';
}

export function isBasicAuthConfigured(): boolean {
  return Boolean(config.auth.basic.username && config.auth.basic.password);
}

export function isOIDCConfigured(): boolean {
  return Boolean(
    config.auth.oidc.issuerUrl && config.auth.oidc.clientId && config.auth.oidc.clientSecret
  );
}

export function isFireflyOAuthConfigured(): boolean {
  // FireflyIII OAuth can work with public clients (no secret) or confidential clients (with secret)
  return Boolean(config.firefly.apiUrl && config.auth.fireflyOAuth.clientId);
}

/**
 * Get the list of available auth methods.
 * If AUTH_METHODS is set, only those methods (that are also configured) are returned.
 * If AUTH_METHODS is not set, all configured methods are auto-detected.
 */
export function getAvailableAuthMethods(): AuthMethod[] {
  const methods: AuthMethod[] = [];

  // Check if specific methods are enabled via AUTH_METHODS
  const hasEnabledFilter = config.auth.enabledMethods.length > 0;

  // Helper to check if a method should be included
  const shouldInclude = (method: AuthMethod): boolean => {
    if (!hasEnabledFilter) return true; // No filter, include all configured methods
    return config.auth.enabledMethods.includes(method);
  };

  if (isBasicAuthConfigured() && shouldInclude('basic')) methods.push('basic');
  if (isOIDCConfigured() && shouldInclude('oidc')) methods.push('oidc');
  if (isFireflyOAuthConfigured() && shouldInclude('firefly')) methods.push('firefly');

  return methods;
}

export function validateConfig(): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!config.firefly.apiUrl) {
    errors.push('FIREFLY_API_URL is not configured');
  }

  if (!config.firefly.apiToken) {
    errors.push('FIREFLY_API_TOKEN is not configured');
  }

  // Production security enforcement (FS-SEC-001)
  if (config.nodeEnv === 'production') {
    // Require authentication in production unless explicitly opted out
    if (config.auth.method === 'none') {
      if (isInsecureModeAllowed()) {
        warnings.push(
          'AUTH_ALLOW_INSECURE is set - running without authentication. ' +
            'This exposes all Firefly III data to anyone who can reach this server.'
        );
      } else {
        errors.push(
          'Authentication is required in production. ' +
            'Set AUTH_METHODS to "basic", "oidc", "firefly" (or comma-separated combination) and configure the appropriate credentials. ' +
            'If you understand the risks and want to disable authentication, set AUTH_ALLOW_INSECURE=true.'
        );
      }
    }

    // Require session secret with minimum entropy when auth is enabled (FS-SEC-004)
    if (config.auth.method !== 'none') {
      if (!config.auth.sessionSecret) {
        errors.push(
          'AUTH_SESSION_SECRET is required in production mode. ' +
            'Set a strong, random secret (minimum 32 characters).'
        );
      } else if (config.auth.sessionSecret.length < 32) {
        errors.push(
          'AUTH_SESSION_SECRET must be at least 32 characters long for adequate security. ' +
            'Current length: ' +
            config.auth.sessionSecret.length +
            '. ' +
            'Generate a secure secret with: openssl rand -hex 32'
        );
      }
    }
  }

  // Validate each enabled auth method has the required configuration
  const enabledMethods = config.auth.enabledMethods;

  if (enabledMethods.includes('basic') && !isBasicAuthConfigured()) {
    errors.push(
      'AUTH_BASIC_USERNAME and AUTH_BASIC_PASSWORD are required when basic auth is enabled in AUTH_METHODS'
    );
  }

  if (enabledMethods.includes('oidc') && !isOIDCConfigured()) {
    errors.push(
      'OIDC configuration (AUTH_OIDC_ISSUER_URL, AUTH_OIDC_CLIENT_ID, AUTH_OIDC_CLIENT_SECRET) is incomplete but oidc is enabled in AUTH_METHODS'
    );
  }

  if (enabledMethods.includes('firefly') && !isFireflyOAuthConfigured()) {
    errors.push(
      'Firefly OAuth configuration (AUTH_FIREFLY_CLIENT_ID) is incomplete but firefly is enabled in AUTH_METHODS'
    );
  }

  // Warn if AUTH_METHODS is set but no valid methods result
  if (enabledMethods.length > 0 && !enabledMethods.includes('none')) {
    const availableMethods = getAvailableAuthMethods();
    if (availableMethods.length === 0) {
      warnings.push(
        `AUTH_METHODS is set to "${enabledMethods.join(',')}" but none of these methods are properly configured. ` +
          'Authentication will effectively be disabled.'
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
