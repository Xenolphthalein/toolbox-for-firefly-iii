<template>
  <div class="text-center py-12 empty-state">
    <v-icon :size="64" class="mb-4 empty-state-icon">
      {{ icon }}
    </v-icon>
    <h3 class="text-h6 empty-state-title mb-2">
      {{ title || t('components.emptyState.noDataFound') }}
    </h3>
    <p v-if="subtitle" class="text-body-2 text-medium-emphasis">{{ subtitle }}</p>
    <slot />
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

interface Props {
  icon?: string;
  title?: string;
  subtitle?: string;
}

withDefaults(defineProps<Props>(), {
  icon: 'mdi-inbox-outline',
  title: undefined,
  subtitle: '',
});
</script>

<style scoped>
.empty-state-icon {
  opacity: 0.4;
  color: rgb(var(--v-theme-on-surface));
}

.empty-state-title {
  opacity: 0.6;
  color: rgb(var(--v-theme-on-surface));
}
</style>
