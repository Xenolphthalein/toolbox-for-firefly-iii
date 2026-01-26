<template>
  <div class="settings-view">
    <!-- Status Cards Row -->
    <div class="status-grid mb-6">
      <v-card variant="tonal" rounded="lg" :color="appStore.isConnected ? 'success' : 'error'">
        <v-card-text class="d-flex align-center pa-4">
          <v-icon size="32" class="mr-3">
            {{ appStore.isConnected ? 'mdi-check-circle' : 'mdi-close-circle' }}
          </v-icon>
          <div>
            <div class="text-caption text-uppercase font-weight-medium">FireflyIII</div>
            <div class="text-body-1 font-weight-bold">
              {{ appStore.isConnected ? 'Connected' : 'Disconnected' }}
            </div>
          </div>
        </v-card-text>
      </v-card>

      <v-card variant="tonal" rounded="lg" :color="appStore.hasAI ? 'info' : 'warning'">
        <v-card-text class="d-flex align-center pa-4">
          <v-icon size="32" class="mr-3">
            {{ appStore.hasAI ? 'mdi-robot' : 'mdi-robot-off' }}
          </v-icon>
          <div>
            <div class="text-caption text-uppercase font-weight-medium">AI Features</div>
            <div class="text-body-1 font-weight-bold">
              {{ appStore.hasAI ? `Active (${appStore.aiProvider})` : 'Not Configured' }}
            </div>
          </div>
        </v-card-text>
      </v-card>
    </div>

    <!-- Configuration Errors Alert -->
    <v-alert
      v-if="appStore.status?.errors && appStore.status.errors.length > 0"
      type="error"
      variant="tonal"
      class="mb-6"
      rounded="lg"
    >
      <v-alert-title>Configuration Issues</v-alert-title>
      <ul class="mt-2 ml-4 mb-0">
        <li v-for="error in appStore.status.errors" :key="error">
          {{ error }}
        </li>
      </ul>
    </v-alert>

    <div class="settings-grid">
      <!-- User Session (when authenticated) -->
      <v-card v-if="authStore.authRequired && authStore.user" rounded="lg">
        <v-card-title class="d-flex align-center">
          <v-avatar color="primary" size="32" variant="tonal" class="mr-3">
            <v-icon size="18">mdi-account</v-icon>
          </v-avatar>
          Account
        </v-card-title>

        <v-card-text>
          <div class="d-flex flex-column ga-3">
            <div class="d-flex align-center justify-space-between">
              <span class="text-body-2 text-medium-emphasis">Signed in as</span>
              <span class="text-body-2 font-weight-medium">
                {{ authStore.user.displayName || authStore.user.username }}
              </span>
            </div>
            <div v-if="authStore.user.email" class="d-flex align-center justify-space-between">
              <span class="text-body-2 text-medium-emphasis">Email</span>
              <span class="text-body-2">{{ authStore.user.email }}</span>
            </div>
            <div class="d-flex align-center justify-space-between">
              <span class="text-body-2 text-medium-emphasis">Authentication</span>
              <v-chip
                size="small"
                variant="tonal"
                :color="getAuthMethodColor(authStore.user.authMethod)"
              >
                {{ getAuthMethodLabel(authStore.user.authMethod) }}
              </v-chip>
            </div>
          </div>
        </v-card-text>

        <v-card-actions class="px-4 pb-4">
          <v-btn color="error" variant="tonal" :loading="loggingOut" @click="handleLogout">
            <v-icon start>mdi-logout</v-icon>
            Sign Out
          </v-btn>
        </v-card-actions>
      </v-card>

      <!-- FireflyIII Configuration (Read-only) -->
      <v-card rounded="lg">
        <v-card-title class="d-flex align-center">
          <v-avatar color="primary" size="32" variant="tonal" class="mr-3">
            <v-icon size="18">mdi-fire</v-icon>
          </v-avatar>
          FireflyIII Connection
          <v-chip size="x-small" variant="tonal" class="ml-auto">Server Configured</v-chip>
        </v-card-title>

        <v-card-text>
          <div class="d-flex flex-column ga-3">
            <div class="d-flex align-center justify-space-between">
              <span class="text-body-2 text-medium-emphasis">API URL</span>
              <span class="text-body-2 font-weight-medium">
                {{ appStore.status?.fireflyUrl || 'Not configured' }}
              </span>
            </div>
            <div class="d-flex align-center justify-space-between">
              <span class="text-body-2 text-medium-emphasis">API Token</span>
              <span class="text-body-2">
                {{ appStore.isConnected ? '••••••••••••••••' : 'Not configured' }}
              </span>
            </div>
            <div class="d-flex align-center justify-space-between">
              <span class="text-body-2 text-medium-emphasis">Status</span>
              <v-chip
                size="small"
                variant="tonal"
                :color="appStore.isConnected ? 'success' : 'error'"
              >
                {{ appStore.isConnected ? 'Connected' : 'Disconnected' }}
              </v-chip>
            </div>
          </div>
        </v-card-text>
      </v-card>

      <!-- AI Configuration (Read-only) -->
      <v-card rounded="lg">
        <v-card-title class="d-flex align-center">
          <v-avatar color="info" size="32" variant="tonal" class="mr-3">
            <v-icon size="18">mdi-robot</v-icon>
          </v-avatar>
          AI Integration
          <v-chip size="x-small" variant="tonal" class="ml-auto">Server Configured</v-chip>
        </v-card-title>

        <v-card-text>
          <div class="d-flex flex-column ga-3">
            <div class="d-flex align-center justify-space-between">
              <span class="text-body-2 text-medium-emphasis">Provider</span>
              <span class="text-body-2 font-weight-medium">
                {{ getAIProviderLabel(appStore.status?.aiProvider) }}
              </span>
            </div>
            <template v-if="appStore.hasAI">
              <div class="d-flex align-center justify-space-between">
                <span class="text-body-2 text-medium-emphasis">Model</span>
                <span class="text-body-2">{{ appStore.status?.aiModel || 'Default' }}</span>
              </div>
              <div
                v-if="appStore.status?.aiProvider === 'ollama'"
                class="d-flex align-center justify-space-between"
              >
                <span class="text-body-2 text-medium-emphasis">API URL</span>
                <span class="text-body-2">{{ appStore.status?.aiApiUrl || 'Default' }}</span>
              </div>
            </template>
            <div class="d-flex align-center justify-space-between">
              <span class="text-body-2 text-medium-emphasis">Status</span>
              <v-chip size="small" variant="tonal" :color="appStore.hasAI ? 'success' : 'warning'">
                {{ appStore.hasAI ? 'Active' : 'Not Configured' }}
              </v-chip>
            </div>
          </div>

          <!-- Privacy Warning for External AI Providers -->
          <v-alert
            v-if="appStore.isExternalAIProvider"
            :type="appStore.aiDataSharingAcknowledged ? 'success' : 'warning'"
            variant="tonal"
            class="mt-4"
            density="compact"
          >
            <template #title>
              <span class="text-body-2 font-weight-medium">
                {{
                  appStore.aiDataSharingAcknowledged
                    ? 'Data Sharing Acknowledged'
                    : 'External AI Provider'
                }}
              </span>
            </template>
            <template v-if="!appStore.aiDataSharingAcknowledged">
              <p class="text-body-2 mb-2">
                AI features are powered by an external provider ({{
                  getAIProviderLabel(appStore.aiProvider)
                }}). Transaction data will be sent to third-party servers for processing.
              </p>
              <v-btn size="small" color="warning" variant="flat" @click="showPrivacyDialog = true">
                Review &amp; Acknowledge
              </v-btn>
            </template>
            <template v-else>
              <p class="text-body-2 mb-0">
                You have acknowledged that transaction data may be sent to external AI services.
                <a
                  href="#"
                  class="text-warning"
                  @click.prevent="appStore.revokeAIDataSharingAcknowledgment()"
                  >Revoke</a
                >
              </p>
            </template>
          </v-alert>

          <p v-if="!appStore.hasAI" class="text-body-2 text-medium-emphasis mt-4 mb-0">
            AI features (category/tag suggestions) require server-side configuration. Set the AI
            environment variables to enable these features.
          </p>
        </v-card-text>
      </v-card>

      <!-- Appearance -->
      <v-card rounded="lg">
        <v-card-title class="d-flex align-center">
          <v-avatar color="secondary" size="32" variant="tonal" class="mr-3">
            <v-icon size="18">mdi-palette</v-icon>
          </v-avatar>
          Appearance
        </v-card-title>

        <v-card-text>
          <v-select
            :model-value="appStore.themeId"
            :items="themeOptions"
            item-title="name"
            item-value="id"
            label="Theme"
            prepend-inner-icon="mdi-palette"
            density="comfortable"
            class="mb-3"
            @update:model-value="appStore.setTheme($event)"
          >
            <template #item="{ item, props: itemProps }">
              <v-list-item v-bind="itemProps">
                <template #subtitle>
                  {{ item.raw.description }}
                  <span v-if="item.raw.darkOnly" class="text-medium-emphasis ml-1"
                    >(Dark only)</span
                  >
                </template>
              </v-list-item>
            </template>
          </v-select>

          <v-switch
            v-model="appStore.darkMode"
            label="Dark Mode"
            color="primary"
            density="comfortable"
            hide-details
            :disabled="appStore.currentTheme.darkOnly"
          />
          <p
            v-if="appStore.currentTheme.darkOnly"
            class="text-caption text-medium-emphasis mt-1 mb-0"
          >
            This theme only supports dark mode
          </p>
        </v-card-text>
      </v-card>

      <!-- About -->
      <v-card rounded="lg">
        <v-card-title class="d-flex align-center">
          <v-avatar color="grey" size="32" variant="tonal" class="mr-3">
            <v-icon size="18">mdi-information</v-icon>
          </v-avatar>
          About
        </v-card-title>

        <v-card-text>
          <div class="d-flex flex-column ga-2">
            <div class="d-flex align-center justify-space-between">
              <span class="text-body-2 text-medium-emphasis">Version</span>
              <span class="text-body-2 font-weight-medium">1.0.0</span>
            </div>
            <div class="d-flex align-center justify-space-between">
              <span class="text-body-2 text-medium-emphasis">License</span>
              <span class="text-body-2 font-weight-medium">Unlicense</span>
            </div>
            <v-divider class="my-2" />
            <div class="d-flex align-center">
              <v-icon size="18" class="mr-2 text-medium-emphasis">mdi-github</v-icon>
              <a
                href="https://github.com/xenolphthalein/firefly-toolbox"
                target="_blank"
                class="text-primary text-body-2"
              >
                github.com/xenolphthalein/firefly-toolbox
              </a>
            </div>
          </div>
        </v-card-text>
      </v-card>
    </div>

    <!-- AI Data Sharing Privacy Dialog -->
    <v-dialog v-model="showPrivacyDialog" max-width="500" persistent>
      <v-card>
        <v-card-title class="d-flex align-center">
          <v-icon color="warning" class="mr-2">mdi-shield-alert</v-icon>
          Data Privacy Notice
        </v-card-title>
        <v-card-text>
          <v-alert type="warning" variant="tonal" class="mb-4" density="compact">
            <strong>External AI Provider Detected</strong>
          </v-alert>

          <p class="text-body-2 mb-3">
            You have configured <strong>{{ getAIProviderLabel(appStore.aiProvider) }}</strong> as
            your AI provider. When using AI-powered features (category suggestions, tag
            suggestions), the following transaction data will be sent to external servers:
          </p>

          <ul class="text-body-2 mb-4 ml-4">
            <li>Transaction descriptions</li>
            <li>Transaction amounts and types</li>
            <li>Account names</li>
            <li>Existing categories and tags</li>
          </ul>

          <v-alert type="info" variant="tonal" density="compact" class="mb-3">
            <span class="text-body-2">
              <strong>Privacy Tip:</strong> For fully local AI processing, consider switching to
              <strong>Ollama</strong> by setting <code>AI_PROVIDER=ollama</code> in your
              environment.
            </span>
          </v-alert>

          <p class="text-body-2 mb-0">
            By clicking "I Understand", you acknowledge that your financial transaction data will be
            processed by third-party AI services according to their privacy policies.
          </p>
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-btn variant="text" @click="showPrivacyDialog = false">Cancel</v-btn>
          <v-spacer />
          <v-btn color="warning" variant="flat" @click="acknowledgeAndClose"> I Understand </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAppStore } from '../stores/app';
import { useAuthStore } from '../stores/auth';
import { useSnackbar } from '../composables';
import { themes } from '../config/themes';
import type { AuthMethod } from '@shared/types/auth';

const router = useRouter();
const appStore = useAppStore();
const authStore = useAuthStore();
const { showSnackbar } = useSnackbar();

const loggingOut = ref(false);
const showPrivacyDialog = ref(false);

const themeOptions = themes.map((t) => ({
  id: t.id,
  name: t.name,
  description: t.description,
  darkOnly: t.darkOnly ?? false,
}));

function getAuthMethodLabel(method: AuthMethod): string {
  switch (method) {
    case 'basic':
      return 'Password';
    case 'oidc':
      return 'Single Sign-On';
    case 'firefly':
      return 'FireflyIII OAuth';
    default:
      return 'Unknown';
  }
}

function getAuthMethodColor(method: AuthMethod): string {
  switch (method) {
    case 'basic':
      return 'primary';
    case 'oidc':
      return 'info';
    case 'firefly':
      return 'warning';
    default:
      return 'grey';
  }
}

function getAIProviderLabel(provider: string | undefined): string {
  switch (provider) {
    case 'openai':
      return 'OpenAI';
    case 'ollama':
      return 'Ollama (Local)';
    case 'none':
    default:
      return 'None';
  }
}

async function handleLogout(): Promise<void> {
  loggingOut.value = true;

  try {
    await authStore.logout();
    showSnackbar('Successfully signed out', 'success');
    router.push('/login');
  } catch (error) {
    showSnackbar(error instanceof Error ? error.message : 'Failed to sign out', 'error');
  } finally {
    loggingOut.value = false;
  }
}

function acknowledgeAndClose(): void {
  appStore.acknowledgeAIDataSharing();
  showPrivacyDialog.value = false;
  showSnackbar('AI data sharing acknowledged', 'success');
}
</script>

<style scoped>
.settings-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  padding: 16px;
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.settings-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}

@media (min-width: 1024px) {
  .settings-grid {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 600px) {
  .status-grid {
    grid-template-columns: 1fr;
  }
}
</style>
