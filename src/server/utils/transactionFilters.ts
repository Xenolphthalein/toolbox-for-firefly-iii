import type { TransactionFilters, TransactionFilterType } from '../../shared/types/app.js';
import type { FireflyTransaction, FireflyTransactionSplit } from '../../shared/types/firefly.js';

const FILTER_TYPES: TransactionFilterType[] = ['withdrawal', 'deposit', 'transfer'];

function normalizeStringArray(values: string[] | undefined): string[] | undefined {
  if (!values || values.length === 0) return undefined;

  const normalized = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
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
  if (dedupedTypes && dedupedTypes.length > 0) {
    normalized.types = dedupedTypes;
  }

  const minAmount = normalizeAmount(filters.minAmount);
  const maxAmount = normalizeAmount(filters.maxAmount);
  if (minAmount !== undefined) normalized.minAmount = minAmount;
  if (maxAmount !== undefined) normalized.maxAmount = maxAmount;

  const tagTerms = normalizeStringArray(filters.tagTerms);
  if (tagTerms) normalized.tagTerms = tagTerms;

  const categoryIds = normalizeStringArray(filters.categoryIds);
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

export function hasActiveTransactionFilters(filters?: TransactionFilters): boolean {
  const normalized = normalizeTransactionFilters(filters);
  return (
    (normalized.types?.length ?? 0) > 0 ||
    normalized.minAmount !== undefined ||
    normalized.maxAmount !== undefined ||
    (normalized.tagTerms?.length ?? 0) > 0 ||
    (normalized.categoryIds?.length ?? 0) > 0 ||
    !!normalized.descriptionContains ||
    !!normalized.accountNameContains
  );
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

export function matchesTransactionFilters(
  split: FireflyTransactionSplit | undefined,
  filters?: TransactionFilters
): boolean {
  if (!split) return false;
  const normalized = normalizeTransactionFilters(filters);
  if (!hasActiveTransactionFilters(normalized)) return true;

  if (normalized.types?.length && !normalized.types.includes(split.type as TransactionFilterType)) {
    return false;
  }

  const parsedAmount = Number.parseFloat(split.amount);
  if (normalized.minAmount !== undefined || normalized.maxAmount !== undefined) {
    if (!Number.isFinite(parsedAmount)) return false;
    const absoluteAmount = Math.abs(parsedAmount);
    if (normalized.minAmount !== undefined && absoluteAmount < normalized.minAmount) return false;
    if (normalized.maxAmount !== undefined && absoluteAmount > normalized.maxAmount) return false;
  }

  if (normalized.tagTerms?.length) {
    const tags = (split.tags || []).map((tag) => tag.toLowerCase());
    const terms = normalized.tagTerms.map((term) => term.toLowerCase());
    const hasTagMatch = terms.some((term) => tags.some((tag) => tag.includes(term)));
    if (!hasTagMatch) return false;
  }

  if (normalized.categoryIds?.length) {
    if (!split.category_id || !normalized.categoryIds.includes(split.category_id)) {
      return false;
    }
  }

  if (normalized.descriptionContains) {
    const needle = normalized.descriptionContains.toLowerCase();
    if (!split.description.toLowerCase().includes(needle)) return false;
  }

  if (normalized.accountNameContains) {
    const needle = normalized.accountNameContains.toLowerCase();
    const source = split.source_name?.toLowerCase() ?? '';
    const destination = split.destination_name?.toLowerCase() ?? '';
    if (!source.includes(needle) && !destination.includes(needle)) return false;
  }

  return true;
}

export function filterTransactionsBySplit(
  transactions: FireflyTransaction[],
  filters?: TransactionFilters
): FireflyTransaction[] {
  if (!hasActiveTransactionFilters(filters)) return transactions;

  return transactions.filter((transaction) =>
    matchesTransactionFilters(transaction.attributes.transactions[0], filters)
  );
}
