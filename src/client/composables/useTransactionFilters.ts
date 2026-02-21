import { computed, ref, type ComputedRef, type Ref } from 'vue';
import type { TransactionFilters, TransactionFilterType } from '@shared/types/app';

export interface TransactionFilterOption {
  title: string;
  value: string;
}

export interface AllowedTransactionFilters {
  type?: boolean;
  amount?: boolean;
  tags?: boolean;
  categories?: boolean;
  description?: boolean;
  account?: boolean;
}

export interface TransactionFilterState {
  filters: Ref<TransactionFilters>;
  activeCount: ComputedRef<number>;
  cacheKey: ComputedRef<string>;
  reset: () => void;
}

const FILTER_TYPES: TransactionFilterType[] = ['withdrawal', 'deposit', 'transfer'];

function extractString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const candidate = record.value ?? record.title;
    if (typeof candidate === 'string') return candidate;
    if (typeof candidate === 'number') return String(candidate);
  }

  return undefined;
}

function normalizeStringArray(values: unknown[] | undefined): string[] | undefined {
  if (!values || values.length === 0) return undefined;

  const normalized = [
    ...new Set(
      values
        .map(extractString)
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean)
    ),
  ];
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function normalizeAmount(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  if (value < 0) return undefined;
  return value;
}

export function normalizeTransactionFilters(filters?: TransactionFilters): TransactionFilters {
  if (!filters) return {};

  const normalized: TransactionFilters = {};

  const types = filters.types?.filter((type): type is TransactionFilterType =>
    FILTER_TYPES.includes(type)
  );
  const dedupedTypes = types ? [...new Set(types)] : undefined;
  if (dedupedTypes && dedupedTypes.length > 0) normalized.types = dedupedTypes;

  const minAmount = normalizeAmount(filters.minAmount);
  const maxAmount = normalizeAmount(filters.maxAmount);
  if (minAmount !== undefined) normalized.minAmount = minAmount;
  if (maxAmount !== undefined) normalized.maxAmount = maxAmount;

  const tagTerms = normalizeStringArray(filters.tagTerms as unknown[] | undefined);
  if (tagTerms) normalized.tagTerms = tagTerms;

  const categoryIds = normalizeStringArray(filters.categoryIds as unknown[] | undefined);
  if (categoryIds) normalized.categoryIds = categoryIds;

  const descriptionContains = normalizeText(filters.descriptionContains);
  if (descriptionContains) normalized.descriptionContains = descriptionContains;

  const accountNameContains = normalizeText(filters.accountNameContains);
  if (accountNameContains) normalized.accountNameContains = accountNameContains;

  if (
    normalized.minAmount !== undefined &&
    normalized.maxAmount !== undefined &&
    normalized.minAmount > normalized.maxAmount
  ) {
    const swappedMin = normalized.maxAmount;
    normalized.maxAmount = normalized.minAmount;
    normalized.minAmount = swappedMin;
  }

  return normalized;
}

export function countActiveTransactionFilters(filters?: TransactionFilters): number {
  const normalized = normalizeTransactionFilters(filters);

  let count = 0;
  if (normalized.types?.length) count++;
  if (normalized.minAmount !== undefined || normalized.maxAmount !== undefined) count++;
  if (normalized.tagTerms?.length) count++;
  if (normalized.categoryIds?.length) count++;
  if (normalized.descriptionContains) count++;
  if (normalized.accountNameContains) count++;
  return count;
}

export function serializeTransactionFilters(filters?: TransactionFilters): string {
  const normalized = normalizeTransactionFilters(filters);

  return JSON.stringify({
    types: normalized.types ? [...normalized.types].sort() : [],
    minAmount: normalized.minAmount ?? null,
    maxAmount: normalized.maxAmount ?? null,
    tagTerms: normalized.tagTerms ? [...normalized.tagTerms].sort() : [],
    categoryIds: normalized.categoryIds ? [...normalized.categoryIds].sort() : [],
    descriptionContains: normalized.descriptionContains ?? null,
    accountNameContains: normalized.accountNameContains ?? null,
  });
}

export function useTransactionFilters(initial?: TransactionFilters): TransactionFilterState {
  const filters = ref<TransactionFilters>(normalizeTransactionFilters(initial));

  const activeCount = computed(() => countActiveTransactionFilters(filters.value));
  const cacheKey = computed(() => serializeTransactionFilters(filters.value));

  function reset() {
    filters.value = {};
  }

  return {
    filters,
    activeCount,
    cacheKey,
    reset,
  };
}
