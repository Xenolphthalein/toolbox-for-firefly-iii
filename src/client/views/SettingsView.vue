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
            <div class="text-caption text-uppercase font-weight-medium">
              {{ t('settings.firefly') }}
            </div>
            <div class="text-body-1 font-weight-bold">
              {{
                appStore.isConnected
                  ? t('common.status.connected')
                  : t('common.status.disconnected')
              }}
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
            <div class="text-caption text-uppercase font-weight-medium">
              {{ t('settings.aiFeatures') }}
            </div>
            <div class="text-body-1 font-weight-bold">
              {{
                appStore.hasAI
                  ? t('settings.aiActive', { provider: appStore.aiProvider })
                  : t('common.status.notConfigured')
              }}
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
      <v-alert-title>{{ t('settings.configurationIssues') }}</v-alert-title>
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
          {{ t('common.labels.account') }}
        </v-card-title>

        <v-card-text>
          <div class="d-flex flex-column ga-3">
            <div class="d-flex align-center justify-space-between">
              <span class="text-body-2 text-medium-emphasis">{{ t('settings.signedInAs') }}</span>
              <span class="text-body-2 font-weight-medium">
                {{ authStore.user.displayName || authStore.user.username }}
              </span>
            </div>
            <div v-if="authStore.user.email" class="d-flex align-center justify-space-between">
              <span class="text-body-2 text-medium-emphasis">{{ t('settings.email') }}</span>
              <span class="text-body-2">{{ authStore.user.email }}</span>
            </div>
            <div class="d-flex align-center justify-space-between">
              <span class="text-body-2 text-medium-emphasis">{{
                t('settings.authentication')
              }}</span>
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
            {{ t('common.buttons.signOut') }}
          </v-btn>
        </v-card-actions>
      </v-card>

      <!-- Firefly III Configuration (Read-only) -->
      <v-card rounded="lg">
        <v-card-title class="d-flex align-center">
          <v-avatar color="primary" size="32" variant="tonal" class="mr-3">
            <v-icon size="18">mdi-fire</v-icon>
          </v-avatar>
          {{ t('settings.fireflyConnection') }}
          <v-chip size="x-small" variant="tonal" class="ml-auto">{{
            t('settings.serverConfigured')
          }}</v-chip>
        </v-card-title>

        <v-card-text>
          <div class="d-flex flex-column ga-3">
            <div class="d-flex align-center justify-space-between">
              <span class="text-body-2 text-medium-emphasis">{{ t('settings.apiUrl') }}</span>
              <span class="text-body-2 font-weight-medium">
                {{ appStore.status?.fireflyUrl || t('common.status.notConfigured') }}
              </span>
            </div>
            <div class="d-flex align-center justify-space-between">
              <span class="text-body-2 text-medium-emphasis">{{ t('settings.apiToken') }}</span>
              <span class="text-body-2">
                {{ appStore.isConnected ? '••••••••••••••••' : t('common.status.notConfigured') }}
              </span>
            </div>
            <div class="d-flex align-center justify-space-between">
              <span class="text-body-2 text-medium-emphasis">{{ t('common.labels.status') }}</span>
              <v-chip
                size="small"
                variant="tonal"
                :color="appStore.isConnected ? 'success' : 'error'"
              >
                {{
                  appStore.isConnected
                    ? t('common.status.connected')
                    : t('common.status.disconnected')
                }}
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
          {{ t('settings.aiIntegration') }}
          <v-chip size="x-small" variant="tonal" class="ml-auto">{{
            t('settings.serverConfigured')
          }}</v-chip>
        </v-card-title>

        <v-card-text>
          <div class="d-flex flex-column ga-3">
            <div class="d-flex align-center justify-space-between">
              <span class="text-body-2 text-medium-emphasis">{{ t('settings.provider') }}</span>
              <span class="text-body-2 font-weight-medium">
                {{ getAIProviderLabel(appStore.status?.aiProvider) }}
              </span>
            </div>
            <template v-if="appStore.hasAI">
              <div class="d-flex align-center justify-space-between">
                <span class="text-body-2 text-medium-emphasis">{{ t('settings.model') }}</span>
                <span class="text-body-2">{{
                  appStore.status?.aiModel || t('settings.default')
                }}</span>
              </div>
              <div
                v-if="appStore.status?.aiProvider === 'ollama'"
                class="d-flex align-center justify-space-between"
              >
                <span class="text-body-2 text-medium-emphasis">{{ t('settings.apiUrl') }}</span>
                <span class="text-body-2">{{
                  appStore.status?.aiApiUrl || t('settings.default')
                }}</span>
              </div>
            </template>
            <div class="d-flex align-center justify-space-between">
              <span class="text-body-2 text-medium-emphasis">{{ t('common.labels.status') }}</span>
              <v-chip size="small" variant="tonal" :color="appStore.hasAI ? 'success' : 'warning'">
                {{ appStore.hasAI ? t('common.status.active') : t('common.status.notConfigured') }}
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
                    ? t('views.settings.dataSharingAcknowledged')
                    : t('views.settings.externalAIProvider')
                }}
              </span>
            </template>
            <template v-if="!appStore.aiDataSharingAcknowledged">
              <p class="text-body-2 mb-2">
                {{
                  t('views.settings.dataSharingMessage', {
                    provider: getAIProviderLabel(appStore.aiProvider),
                  })
                }}
              </p>
              <v-btn size="small" color="warning" variant="flat" @click="showPrivacyDialog = true">
                {{ t('views.settings.reviewAndAcknowledge') }}
              </v-btn>
            </template>
            <template v-else>
              <p class="text-body-2 mb-0">
                {{ t('views.settings.acknowledgedMessage') }}
                <a
                  href="#"
                  class="text-warning"
                  @click.prevent="appStore.revokeAIDataSharingAcknowledgment()"
                  >{{ t('views.settings.revoke') }}</a
                >
              </p>
            </template>
          </v-alert>

          <p v-if="!appStore.hasAI" class="text-body-2 text-medium-emphasis mt-4 mb-0">
            {{ t('views.settings.aiNotConfiguredMessage') }}
          </p>
        </v-card-text>
      </v-card>

      <!-- Appearance -->
      <v-card rounded="lg">
        <v-card-title class="d-flex align-center">
          <v-avatar color="secondary" size="32" variant="tonal" class="mr-3">
            <v-icon size="18">mdi-palette</v-icon>
          </v-avatar>
          {{ t('settings.appearance') }}
        </v-card-title>

        <v-card-text>
          <v-select
            :model-value="appStore.locale"
            :items="localeOptions"
            item-title="name"
            item-value="code"
            :label="t('settings.language')"
            prepend-inner-icon="mdi-translate"
            density="comfortable"
            class="mb-3"
            @update:model-value="appStore.setLocale($event)"
          />

          <v-select
            :model-value="appStore.themeId"
            :items="themeOptions"
            item-title="name"
            item-value="id"
            :label="t('settings.theme')"
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
                    >({{ t('settings.darkOnly') }})</span
                  >
                </template>
              </v-list-item>
            </template>
          </v-select>

          <v-switch
            v-model="appStore.darkMode"
            :label="t('settings.darkMode')"
            color="primary"
            density="comfortable"
            hide-details
            :disabled="appStore.currentTheme.darkOnly"
          />
          <p
            v-if="appStore.currentTheme.darkOnly"
            class="text-caption text-medium-emphasis mt-1 mb-0"
          >
            {{ t('settings.darkModeOnly') }}
          </p>
        </v-card-text>
      </v-card>

      <!-- About -->
      <v-card rounded="lg">
        <v-card-title class="d-flex align-center">
          <v-avatar color="grey" size="32" variant="tonal" class="mr-3">
            <v-icon size="18">mdi-information</v-icon>
          </v-avatar>
          {{ t('settings.about') }}
        </v-card-title>

        <v-card-text>
          <div class="d-flex flex-column ga-2">
            <div class="d-flex align-center justify-space-between">
              <span class="text-body-2 text-medium-emphasis">{{ t('settings.version') }}</span>
              <span class="text-body-2 font-weight-medium">1.1.0</span>
            </div>
            <div class="d-flex align-center justify-space-between">
              <span class="text-body-2 text-medium-emphasis">{{ t('settings.license') }}</span>
              <span class="text-body-2 font-weight-medium">{{
                t('views.settings.unlicense')
              }}</span>
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
          {{ t('views.settings.privacyDialog.title') }}
        </v-card-title>
        <v-card-text>
          <v-alert type="warning" variant="tonal" class="mb-4" density="compact">
            <strong>{{ t('views.settings.privacyDialog.externalProviderDetected') }}</strong>
          </v-alert>

          <p class="text-body-2 mb-3">
            {{
              t('views.settings.privacyDialog.dataWillBeSent', {
                provider: getAIProviderLabel(appStore.aiProvider),
              })
            }}
          </p>

          <ul class="text-body-2 mb-4 ml-4">
            <li>{{ t('views.settings.privacyDialog.dataTypes.descriptions') }}</li>
            <li>{{ t('views.settings.privacyDialog.dataTypes.amounts') }}</li>
            <li>{{ t('views.settings.privacyDialog.dataTypes.accounts') }}</li>
            <li>{{ t('views.settings.privacyDialog.dataTypes.categories') }}</li>
          </ul>

          <v-alert type="info" variant="tonal" density="compact" class="mb-3">
            <span class="text-body-2">
              <strong>{{ t('views.settings.privacyDialog.privacyTip') }}:</strong>
              {{ t('views.settings.privacyDialog.privacyTipMessage') }}
            </span>
          </v-alert>

          <p class="text-body-2 mb-0">
            {{ t('views.settings.privacyDialog.acknowledgment') }}
          </p>
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-btn variant="text" @click="showPrivacyDialog = false">{{
            t('common.buttons.cancel')
          }}</v-btn>
          <v-spacer />
          <v-btn color="warning" variant="flat" @click="acknowledgeAndClose">
            {{ t('common.buttons.iUnderstand') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useAppStore } from '../stores/app';
import { useAuthStore } from '../stores/auth';
import { useSnackbar } from '../composables';
import { themes } from '../config/themes';
import type { AuthMethod } from '@shared/types/auth';

const { t } = useI18n();
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

const localeOptions = computed(() =>
  appStore.supportedLocales.map((code) => ({
    code,
    name: t(`settings.languages.${code}`),
  }))
);

function getAuthMethodLabel(method: AuthMethod): string {
  switch (method) {
    case 'basic':
      return t('common.labels.password');
    case 'oidc':
      return t('settings.authMethods.sso');
    case 'firefly':
      return t('settings.authMethods.firefly');
    default:
      return t('common.labels.unknown');
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
      return t('views.settings.openai');
    case 'ollama':
      return t('views.settings.ollama');
    case 'none':
    default:
      return t('common.labels.none');
  }
}

async function handleLogout(): Promise<void> {
  loggingOut.value = true;

  try {
    await authStore.logout();
    showSnackbar(t('views.settings.successfullySignedOut'), 'success');
    router.push('/login');
  } catch (error) {
    showSnackbar(
      error instanceof Error ? error.message : t('views.settings.failedToSignOut'),
      'error'
    );
  } finally {
    loggingOut.value = false;
  }
}

function acknowledgeAndClose(): void {
  appStore.acknowledgeAIDataSharing();
  showPrivacyDialog.value = false;
  showSnackbar(t('views.settings.acknowledgedMessage'), 'success');
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
