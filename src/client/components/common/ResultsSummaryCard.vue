<template>
  <v-card class="mb-4" rounded="lg">
    <v-card-text class="d-flex align-center justify-space-between flex-wrap ga-4">
      <div class="d-flex align-center ga-4">
        <slot name="stats">
          <v-chip v-for="stat in stats" :key="stat.label" :color="stat.color" variant="tonal">
            <v-icon v-if="stat.icon" start>{{ stat.icon }}</v-icon>
            <template v-if="stat.value !== undefined">{{ stat.value }}&nbsp;</template
            >{{ stat.label }}
          </v-chip>
        </slot>
      </div>
      <div class="d-flex align-center ga-2">
        <slot name="actions">
          <v-btn
            v-if="showSelectAll && selectableCount > 0"
            variant="text"
            size="small"
            @click="$emit('toggle-select-all')"
          >
            {{
              allSelected
                ? t('common.buttons.deselectAll')
                : selectAllText || t('common.buttons.selectAll')
            }}
          </v-btn>
          <v-btn
            v-if="selectedCount > 0"
            :color="actionColor"
            :prepend-icon="actionIcon"
            :loading="actionLoading"
            @click="$emit('action')"
          >
            {{ actionText }} ({{ selectedCount }})
          </v-btn>
        </slot>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
export interface StatItem {
  label: string;
  value?: number | string;
  color?: string;
  icon?: string;
}

withDefaults(
  defineProps<{
    /** Stats to display as chips */
    stats?: StatItem[];
    /** Whether to show select all button */
    showSelectAll?: boolean;
    /** Number of selectable items */
    selectableCount?: number;
    /** Whether all items are selected */
    allSelected?: boolean;
    /** Number of selected items */
    selectedCount?: number;
    /** Text for select all button */
    selectAllText?: string;
    /** Text for action button */
    actionText?: string;
    /** Color for action button */
    actionColor?: string;
    /** Icon for action button */
    actionIcon?: string;
    /** Whether action is loading */
    actionLoading?: boolean;
  }>(),
  {
    stats: () => [],
    showSelectAll: true,
    selectableCount: 0,
    allSelected: false,
    selectedCount: 0,
    selectAllText: undefined,
    actionText: undefined,
    actionColor: 'success',
    actionIcon: 'mdi-check-all',
    actionLoading: false,
  }
);

defineEmits<{
  'toggle-select-all': [];
  action: [];
}>();
</script>
