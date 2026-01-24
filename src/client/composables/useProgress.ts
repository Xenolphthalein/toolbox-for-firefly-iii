import { ref, computed, type Ref, type ComputedRef } from 'vue';

export interface ProgressState {
  current: Ref<number>;
  total: Ref<number>;
  message: Ref<string>;
  percent: ComputedRef<number>;
  reset: () => void;
  update: (current: number, total: number, message?: string) => void;
}

/**
 * Composable for managing progress state during async operations
 */
export function useProgress(initialMessage = 'Initializing...'): ProgressState {
  const current = ref(0);
  const total = ref(0);
  const message = ref(initialMessage);

  const percent = computed(() => {
    if (total.value === 0) return 0;
    return Math.round((current.value / total.value) * 100);
  });

  function reset() {
    current.value = 0;
    total.value = 0;
    message.value = initialMessage;
  }

  function update(newCurrent: number, newTotal: number, newMessage?: string) {
    current.value = newCurrent;
    total.value = newTotal;
    if (newMessage !== undefined) {
      message.value = newMessage;
    }
  }

  return {
    current,
    total,
    message,
    percent,
    reset,
    update,
  };
}
