import { ref, type Ref } from 'vue';
import api from '../services/api';
import type { FireflyCategory, FireflyTag } from '@shared/types/firefly';
import type { TransactionFilterOption } from './useTransactionFilters';

export interface TransactionFilterOptionsState {
  categories: Ref<TransactionFilterOption[]>;
  tags: Ref<TransactionFilterOption[]>;
  loading: Ref<boolean>;
  load: (options?: { categories?: boolean; tags?: boolean }) => Promise<void>;
}

function toCategoryOption(category: FireflyCategory): TransactionFilterOption {
  return {
    title: category.attributes.name,
    value: category.id,
  };
}

function toTagOption(tag: FireflyTag): TransactionFilterOption {
  return {
    title: tag.attributes.tag,
    value: tag.attributes.tag,
  };
}

function sortOptions(options: TransactionFilterOption[]): TransactionFilterOption[] {
  return [...options].sort((a, b) => a.title.localeCompare(b.title));
}

export function useTransactionFilterOptions(): TransactionFilterOptionsState {
  const categories = ref<TransactionFilterOption[]>([]);
  const tags = ref<TransactionFilterOption[]>([]);
  const loading = ref(false);

  async function load(options: { categories?: boolean; tags?: boolean } = {}): Promise<void> {
    const shouldLoadCategories = options.categories === true;
    const shouldLoadTags = options.tags === true;

    if (!shouldLoadCategories && !shouldLoadTags) return;

    loading.value = true;

    try {
      const requests: Promise<unknown>[] = [];

      if (shouldLoadCategories) {
        requests.push(
          api.get('/suggestions/categories').then((response) => {
            const items = (response.data?.data ?? []) as FireflyCategory[];
            categories.value = sortOptions(items.map(toCategoryOption));
          })
        );
      }

      if (shouldLoadTags) {
        requests.push(
          api.get('/suggestions/tags').then((response) => {
            const items = (response.data?.data ?? []) as FireflyTag[];
            tags.value = sortOptions(items.map(toTagOption));
          })
        );
      }

      await Promise.all(requests);
    } catch (error) {
      console.error('Failed to load transaction filter options:', error);
    } finally {
      loading.value = false;
    }
  }

  return {
    categories,
    tags,
    loading,
    load,
  };
}
