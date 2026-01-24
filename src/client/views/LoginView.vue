<template>
  <v-container class="fill-height" fluid>
    <v-row align="center" justify="center">
      <v-col cols="12" class="login-col">
        <!-- Login Card -->
        <v-card class="elevation-8 mx-auto login-card" rounded="lg">
          <!-- Header -->
          <v-card-title class="text-center py-6">
            <div class="d-flex flex-column align-center">
              <v-img :src="logoSrc" alt="FireflyIII Toolbox" width="64" height="64" class="mb-4" />
              <h1 class="text-h5 font-weight-bold">FireflyIII Toolbox</h1>
              <p class="text-body-2 text-medium-emphasis mt-1">Sign in to continue</p>
            </div>
          </v-card-title>

          <v-divider />

          <v-card-text class="pa-6">
            <!-- Error Alert -->
            <v-alert
              v-if="authStore.error || errorFromUrl"
              type="error"
              variant="tonal"
              closable
              class="mb-4"
              @click:close="clearErrors"
            >
              {{ authStore.error || getErrorMessage(errorFromUrl) }}
            </v-alert>

            <!-- Loading State -->
            <div v-if="authStore.loading" class="text-center py-8">
              <v-progress-circular indeterminate color="primary" size="48" />
              <p class="text-body-2 text-medium-emphasis mt-4">Authenticating...</p>
            </div>

            <!-- No Auth Methods Configured -->
            <v-alert
              v-else-if="!authStore.hasBasicAuth && !authStore.hasOAuth"
              type="warning"
              variant="tonal"
              class="mb-0"
            >
              <v-alert-title>No Authentication Configured</v-alert-title>
              <p class="text-body-2 mb-0">
                Please configure authentication in your environment variables. See the documentation
                for available options.
              </p>
            </v-alert>

            <!-- Auth Options -->
            <template v-else>
              <!-- Basic Auth Form -->
              <v-form
                v-if="authStore.hasBasicAuth"
                ref="basicForm"
                @submit.prevent="handleBasicLogin"
              >
                <v-text-field
                  v-model="username"
                  label="Username"
                  prepend-inner-icon="mdi-account"
                  variant="outlined"
                  density="comfortable"
                  :rules="[rules.required]"
                  :disabled="authStore.loading"
                  autocomplete="username"
                  class="mb-3"
                />

                <v-text-field
                  v-model="password"
                  label="Password"
                  :type="showPassword ? 'text' : 'password'"
                  prepend-inner-icon="mdi-lock"
                  :append-inner-icon="showPassword ? 'mdi-eye-off' : 'mdi-eye'"
                  variant="outlined"
                  density="comfortable"
                  :rules="[rules.required]"
                  :disabled="authStore.loading"
                  autocomplete="current-password"
                  @click:append-inner="showPassword = !showPassword"
                />

                <v-btn
                  type="submit"
                  color="primary"
                  size="large"
                  block
                  class="mt-4"
                  :loading="authStore.loading"
                >
                  <v-icon start>mdi-login</v-icon>
                  Sign In
                </v-btn>
              </v-form>

              <!-- OAuth Divider -->
              <div v-if="authStore.hasBasicAuth && authStore.hasOAuth" class="my-6">
                <v-divider>
                  <span class="text-caption text-medium-emphasis px-3">or continue with</span>
                </v-divider>
              </div>

              <!-- OAuth Buttons -->
              <div v-if="authStore.hasOAuth" class="d-flex flex-column ga-3">
                <v-btn
                  v-for="provider in authStore.oauthProviders"
                  :key="provider.method"
                  variant="outlined"
                  size="large"
                  block
                  :disabled="authStore.loading"
                  @click="handleOAuthLogin(provider)"
                >
                  <v-icon start>
                    {{ getProviderIcon(provider.method) }}
                  </v-icon>
                  {{ provider.name }}
                </v-btn>
              </div>
            </template>
          </v-card-text>
        </v-card>

        <!-- Info text -->
        <p class="text-body-2 text-medium-emphasis text-center mt-6">
          Extend your FireflyIII with powerful automation tools
        </p>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useAppStore } from '../stores/app';
import type { OAuthProviderInfo } from '@shared/types/auth';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const appStore = useAppStore();

const logoSrc = computed(() => (appStore.darkMode ? '/logo.png' : '/logo_light_mode.png'));

// Form state
const username = ref('');
const password = ref('');
const showPassword = ref(false);
const basicForm = ref<HTMLFormElement | null>(null);

// Validation rules
const rules = {
  required: (v: string) => !!v || 'This field is required',
};

// Get error from URL query params (OAuth callback errors)
const errorFromUrl = computed(() => route.query.error as string | undefined);

// Convert error codes to human-readable messages
function getErrorMessage(errorCode: string | undefined): string {
  if (!errorCode) return '';

  const errorMessages: Record<string, string> = {
    invalid_session: 'Your session has expired. Please try again.',
    authentication_failed: 'Authentication failed. Please try again.',
    token_exchange_failed: 'Failed to complete authentication. Please try again.',
    user_info_failed: 'Failed to retrieve user information.',
    invalid_state: 'Invalid authentication state. Please try again.',
    oidc_not_configured: 'Single Sign-On is not configured.',
    firefly_oauth_not_configured: 'FireflyIII OAuth is not configured.',
    access_denied: 'Access was denied by the authentication provider.',
  };

  return errorMessages[errorCode] || `Authentication error: ${errorCode}`;
}

// Get icon for OAuth provider
function getProviderIcon(method: string): string {
  switch (method) {
    case 'oidc':
      return 'mdi-shield-key';
    case 'firefly':
      return 'mdi-fire';
    default:
      return 'mdi-login';
  }
}

// Clear errors
function clearErrors(): void {
  authStore.clearError();
  // Remove error from URL
  if (errorFromUrl.value) {
    router.replace({ query: {} });
  }
}

// Handle basic auth login
async function handleBasicLogin(): Promise<void> {
  const form = basicForm.value;
  if (!form) return;

  // Validate form
  const { valid } = await form.validate();
  if (!valid) return;

  const success = await authStore.loginWithBasic(username.value, password.value);
  if (success) {
    // Redirect to home or the originally requested page
    const redirect = route.query.redirect as string;
    router.push(redirect || '/');
  }
}

// Handle OAuth login
function handleOAuthLogin(provider: OAuthProviderInfo): void {
  authStore.initiateOAuthLogin(provider);
}

// Fetch OAuth providers on mount
onMounted(async () => {
  if (authStore.hasOAuth) {
    await authStore.fetchOAuthProviders();
  }
});
</script>

<style scoped>
.fill-height {
  min-height: 100vh;
}

.login-col {
  max-width: 480px;
}

.login-card {
  width: 100%;
}
</style>
