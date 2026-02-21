<template>
  <div class="d-flex flex-column h-100">
    <v-card class="flex-shrink-0" rounded="lg">
      <v-card-text>
        <DateRangeFilter
          v-model:start-date="startDateModel"
          v-model:end-date="endDateModel"
          v-model:filters="filtersModel"
          :presets="presets"
          :allowed-filters="allowedFilters"
          :available-tags="availableTags"
          :available-categories="availableCategories"
          @change="$emit('change')"
        />

        <slot name="options" />
      </v-card-text>
    </v-card>

    <!-- Transaction Preview -->
    <TransactionPreview
      :transactions="transactions"
      :count="count"
      :loading="loading"
      :loading-more="loadingMore"
      :loading-text="resolvedLoadingText"
      class="mt-4"
      @load-more="$emit('load-more')"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import DateRangeFilter from './DateRangeFilter.vue';
import TransactionPreview from './TransactionPreview.vue';
import type { TransactionFilters } from '@shared/types/app';
import type { FireflyTransactionSplit } from '@shared/types/firefly';
import type {
  AllowedTransactionFilters,
  TransactionFilterOption,
} from '../../composables/useTransactionFilters';

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    startDate?: string;
    endDate?: string;
    transactions: FireflyTransactionSplit[];
    count: number;
    loading?: boolean;
    loadingMore?: boolean;
    loadingText?: string;
    presets?: ('week' | 'month' | 'quarter' | 'year')[];
    filters?: TransactionFilters;
    allowedFilters?: AllowedTransactionFilters;
    availableTags?: TransactionFilterOption[];
    availableCategories?: TransactionFilterOption[];
  }>(),
  {
    startDate: undefined,
    endDate: undefined,
    loading: false,
    loadingMore: false,
    loadingText: undefined,
    presets: () => ['week', 'month', 'quarter'],
    filters: () => ({}),
    allowedFilters: () => ({}),
    availableTags: () => [],
    availableCategories: () => [],
  }
);

const emit = defineEmits<{
  'update:startDate': [value: string | undefined];
  'update:endDate': [value: string | undefined];
  'update:filters': [value: TransactionFilters];
  change: [];
  'load-more': [];
}>();

const resolvedLoadingText = computed(
  () => props.loadingText ?? t('common.status.fetchingTransactions')
);

const startDateModel = computed({
  get: () => props.startDate,
  set: (value) => emit('update:startDate', value),
});

const endDateModel = computed({
  get: () => props.endDate,
  set: (value) => emit('update:endDate', value),
});

const filtersModel = computed({
  get: () => props.filters,
  set: (value) => emit('update:filters', value ?? {}),
});
</script>
