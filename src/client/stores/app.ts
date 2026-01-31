import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import api from '../services/api';
import type { ToolStatus } from '@shared/types/app';
import { themes, defaultThemeId, getThemeById, getVuetifyThemeName } from '../config/themes';
import {
  setLocale as setI18nLocale,
  getLocale,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from '../plugins/i18n';

interface AppStatus {
  configured: boolean;
  fireflyConnected: boolean;
  openaiConfigured: boolean;
  aiConfigured: boolean;
  aiProvider: string;
  aiModel: string;
  aiApiUrl: string;
  errors: string[];
  fireflyUrl: string;
}

export const useAppStore = defineStore(
  'app',
  () => {
    // State
    const status = ref<AppStatus | null>(null);
    const tools = ref<ToolStatus[]>([]);
    const loading = ref(false);
    const error = ref<string | null>(null);

    // Theme state (persisted)
    const themeId = ref(defaultThemeId);
    const darkMode = ref(true);

    // Locale state (persisted)
    const locale = ref<SupportedLocale>(getLocale());

    // Watch locale changes and sync with i18n
    watch(locale, (newLocale) => {
      setI18nLocale(newLocale);
    });

    // Navigation state (persisted)
    const navigationDrawer = ref(true);
    const navigationRail = ref(false);

    // Privacy acknowledgment (persisted) - user must acknowledge external AI data sharing
    const aiDataSharingAcknowledged = ref(false);

    // Getters
    const isConfigured = computed(() => status.value?.configured ?? false);
    const isConnected = computed(() => status.value?.fireflyConnected ?? false);
    const hasOpenAI = computed(() => status.value?.openaiConfigured ?? false);
    const hasAI = computed(() => status.value?.aiConfigured ?? false);
    const aiProvider = computed(() => status.value?.aiProvider ?? 'none');

    // External AI providers (like OpenAI) require user acknowledgment of data sharing
    const isExternalAIProvider = computed(() => aiProvider.value === 'openai');
    const canUseAI = computed(() => {
      if (!hasAI.value) return false;
      // Local AI (ollama) doesn't require acknowledgment
      if (!isExternalAIProvider.value) return true;
      // External AI requires acknowledgment
      return aiDataSharingAcknowledged.value;
    });
    const requiresAIAcknowledgment = computed(
      () => hasAI.value && isExternalAIProvider.value && !aiDataSharingAcknowledged.value
    );

    const availableTools = computed(() => tools.value.filter((t) => t.available));
    const unavailableTools = computed(() => tools.value.filter((t) => !t.available));

    // Theme getters
    const currentTheme = computed(
      () => getThemeById(themeId.value) ?? getThemeById(defaultThemeId)!
    );
    const availableThemes = computed(() => themes);
    const vuetifyThemeName = computed(() => getVuetifyThemeName(themeId.value, darkMode.value));

    // Locale getters
    const supportedLocales = computed(() => SUPPORTED_LOCALES);

    // Actions
    async function fetchStatus() {
      loading.value = true;
      error.value = null;

      try {
        const response = await api.get<{ success: boolean; data: AppStatus }>('/status');
        status.value = response.data.data;
      } catch (err) {
        error.value = err instanceof Error ? err.message : 'Failed to fetch status';
      } finally {
        loading.value = false;
      }
    }

    async function fetchTools() {
      try {
        const response = await api.get<{ success: boolean; data: ToolStatus[] }>('/tools');
        tools.value = response.data.data;
      } catch (err) {
        console.error('Failed to fetch tools:', err);
      }
    }

    function setTheme(id: string) {
      const theme = getThemeById(id);
      if (theme) {
        themeId.value = id;
        // Force dark mode for dark-only themes
        if (theme.darkOnly) {
          darkMode.value = true;
        }
      }
    }

    function toggleDarkMode() {
      // Prevent toggling to light mode for dark-only themes
      if (currentTheme.value.darkOnly && darkMode.value) {
        return;
      }
      darkMode.value = !darkMode.value;
    }

    function setDarkMode(value: boolean) {
      // Prevent setting light mode for dark-only themes
      if (currentTheme.value.darkOnly && !value) {
        return;
      }
      darkMode.value = value;
    }

    function setLocale(newLocale: SupportedLocale) {
      if (SUPPORTED_LOCALES.includes(newLocale)) {
        locale.value = newLocale;
      }
    }

    function toggleNavigationDrawer() {
      navigationDrawer.value = !navigationDrawer.value;
    }

    function toggleNavigationRail() {
      navigationRail.value = !navigationRail.value;
    }

    function closeNavigationDrawer() {
      navigationDrawer.value = false;
    }

    function acknowledgeAIDataSharing() {
      aiDataSharingAcknowledged.value = true;
    }

    function revokeAIDataSharingAcknowledgment() {
      aiDataSharingAcknowledged.value = false;
    }

    return {
      // State
      status,
      tools,
      loading,
      error,
      themeId,
      darkMode,
      locale,
      navigationDrawer,
      navigationRail,
      aiDataSharingAcknowledged,

      // Getters
      isConfigured,
      isConnected,
      hasOpenAI,
      hasAI,
      aiProvider,
      isExternalAIProvider,
      canUseAI,
      requiresAIAcknowledgment,
      availableTools,
      unavailableTools,
      currentTheme,
      availableThemes,
      vuetifyThemeName,
      supportedLocales,

      // Actions
      fetchStatus,
      fetchTools,
      setTheme,
      toggleDarkMode,
      setDarkMode,
      setLocale,
      toggleNavigationDrawer,
      toggleNavigationRail,
      closeNavigationDrawer,
      acknowledgeAIDataSharing,
      revokeAIDataSharingAcknowledgment,
    };
  },
  {
    persist: {
      key: 'toolbox-for-firefly-iii-settings',
      pick: [
        'themeId',
        'darkMode',
        'locale',
        'navigationDrawer',
        'navigationRail',
        'aiDataSharingAcknowledged',
      ],
    },
  }
);
