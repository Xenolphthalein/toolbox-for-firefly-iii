import { ref, computed, type Ref, type ComputedRef } from 'vue';

export interface SelectionState<T = string> {
  /** Currently selected item IDs */
  selected: Ref<T[]>;
  /** Whether all items are selected */
  allSelected: ComputedRef<boolean>;
  /** Check if an item is selected */
  isSelected: (id: T) => boolean;
  /** Toggle selection of an item */
  toggle: (id: T, value?: boolean) => void;
  /** Select all items */
  selectAll: (allIds: T[]) => void;
  /** Deselect all items */
  deselectAll: () => void;
  /** Toggle between select all and deselect all */
  toggleAll: (allIds: T[]) => void;
  /** Clear selection */
  clear: () => void;
}

/**
 * Composable for managing selection state
 * @param getItemCount - Function that returns the total number of selectable items
 */
export function useSelection<T = string>(getItemCount?: () => number): SelectionState<T> {
  const selected = ref<T[]>([]) as Ref<T[]>;

  const allSelected = computed(() => {
    if (!getItemCount) return false;
    const total = getItemCount();
    return total > 0 && selected.value.length === total;
  });

  function isSelected(id: T): boolean {
    return selected.value.includes(id);
  }

  function toggle(id: T, value?: boolean): void {
    const shouldSelect = value ?? !isSelected(id);

    if (shouldSelect) {
      if (!isSelected(id)) {
        selected.value = [...selected.value, id];
      }
    } else {
      selected.value = selected.value.filter((s) => s !== id);
    }
  }

  function selectAll(allIds: T[]): void {
    selected.value = [...allIds];
  }

  function deselectAll(): void {
    selected.value = [];
  }

  function toggleAll(allIds: T[]): void {
    if (allSelected.value) {
      deselectAll();
    } else {
      selectAll(allIds);
    }
  }

  function clear(): void {
    selected.value = [];
  }

  return {
    selected,
    allSelected,
    isSelected,
    toggle,
    selectAll,
    deselectAll,
    toggleAll,
    clear,
  };
}
