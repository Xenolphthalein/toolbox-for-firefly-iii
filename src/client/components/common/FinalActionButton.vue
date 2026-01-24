<template>
  <v-btn
    v-if="!hasRun"
    color="primary"
    :prepend-icon="icon"
    :loading="loading"
    @click="$emit('click')"
  >
    {{ text }}
  </v-btn>
  <v-btn
    v-else
    color="primary"
    variant="outlined"
    :prepend-icon="rerunIcon"
    :loading="loading"
    @click="$emit('click')"
  >
    {{ rerunText }}
  </v-btn>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    /** Whether the action has been run at least once */
    hasRun?: boolean;
    /** Primary action text */
    text?: string;
    /** Re-run action text */
    rerunText?: string;
    /** Icon for primary action */
    icon?: string;
    /** Icon for re-run action */
    rerunIcon?: string;
    /** Whether action is loading */
    loading?: boolean;
  }>(),
  {
    hasRun: false,
    text: 'Run',
    rerunText: 'Re-run',
    icon: 'mdi-play',
    rerunIcon: 'mdi-refresh',
    loading: false,
  }
);

defineEmits<{
  click: [];
}>();
</script>
