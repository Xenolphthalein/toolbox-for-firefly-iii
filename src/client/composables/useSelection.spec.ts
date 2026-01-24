import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSelection } from './useSelection';

describe('useSelection', () => {
  describe('without getItemCount', () => {
    it('should initialize with empty selection', () => {
      const { selected } = useSelection<string>();
      expect(selected.value).toEqual([]);
    });

    it('should have allSelected always false when getItemCount is not provided', () => {
      const { allSelected, selectAll } = useSelection<string>();
      expect(allSelected.value).toBe(false);

      // Even after selecting items, allSelected stays false without getItemCount
      selectAll(['a', 'b', 'c']);
      expect(allSelected.value).toBe(false);
    });
  });

  describe('with getItemCount', () => {
    let items: string[];

    beforeEach(() => {
      items = ['item1', 'item2', 'item3'];
    });

    it('should initialize with empty selection', () => {
      const { selected } = useSelection<string>(() => items.length);
      expect(selected.value).toEqual([]);
    });

    it('should report allSelected as false when no items are selected', () => {
      const { allSelected } = useSelection<string>(() => items.length);
      expect(allSelected.value).toBe(false);
    });

    it('should report allSelected as true when all items are selected', () => {
      const { allSelected, selectAll } = useSelection<string>(() => items.length);
      selectAll(items);
      expect(allSelected.value).toBe(true);
    });

    it('should report allSelected as false when only some items are selected', () => {
      const { allSelected, selectAll } = useSelection<string>(() => items.length);
      selectAll(['item1', 'item2']);
      expect(allSelected.value).toBe(false);
    });

    it('should report allSelected as false when item count is zero', () => {
      const emptyItems: string[] = [];
      const { allSelected } = useSelection<string>(() => emptyItems.length);
      expect(allSelected.value).toBe(false);
    });
  });

  describe('isSelected', () => {
    it('should return false for unselected items', () => {
      const { isSelected } = useSelection<string>();
      expect(isSelected('item1')).toBe(false);
    });

    it('should return true for selected items', () => {
      const { isSelected, toggle } = useSelection<string>();
      toggle('item1');
      expect(isSelected('item1')).toBe(true);
    });
  });

  describe('toggle', () => {
    it('should add item to selection when not selected', () => {
      const { selected, toggle } = useSelection<string>();
      toggle('item1');
      expect(selected.value).toContain('item1');
    });

    it('should remove item from selection when already selected', () => {
      const { selected, toggle } = useSelection<string>();
      toggle('item1');
      toggle('item1');
      expect(selected.value).not.toContain('item1');
    });

    it('should force select when value is true', () => {
      const { selected, toggle } = useSelection<string>();
      toggle('item1', true);
      expect(selected.value).toContain('item1');

      // Should not add duplicate
      toggle('item1', true);
      expect(selected.value.filter((i) => i === 'item1')).toHaveLength(1);
    });

    it('should force deselect when value is false', () => {
      const { selected, toggle } = useSelection<string>();
      toggle('item1');
      toggle('item1', false);
      expect(selected.value).not.toContain('item1');
    });

    it('should not modify selection when force deselect on unselected item', () => {
      const { selected, toggle } = useSelection<string>();
      toggle('item1');
      toggle('item2', false);
      expect(selected.value).toEqual(['item1']);
    });
  });

  describe('selectAll', () => {
    it('should replace selection with all provided ids', () => {
      const { selected, selectAll, toggle } = useSelection<string>();
      toggle('item1');
      selectAll(['item2', 'item3']);
      expect(selected.value).toEqual(['item2', 'item3']);
    });

    it('should handle empty array', () => {
      const { selected, selectAll, toggle } = useSelection<string>();
      toggle('item1');
      selectAll([]);
      expect(selected.value).toEqual([]);
    });
  });

  describe('deselectAll', () => {
    it('should clear all selections', () => {
      const { selected, toggle, deselectAll } = useSelection<string>();
      toggle('item1');
      toggle('item2');
      deselectAll();
      expect(selected.value).toEqual([]);
    });
  });

  describe('toggleAll', () => {
    const items = ['item1', 'item2', 'item3'];

    it('should select all items when none are selected', () => {
      const { selected, toggleAll } = useSelection<string>(() => items.length);
      toggleAll(items);
      expect(selected.value).toEqual(items);
    });

    it('should select all items when some are selected', () => {
      const { selected, toggle, toggleAll } = useSelection<string>(() => items.length);
      toggle('item1');
      toggleAll(items);
      expect(selected.value).toEqual(items);
    });

    it('should deselect all items when all are selected', () => {
      const { selected, selectAll, toggleAll } = useSelection<string>(() => items.length);
      selectAll(items);
      toggleAll(items);
      expect(selected.value).toEqual([]);
    });
  });

  describe('clear', () => {
    it('should clear all selections', () => {
      const { selected, toggle, clear } = useSelection<string>();
      toggle('item1');
      toggle('item2');
      clear();
      expect(selected.value).toEqual([]);
    });
  });

  describe('type safety with numbers', () => {
    it('should work with numeric IDs', () => {
      const { selected, toggle, isSelected, selectAll } = useSelection<number>();

      toggle(1);
      toggle(2);
      expect(selected.value).toEqual([1, 2]);
      expect(isSelected(1)).toBe(true);
      expect(isSelected(3)).toBe(false);

      selectAll([10, 20, 30]);
      expect(selected.value).toEqual([10, 20, 30]);
    });
  });

  describe('allSelected computation', () => {
    it('should call getItemCount on each access to allSelected', () => {
      const getItemCount = vi.fn(() => 3);
      const { allSelected, toggle } = useSelection<string>(getItemCount);

      // Initial access
      expect(allSelected.value).toBe(false);
      expect(getItemCount).toHaveBeenCalled();

      // After selection changes, computed re-evaluates
      toggle('item1');
      toggle('item2');
      toggle('item3');
      expect(allSelected.value).toBe(true);
    });

    it('should stay false when selection count does not match item count', () => {
      const { allSelected, toggle } = useSelection<string>(() => 3);

      toggle('item1');
      expect(allSelected.value).toBe(false);

      toggle('item2');
      expect(allSelected.value).toBe(false);

      toggle('item3');
      expect(allSelected.value).toBe(true);
    });
  });
});
