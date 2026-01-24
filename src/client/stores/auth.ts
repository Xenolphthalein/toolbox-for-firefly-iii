import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '../services/api';
import type {
  AuthStatus,
  AuthUser,
  AuthMethod,
  OAuthProviderInfo,
  AuthLoginResponse,
} from '@shared/types/auth';

export const useAuthStore = defineStore('auth', () => {
  // State
  const user = ref<AuthUser | null>(null);
  const availableMethods = ref<AuthMethod[]>([]);
  const authRequired = ref(true);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const initialized = ref(false);
  const oauthProviders = ref<OAuthProviderInfo[]>([]);

  // Getters
  const isAuthenticated = computed(() => !authRequired.value || !!user.value);
  const hasBasicAuth = computed(() => availableMethods.value.includes('basic'));
  const hasOAuth = computed(
    () => availableMethods.value.includes('oidc') || availableMethods.value.includes('firefly')
  );

  // Actions

  /**
   * Fetch the current authentication status from the server
   */
  async function fetchAuthStatus(): Promise<void> {
    loading.value = true;
    error.value = null;

    try {
      const response = await api.get<{ success: boolean; data: AuthStatus }>('/auth/status');
      const status = response.data.data;

      user.value = status.user;
      availableMethods.value = status.availableMethods;
      authRequired.value = status.authRequired;
      initialized.value = true;
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch auth status';
      initialized.value = true;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Fetch available OAuth providers
   */
  async function fetchOAuthProviders(): Promise<void> {
    try {
      const response = await api.get<{ success: boolean; data: OAuthProviderInfo[] }>(
        '/auth/providers'
      );
      oauthProviders.value = response.data.data;
    } catch (err) {
      console.error('Failed to fetch OAuth providers:', err);
      oauthProviders.value = [];
    }
  }

  /**
   * Login with username/password (Basic Auth)
   */
  async function loginWithBasic(username: string, password: string): Promise<boolean> {
    loading.value = true;
    error.value = null;

    try {
      const response = await api.post<AuthLoginResponse>('/auth/basic/login', {
        username,
        password,
      });

      if (response.data.success && response.data.user) {
        user.value = response.data.user;
        return true;
      } else {
        error.value = response.data.error || 'Login failed';
        return false;
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Login failed';
      return false;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Initiate OAuth login flow (redirects to provider)
   */
  function initiateOAuthLogin(provider: OAuthProviderInfo): void {
    window.location.href = provider.authUrl;
  }

  /**
   * Logout the current user
   */
  async function logout(): Promise<void> {
    loading.value = true;
    error.value = null;

    try {
      await api.post('/auth/logout');
      user.value = null;
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Logout failed';
    } finally {
      loading.value = false;
    }
  }

  /**
   * Clear any authentication error
   */
  function clearError(): void {
    error.value = null;
  }

  /**
   * Handle 401 response from API (session expired)
   */
  function handleUnauthorized(): void {
    user.value = null;
    error.value = 'Your session has expired. Please log in again.';
  }

  return {
    // State
    user,
    availableMethods,
    authRequired,
    loading,
    error,
    initialized,
    oauthProviders,

    // Getters
    isAuthenticated,
    hasBasicAuth,
    hasOAuth,

    // Actions
    fetchAuthStatus,
    fetchOAuthProviders,
    loginWithBasic,
    initiateOAuthLogin,
    logout,
    clearError,
    handleUnauthorized,
  };
});
