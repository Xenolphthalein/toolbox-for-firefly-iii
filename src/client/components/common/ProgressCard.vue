<template>
  <v-card v-if="show" rounded="lg" class="mb-4">
    <v-card-text>
      <div class="d-flex align-center justify-space-between mb-2">
        <span class="text-body-2">
          <v-icon v-if="icon" class="mr-1" size="small">{{ icon }}</v-icon>
          {{ message }}
        </span>
        <span class="text-body-2 text-medium-emphasis"> {{ current }} / {{ total }} </span>
      </div>
      <v-progress-linear :model-value="percent" :color="color" height="8" rounded />
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    show?: boolean;
    current: number;
    total: number;
    message?: string;
    icon?: string;
    color?: string;
  }>(),
  {
    show: true,
    message: 'Processing...',
    icon: undefined,
    color: 'primary',
  }
);

const percent = computed(() => {
  if (props.total === 0) return 0;
  return Math.round((props.current / props.total) * 100);
});
</script>
