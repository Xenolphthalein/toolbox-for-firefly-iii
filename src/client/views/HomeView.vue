<template>
  <div class="home-view">
    <!-- Hero Section -->
    <div class="hero-section mb-6">
      <div class="hero-content">
        <div class="d-flex align-center">
          <div class="hero-icon mr-4">
            <v-img src="/logo.png" :alt="t('app.title')" width="56" height="56" />
          </div>
          <div>
            <h1 class="text-h4 text-md-h3 font-weight-bold text-white">{{ t('app.title') }}</h1>
            <p class="text-subtitle-1 text-white-secondary mt-1">
              {{ t('views.home.subtitle') }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Status Cards -->
    <div class="status-grid mb-6">
      <v-card variant="tonal" rounded="lg" :color="appStore.isConnected ? 'success' : 'error'">
        <v-card-text class="d-flex align-center pa-4">
          <v-icon size="32" class="mr-3">
            {{ appStore.isConnected ? 'mdi-check-circle' : 'mdi-close-circle' }}
          </v-icon>
          <div class="flex-grow-1">
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
          <v-btn
            v-if="!appStore.isConnected"
            variant="text"
            size="small"
            color="error"
            to="/settings"
          >
            {{ t('common.buttons.showWhy') }}
          </v-btn>
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
              {{ appStore.hasAI ? t('common.status.available') : t('common.status.notConfigured') }}
            </div>
          </div>
        </v-card-text>
      </v-card>

      <v-card variant="tonal" rounded="lg" color="primary">
        <v-card-text class="d-flex align-center pa-4">
          <v-icon size="32" class="mr-3">mdi-tools</v-icon>
          <div>
            <div class="text-caption text-uppercase font-weight-medium">
              {{ t('views.home.statusCards.toolsReady') }}
            </div>
            <div class="text-body-1 font-weight-bold">
              {{ availableTools.length }} / {{ tools.length }}
            </div>
          </div>
        </v-card-text>
      </v-card>
    </div>

    <!-- Tools Grid -->
    <h2 class="text-h6 font-weight-bold mb-4 d-flex align-center">
      <v-icon class="mr-2" size="20">mdi-view-grid</v-icon>
      {{ t('views.home.availableTools') }}
    </h2>
    <div class="tools-grid">
      <v-card
        v-for="tool in toolCards"
        :key="tool.name"
        :to="tool.disabled ? undefined : tool.route"
        class="tool-card h-100"
        :class="{ 'tool-card--disabled': tool.disabled }"
        :hover="!tool.disabled"
        rounded="lg"
      >
        <v-card-text class="pa-4">
          <div class="d-flex align-center mb-3">
            <v-avatar
              :color="tool.disabled ? 'grey' : tool.color"
              size="44"
              class="mr-3"
              variant="tonal"
            >
              <v-icon :color="tool.disabled ? 'grey' : tool.color">{{ tool.icon }}</v-icon>
            </v-avatar>
            <div class="flex-grow-1">
              <h3 class="text-subtitle-1 font-weight-bold">{{ t(tool.title) }}</h3>
              <v-chip
                v-if="tool.aiRequired"
                size="x-small"
                :color="tool.disabled ? 'grey' : 'info'"
                variant="flat"
                class="mt-1"
              >
                <v-icon start size="10">mdi-robot</v-icon>
                {{ t('views.home.aiFeatureTag') }}
              </v-chip>
            </div>
            <v-icon v-if="!tool.disabled" size="20" color="primary">mdi-arrow-right</v-icon>
            <v-tooltip v-else location="top">
              <template #activator="{ props }">
                <v-icon v-bind="props" size="20" color="grey">mdi-lock</v-icon>
              </template>
              {{ t(tool.disabledReason) }}
            </v-tooltip>
          </div>
          <p class="text-body-2 text-medium-emphasis mb-0">
            {{ t(tool.description) }}
          </p>
        </v-card-text>
      </v-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAppStore } from '../stores/app';
import { useTools } from '../composables';

const { t } = useI18n();
const appStore = useAppStore();
const { tools, availableTools } = useTools();

const toolCards = computed(() =>
  tools.value.map((tool) => ({
    name: tool.id,
    title: tool.title,
    description: tool.description,
    icon: tool.icon,
    color: tool.color,
    route: tool.route,
    aiRequired: tool.requiresAI,
    disabled: tool.disabled,
    disabledReason: tool.disabledReason,
  }))
);
</script>

<style scoped>
.home-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  padding: 16px;
}

.hero-section {
  background: linear-gradient(
    135deg,
    rgb(var(--v-theme-primary)) 0%,
    rgb(var(--v-theme-secondary)) 100%
  );
  border-radius: 12px;
  padding: 24px;
  position: relative;
  overflow: hidden;
  z-index: 1;
  flex-shrink: 0;
}

.hero-section::before {
  content: '';
  position: absolute;
  top: -50%;
  right: -20%;
  width: 300px;
  height: 300px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 50%;
}

.hero-section::after {
  content: '';
  position: absolute;
  bottom: -30%;
  left: -10%;
  width: 200px;
  height: 200px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 50%;
}

.hero-content {
  position: relative;
  z-index: 1;
}

.hero-icon {
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.text-white-secondary {
  color: rgba(255, 255, 255, 0.8);
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
  position: relative;
  z-index: 0;
}

.tools-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.tool-card {
  transition: transform 0.2s ease;
}

.tool-card:hover:not(.tool-card--disabled) {
  transform: translateY(-2px);
}

.tool-card--disabled {
  filter: grayscale(0.5);
  opacity: 0.7;
  cursor: not-allowed;
}
</style>
