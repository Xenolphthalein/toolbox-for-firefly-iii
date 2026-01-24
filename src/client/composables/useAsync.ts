import { ref } from 'vue';

export interface AsyncState {
  loading: ReturnType<typeof ref<boolean>>;
  error: ReturnType<typeof ref<string | null>>;
  execute: <T>(fn: () => Promise<T>) => Promise<T | undefined>;
  reset: () => void;
}

/**
 * Composable for managing async operation state
 */
export function useAsync(): AsyncState {
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function execute<T>(fn: () => Promise<T>): Promise<T | undefined> {
    loading.value = true;
    error.value = null;

    try {
      return await fn();
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'An unexpected error occurred';
      return undefined;
    } finally {
      loading.value = false;
    }
  }

  function reset() {
    loading.value = false;
    error.value = null;
  }

  return {
    loading,
    error,
    execute,
    reset,
  };
}
