import axios, { type AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import type { z } from 'zod';
import type { ApiResponse } from '@shared/types/app';
import { validateData, validateArray, type ValidationResult } from '../utils/validation';

/** CSRF token header name - must match server-side CSRF_TOKEN_HEADER */
const CSRF_TOKEN_HEADER = 'x-csrf-token';

/** Cookie name for CSRF token - must match server-side CSRF_COOKIE_NAME */
const CSRF_COOKIE_NAME = 'firefly_toolbox_csrf';

const api = axios.create({
  baseURL: '/api',
  timeout: 60000, // 60 seconds for longer operations
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Required for session cookies
});

// Unauthorized handler function - set by initializeApi() from main.ts
let onUnauthorized: (() => void) | null = null;

/**
 * Read CSRF token from cookie.
 * The server sets this cookie via csrfTokenCookie middleware.
 */
function getCsrfTokenFromCookie(): string | null {
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === CSRF_COOKIE_NAME) {
      return decodeURIComponent(value);
    }
  }
  return null;
}

/**
 * Initialize the API module with the auth handler.
 * Must be called after Vue app is mounted (from main.ts).
 *
 * Session identity is now managed server-side via Express session cookies,
 * which are automatically included via withCredentials: true.
 */
export function initializeApi(unauthorizedHandler?: () => void): void {
  onUnauthorized = unauthorizedHandler || null;
}

// Request interceptor to add CSRF token to state-changing requests
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Add CSRF token to all state-changing requests (POST, PUT, DELETE, PATCH)
    const method = config.method?.toUpperCase();
    if (method && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
      const csrfToken = getCsrfTokenFromCookie();
      if (csrfToken) {
        config.headers.set(CSRF_TOKEN_HEADER, csrfToken);
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: AxiosError<ApiResponse<unknown>>) => {
    // Handle 401 Unauthorized responses
    if (error.response?.status === 401 && onUnauthorized) {
      onUnauthorized();
    }

    const message = error.response?.data?.error || error.message || 'An unexpected error occurred';
    return Promise.reject(new Error(message));
  }
);

export default api;

// Type-safe API helper
export async function apiRequest<T>(
  method: 'get' | 'post' | 'put' | 'delete',
  url: string,
  data?: unknown
): Promise<T> {
  const response = await api.request<ApiResponse<T>>({
    method,
    url,
    data: method !== 'get' ? data : undefined,
    params: method === 'get' ? data : undefined,
  });

  if (!response.data.success) {
    throw new Error(response.data.error || 'Request failed');
  }

  return response.data.data as T;
}

/**
 * Type-safe API helper with runtime validation
 * Use this for critical financial data to ensure type safety at runtime
 */
export async function validatedApiRequest<T>(
  method: 'get' | 'post' | 'put' | 'delete',
  url: string,
  schema: z.ZodType<T>,
  data?: unknown,
  context?: string
): Promise<ValidationResult<T>> {
  const response = await api.request<ApiResponse<unknown>>({
    method,
    url,
    data: method !== 'get' ? data : undefined,
    params: method === 'get' ? data : undefined,
  });

  if (!response.data.success) {
    return {
      success: false,
      error: response.data.error || 'Request failed',
    };
  }

  return validateData(schema, response.data.data, context);
}

/**
 * Type-safe API helper with runtime validation for arrays
 * Filters out invalid items and logs warnings
 */
export async function validatedArrayRequest<T>(
  method: 'get' | 'post' | 'put' | 'delete',
  url: string,
  schema: z.ZodType<T>,
  data?: unknown,
  context?: string
): Promise<{ items: T[]; invalidCount: number }> {
  const response = await api.request<ApiResponse<unknown[]>>({
    method,
    url,
    data: method !== 'get' ? data : undefined,
    params: method === 'get' ? data : undefined,
  });

  if (!response.data.success) {
    throw new Error(response.data.error || 'Request failed');
  }

  const items = response.data.data;
  if (!Array.isArray(items)) {
    throw new Error('Expected array response');
  }

  const result = validateArray(schema, items, context);
  return { items: result.valid, invalidCount: result.invalidCount };
}
