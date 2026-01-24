<template>
  <v-chip :color="chipColor" :variant="variant" size="small" class="confidence-chip">
    <v-icon start size="small">{{ icon }}</v-icon>
    {{ formattedScore }}
  </v-chip>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  score: number;
  variant?: 'flat' | 'outlined' | 'text' | 'tonal';
  showPercentage?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'tonal',
  showPercentage: true,
});

const chipColor = computed(() => {
  if (props.score >= 0.8) return 'success';
  if (props.score >= 0.5) return 'warning';
  return 'error';
});

const icon = computed(() => {
  if (props.score >= 0.8) return 'mdi-check-circle';
  if (props.score >= 0.5) return 'mdi-alert-circle';
  return 'mdi-close-circle';
});

const formattedScore = computed(() => {
  if (props.showPercentage) {
    return `${Math.round(props.score * 100)}%`;
  }
  return props.score.toFixed(2);
});
</script>
