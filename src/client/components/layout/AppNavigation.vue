<template>
  <v-navigation-drawer
    v-model="appStore.navigationDrawer"
    :rail="!mobile && appStore.navigationRail"
    :temporary="mobile"
    :permanent="!mobile"
  >
    <div class="d-flex align-center overflow-hidden" style="height: 64px">
      <v-list-item class="pl-3 pr-4 py-4 flex-grow-1">
        <template #prepend>
          <v-img :src="logoSrc" alt="Logo" width="32" height="32" class="mr-7" />
        </template>
        <v-list-item-title class="text-subtitle-1 font-weight-bold text-no-wrap">
          FireflyIII Toolbox
        </v-list-item-title>
      </v-list-item>
    </div>

    <v-divider />

    <v-list density="compact" nav>
      <v-list-item
        v-for="item in navigationItems"
        :key="item.route"
        :to="item.route"
        :prepend-icon="item.icon"
        :title="item.title"
        :subtitle="item.subtitle"
        :disabled="item.disabled"
        rounded="lg"
        class="my-1"
        @click="mobile && appStore.closeNavigationDrawer()"
      >
        <template v-if="item.requiresAI && !appStore.hasAI" #append>
          <v-tooltip text="Requires AI configuration (OpenAI or Ollama)">
            <template #activator="{ props }">
              <v-icon v-bind="props" size="small" color="warning">mdi-alert</v-icon>
            </template>
          </v-tooltip>
        </template>
      </v-list-item>
    </v-list>

    <template #append>
      <v-divider />
      <v-list density="compact" nav>
        <v-list-item
          to="/settings"
          prepend-icon="mdi-cog"
          title="Settings"
          rounded="lg"
          @click="mobile && appStore.closeNavigationDrawer()"
        />
      </v-list>
    </template>
  </v-navigation-drawer>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useDisplay } from 'vuetify';
import { useAppStore } from '../../stores/app';
import { useTools } from '../../composables';

const appStore = useAppStore();
const { tools } = useTools();
const { mobile } = useDisplay();

const logoSrc = computed(() => (appStore.darkMode ? '/logo.png' : '/logo_light_mode.png'));

const navigationItems = computed(() => [
  {
    title: 'Dashboard',
    subtitle: 'Overview',
    icon: 'mdi-view-dashboard',
    route: '/',
    disabled: false,
    requiresAI: false,
  },
  ...tools.value.map((tool) => ({
    title: tool.title,
    subtitle: tool.subtitle,
    icon: tool.icon,
    route: tool.route,
    disabled: tool.disabled,
    requiresAI: tool.requiresAI,
  })),
]);
</script>
