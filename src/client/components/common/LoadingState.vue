<template>
  <div class="text-center py-12">
    <v-progress-circular :size="64" :width="6" color="primary" indeterminate class="mb-4" />
    <h3 class="text-h6 mb-2">{{ title }}</h3>
    <p v-if="subtitle" class="text-body-2 text-medium-emphasis">{{ subtitle }}</p>
  </div>
</template>

<script setup lang="ts">
interface Props {
  title?: string;
  subtitle?: string;
}

withDefaults(defineProps<Props>(), {
  title: 'Loading...',
  subtitle: '',
});
</script>
