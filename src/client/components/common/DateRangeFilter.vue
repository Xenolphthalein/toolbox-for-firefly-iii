<template>
  <div>
    <v-row align="center">
      <v-col cols="12" sm="6" md="3">
        <v-text-field
          v-model="localStartDate"
          :label="t('common.labels.startDate')"
          type="date"
          prepend-inner-icon="mdi-calendar"
          clearable
          variant="outlined"
          density="compact"
          hide-details
          @update:model-value="emitChange"
        />
      </v-col>
      <v-col cols="12" sm="6" md="3">
        <v-text-field
          v-model="localEndDate"
          :label="t('common.labels.endDate')"
          type="date"
          prepend-inner-icon="mdi-calendar"
          clearable
          variant="outlined"
          density="compact"
          hide-details
          @update:model-value="emitChange"
        />
      </v-col>
      <v-col cols="12" md="6" class="d-flex flex-wrap ga-2 justify-end">
        <v-btn-group variant="outlined" density="comfortable">
          <v-btn v-for="preset in relativePresets" :key="preset" @click="setPreset(preset)">
            {{ presetLabels[preset] }}
          </v-btn>
        </v-btn-group>
        <v-btn-group variant="outlined" density="comfortable">
          <v-btn @click="setPreset('thisYear')">{{ currentYear }}</v-btn>
          <v-btn @click="setPreset('lastYear')">{{ currentYear - 1 }}</v-btn>
          <v-btn @click="setPreset('twoYearsAgo')">{{ currentYear - 2 }}</v-btn>
        </v-btn-group>
      </v-col>
    </v-row>

    <template v-if="hasAdvancedFilters">
      <div class="d-flex align-center justify-space-between mt-3">
        <div class="d-flex align-center ga-2 flex-wrap">
          <v-chip size="small" color="primary" variant="tonal">
            {{ t('components.dateRangeFilter.activeFilters', { count: activeFilterCount }) }}
          </v-chip>
          <v-btn
            v-if="activeFilterCount > 0"
            size="small"
            variant="text"
            @click="clearAdvancedFilters"
          >
            {{ t('components.dateRangeFilter.clearFilters') }}
          </v-btn>
        </div>
        <v-btn
          size="small"
          variant="text"
          :prepend-icon="showAdvancedFilters ? 'mdi-chevron-up' : 'mdi-chevron-down'"
          @click="showAdvancedFilters = !showAdvancedFilters"
        >
          {{
            showAdvancedFilters
              ? t('components.dateRangeFilter.hideFilters')
              : t('components.dateRangeFilter.showFilters')
          }}
        </v-btn>
      </div>

      <v-expand-transition>
        <div v-if="showAdvancedFilters" class="mt-3">
          <v-row>
            <v-col v-if="allowedFilters.type" cols="12" md="6">
              <v-select
                :model-value="localFilters.types ?? []"
                :items="transactionTypeItems"
                item-title="title"
                item-value="value"
                :label="t('components.dateRangeFilter.transactionTypes')"
                multiple
                chips
                clearable
                variant="outlined"
                density="compact"
                hide-details
                @update:model-value="setTypes"
              />
            </v-col>

            <template v-if="allowedFilters.amount">
              <v-col cols="12" sm="6" md="3">
                <v-text-field
                  :model-value="localFilters.minAmount"
                  :label="t('common.labels.minimumAmount')"
                  type="number"
                  min="0"
                  step="0.01"
                  variant="outlined"
                  density="compact"
                  hide-details
                  @update:model-value="setMinAmount"
                />
              </v-col>
              <v-col cols="12" sm="6" md="3">
                <v-text-field
                  :model-value="localFilters.maxAmount"
                  :label="t('common.labels.maximumAmount')"
                  type="number"
                  min="0"
                  step="0.01"
                  variant="outlined"
                  density="compact"
                  hide-details
                  @update:model-value="setMaxAmount"
                />
              </v-col>
            </template>

            <v-col v-if="allowedFilters.tags" cols="12" md="6">
              <v-combobox
                :model-value="localFilters.tagTerms ?? []"
                :items="availableTags"
                item-title="title"
                item-value="value"
                :label="t('components.dateRangeFilter.tagsContain')"
                multiple
                chips
                clearable
                variant="outlined"
                density="compact"
                hide-details
                @update:model-value="setTagTerms"
              />
            </v-col>

            <v-col v-if="allowedFilters.categories" cols="12" md="6">
              <v-select
                :model-value="localFilters.categoryIds ?? []"
                :items="availableCategories"
                item-title="title"
                item-value="value"
                :label="t('components.dateRangeFilter.inCategories')"
                multiple
                chips
                clearable
                variant="outlined"
                density="compact"
                hide-details
                @update:model-value="setCategoryIds"
              />
            </v-col>

            <v-col v-if="allowedFilters.description" cols="12" md="6">
              <v-text-field
                :model-value="localFilters.descriptionContains"
                :label="t('components.dateRangeFilter.descriptionContains')"
                prepend-inner-icon="mdi-text-search"
                clearable
                variant="outlined"
                density="compact"
                hide-details
                @update:model-value="setDescriptionContains"
              />
            </v-col>

            <v-col v-if="allowedFilters.account" cols="12" md="6">
              <v-text-field
                :model-value="localFilters.accountNameContains"
                :label="t('components.dateRangeFilter.accountContains')"
                prepend-inner-icon="mdi-bank"
                clearable
                variant="outlined"
                density="compact"
                hide-details
                @update:model-value="setAccountNameContains"
              />
            </v-col>
          </v-row>
        </div>
      </v-expand-transition>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { TransactionFilters, TransactionFilterType } from '@shared/types/app';
import {
  countActiveTransactionFilters,
  normalizeTransactionFilters,
  type AllowedTransactionFilters,
  type TransactionFilterOption,
} from '../../composables/useTransactionFilters';

const { t } = useI18n();

type RelativePreset = 'week' | 'month' | 'quarter' | 'year';
type YearPreset = 'thisYear' | 'lastYear' | 'twoYearsAgo';
type Preset = RelativePreset | YearPreset;

interface Props {
  startDate?: string;
  endDate?: string;
  presets?: RelativePreset[];
  filters?: TransactionFilters;
  allowedFilters?: AllowedTransactionFilters;
  availableTags?: TransactionFilterOption[];
  availableCategories?: TransactionFilterOption[];
}

const props = withDefaults(defineProps<Props>(), {
  startDate: undefined,
  endDate: undefined,
  presets: () => ['week', 'month', 'quarter'],
  filters: () => ({}),
  allowedFilters: () => ({}),
  availableTags: () => [],
  availableCategories: () => [],
});

const emit = defineEmits<{
  'update:startDate': [value: string | undefined];
  'update:endDate': [value: string | undefined];
  'update:filters': [value: TransactionFilters];
  change: [{ startDate?: string; endDate?: string; filters: TransactionFilters }];
}>();

const localStartDate = ref(props.startDate);
const localEndDate = ref(props.endDate);
const localFilters = ref<TransactionFilters>(normalizeTransactionFilters(props.filters));
const currentYear = new Date().getFullYear();
const showAdvancedFilters = ref(false);

const relativePresets = computed(() => props.presets);

const hasAdvancedFilters = computed(() =>
  Object.values(props.allowedFilters).some((enabled) => enabled)
);

const activeFilterCount = computed(() => countActiveTransactionFilters(localFilters.value));

const presetLabels = computed<Record<RelativePreset, string>>(() => ({
  week: t('components.dateRangeFilter.presets.week'),
  month: t('components.dateRangeFilter.presets.month'),
  quarter: t('components.dateRangeFilter.presets.quarter'),
  year: t('components.dateRangeFilter.presets.year'),
}));

const transactionTypeItems = computed<Array<{ title: string; value: TransactionFilterType }>>(
  () => [
    {
      title: t('components.dateRangeFilter.transactionTypeOptions.withdrawal'),
      value: 'withdrawal',
    },
    {
      title: t('components.dateRangeFilter.transactionTypeOptions.deposit'),
      value: 'deposit',
    },
    {
      title: t('components.dateRangeFilter.transactionTypeOptions.transfer'),
      value: 'transfer',
    },
  ]
);

watch(
  () => props.startDate,
  (val) => (localStartDate.value = val)
);

watch(
  () => props.endDate,
  (val) => (localEndDate.value = val)
);

watch(
  () => props.filters,
  (val) => {
    localFilters.value = normalizeTransactionFilters(val);
    if (countActiveTransactionFilters(localFilters.value) > 0) {
      showAdvancedFilters.value = true;
    }
  },
  { deep: true, immediate: true }
);

watch(
  () => hasAdvancedFilters.value,
  (enabled) => {
    if (!enabled) showAdvancedFilters.value = false;
  },
  { immediate: true }
);

function emitChange() {
  const normalizedFilters = normalizeTransactionFilters(localFilters.value);
  localFilters.value = normalizedFilters;

  emit('update:startDate', localStartDate.value || undefined);
  emit('update:endDate', localEndDate.value || undefined);
  emit('update:filters', normalizedFilters);
  emit('change', {
    startDate: localStartDate.value || undefined,
    endDate: localEndDate.value || undefined,
    filters: normalizedFilters,
  });
}

function parseOptionalNumber(value: string | number | null | undefined): number | undefined {
  if (value === '' || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return parsed;
}

function updateFilters(patch: Partial<TransactionFilters>) {
  localFilters.value = normalizeTransactionFilters({
    ...localFilters.value,
    ...patch,
  });
  emitChange();
}

function clearAdvancedFilters() {
  localFilters.value = {};
  emitChange();
}

function setTypes(value: unknown) {
  updateFilters({ types: Array.isArray(value) ? (value as TransactionFilterType[]) : undefined });
}

function setMinAmount(value: string | number | null) {
  updateFilters({ minAmount: parseOptionalNumber(value) });
}

function setMaxAmount(value: string | number | null) {
  updateFilters({ maxAmount: parseOptionalNumber(value) });
}

function setTagTerms(value: unknown) {
  updateFilters({ tagTerms: Array.isArray(value) ? (value as string[]) : undefined });
}

function setCategoryIds(value: unknown) {
  updateFilters({ categoryIds: Array.isArray(value) ? (value as string[]) : undefined });
}

function setDescriptionContains(value: string | null) {
  updateFilters({ descriptionContains: value ?? undefined });
}

function setAccountNameContains(value: string | null) {
  updateFilters({ accountNameContains: value ?? undefined });
}

function setPreset(preset: Preset) {
  const end = new Date();
  const start = new Date();

  switch (preset) {
    case 'week':
      start.setDate(end.getDate() - 7);
      break;
    case 'month':
      start.setMonth(end.getMonth() - 1);
      break;
    case 'quarter':
      start.setMonth(end.getMonth() - 3);
      break;
    case 'year':
      start.setFullYear(end.getFullYear() - 1);
      break;
    case 'thisYear':
      start.setFullYear(currentYear, 0, 1);
      end.setFullYear(currentYear, 11, 31);
      break;
    case 'lastYear':
      start.setFullYear(currentYear - 1, 0, 1);
      end.setFullYear(currentYear - 1, 11, 31);
      break;
    case 'twoYearsAgo':
      start.setFullYear(currentYear - 2, 0, 1);
      end.setFullYear(currentYear - 2, 11, 31);
      break;
  }

  localStartDate.value = start.toISOString().split('T')[0];
  localEndDate.value = end.toISOString().split('T')[0];
  emitChange();
}
</script>
