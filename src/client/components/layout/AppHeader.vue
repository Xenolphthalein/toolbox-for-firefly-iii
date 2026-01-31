<template>
  <v-app-bar elevation="0" border="b">
    <v-app-bar-nav-icon @click="toggleNavigation" />

    <div class="d-flex flex-column justify-center">
      <div class="d-flex align-center">
        <v-app-bar-title class="text-body-1 font-weight-medium">
          {{ currentPageTitle }}
        </v-app-bar-title>
        <v-btn
          v-if="currentPageDescription && mobile"
          icon
          variant="text"
          size="x-small"
          class="ml-1"
          @click="showHelp = true"
        >
          <v-icon size="small">mdi-help-circle-outline</v-icon>
        </v-btn>
      </div>
      <div
        v-if="currentPageDescription && !mobile"
        class="text-caption text-medium-emphasis"
        style="line-height: 1.2"
      >
        {{ currentPageDescription }}
      </div>
    </div>

    <v-spacer />

    <v-tooltip location="bottom">
      <template #activator="{ props }">
        <v-icon v-bind="props" :color="appStore.isConnected ? 'success' : 'error'" class="mr-2">
          {{ appStore.isConnected ? 'mdi-check-circle' : 'mdi-alert-circle' }}
        </v-icon>
      </template>
      {{
        appStore.isConnected
          ? t('components.appHeader.connectedToFirefly')
          : t('components.appHeader.disconnectedFromFirefly')
      }}
    </v-tooltip>

    <v-btn icon variant="text" @click="appStore.toggleDarkMode">
      <v-icon>{{ appStore.darkMode ? 'mdi-weather-sunny' : 'mdi-weather-night' }}</v-icon>
      <v-tooltip activator="parent" location="bottom">
        {{
          appStore.darkMode
            ? t('components.appHeader.lightMode')
            : t('components.appHeader.darkMode')
        }}
      </v-tooltip>
    </v-btn>

    <v-btn icon variant="text" :href="fireflyUrl" target="_blank" :disabled="!fireflyUrl">
      <v-icon>mdi-open-in-new</v-icon>
      <v-tooltip activator="parent" location="bottom">
        {{ t('components.appHeader.openFirefly') }}
      </v-tooltip>
    </v-btn>

    <v-menu>
      <template #activator="{ props }">
        <v-btn icon variant="text" v-bind="props">
          <v-icon>mdi-dots-vertical</v-icon>
        </v-btn>
      </template>

      <v-list density="compact">
        <v-list-item
          prepend-icon="mdi-github"
          :title="t('common.buttons.viewOnGitHub')"
          href="https://github.com/xenolphthalein/toolbox-for-firefly-iii"
          target="_blank"
        />
        <v-list-item
          prepend-icon="mdi-bug-outline"
          :title="t('common.buttons.foundBug')"
          href="https://github.com/xenolphthalein/toolbox-for-firefly-iii/issues"
          target="_blank"
        />
        <v-divider v-if="authStore.isAuthenticated" />
        <v-list-item
          v-if="authStore.isAuthenticated"
          prepend-icon="mdi-logout"
          :title="t('common.buttons.signOut')"
          @click="handleLogout"
        />
      </v-list>
    </v-menu>

    <!-- Help Dialog -->
    <v-dialog v-model="showHelp" max-width="400">
      <v-card rounded="lg">
        <v-card-title class="d-flex align-center">
          <v-icon color="primary" class="mr-2">mdi-help-circle</v-icon>
          {{ currentPageTitle }}
        </v-card-title>
        <v-card-text>
          {{ currentPageDescription }}
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showHelp = false">{{ t('common.buttons.close') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-app-bar>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDisplay } from 'vuetify';
import { useI18n } from 'vue-i18n';
import { useAppStore } from '../../stores/app';
import { useAuthStore } from '../../stores/auth';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const appStore = useAppStore();
const authStore = useAuthStore();
const { mobile } = useDisplay();
const showHelp = ref(false);

const currentPageTitle = computed(() => {
  const titleKey = route.meta.titleKey as string | undefined;
  if (titleKey) {
    return t(titleKey);
  }
  return (route.meta.title as string) || t('app.title');
});

const currentPageDescription = computed(() => {
  const descriptionKey = route.meta.descriptionKey as string | undefined;
  if (descriptionKey) {
    return t(descriptionKey);
  }
  return (route.meta.description as string) || '';
});

const fireflyUrl = computed(() => appStore.status?.fireflyUrl || '');

function toggleNavigation() {
  if (mobile.value) {
    appStore.toggleNavigationDrawer();
  } else {
    appStore.toggleNavigationRail();
  }
}

async function handleLogout() {
  await authStore.logout();
  router.push('/login');
}
</script>
