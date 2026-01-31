<template>
  <v-tooltip :location="location" content-class="confidence-tooltip">
    <template #activator="{ props: activatorProps }">
      <span v-bind="activatorProps">
        <ConfidenceChip :score="score" class="cursor-pointer" />
      </span>
    </template>
    <v-card class="confidence-breakdown-card" rounded="lg" elevation="0" border="0">
      <v-card-title class="text-subtitle-2 pb-1">{{
        t('common.labels.confidenceBreakdown')
      }}</v-card-title>
      <v-card-text class="pt-0">
        <div
          v-for="item in items"
          :key="item.label"
          class="breakdown-row d-flex justify-space-between"
          :class="{ 'text-medium-emphasis': item.muted }"
        >
          <span>{{ item.label }}</span>
          <span class="ml-4 text-right breakdown-value">
            {{ formatValue(item.value) }}
            <template v-if="item.max !== undefined">/ {{ formatMax(item.max) }}</template>
          </span>
        </div>
        <v-divider class="my-2" />
        <div class="breakdown-row d-flex justify-space-between font-weight-bold">
          <span>{{ t('common.labels.total') }}</span>
          <span class="ml-4 text-right breakdown-value">
            {{ formatValue(itemsTotal) }}
            <template v-if="itemsMaxTotal !== undefined">/ {{ formatMax(itemsMaxTotal) }}</template>
          </span>
        </div>
      </v-card-text>
    </v-card>
  </v-tooltip>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import ConfidenceChip from './ConfidenceChip.vue';

const { t } = useI18n();

export interface BreakdownItem {
  /** Label for this breakdown item */
  label: string;
  /** Current value (0-1 scale) */
  value: number;
  /** Maximum possible value (0-1 scale) */
  max?: number;
  /** Whether to show in muted style (for optional/bonus items) */
  muted?: boolean;
}

interface Props {
  /** Total confidence score (0-1 scale) - shown in the chip */
  score: number;
  /** Individual breakdown items */
  items: BreakdownItem[];
  /** Tooltip location */
  location?: 'top' | 'bottom' | 'left' | 'right';
}

const props = withDefaults(defineProps<Props>(), {
  location: 'left',
});

// Compute totals from items so breakdown always adds up correctly
const itemsTotal = computed(() => props.items.reduce((sum, item) => sum + item.value, 0));

const itemsMaxTotal = computed(() => props.items.reduce((sum, item) => sum + (item.max ?? 0), 0));

function formatValue(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatMax(max: number): string {
  return `${Math.round(max * 100)}%`;
}
</script>

<style scoped>
.confidence-breakdown-card {
  min-width: 220px;
}

.breakdown-row {
  padding: 2px 0;
  font-size: 0.8125rem;
}

.breakdown-value {
  font-variant-numeric: tabular-nums;
  min-width: 80px;
}
</style>

<style>
/* Unscoped to target the tooltip container which renders outside this component */
.confidence-tooltip {
  background: transparent !important;
  padding: 0 !important;
}
</style>
