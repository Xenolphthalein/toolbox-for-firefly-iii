<template>
  <div ref="scrollContainer" class="preview-table-container" @scroll="onScroll">
    <v-table density="compact" class="preview-table">
      <thead>
        <tr>
          <th v-if="showRowNumbers" class="row-number-column">
            {{ t('common.labels.row') }}
          </th>
          <th v-for="header in headers" :key="header">
            {{ header }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(row, rowIdx) in visibleRows"
          :key="rowIdx"
          :class="{
            'preview-table-row--clickable': clickableRows,
            'preview-table-row--selected': selectedRowIndex === rowIdx,
          }"
          @click="onRowClick(rowIdx)"
        >
          <td v-if="showRowNumbers" class="row-number-column text-medium-emphasis">
            {{ rowIdx + 1 }}
          </td>
          <td v-for="(cell, cellIdx) in row" :key="cellIdx" class="text-truncate">
            {{ cell || emptyCell }}
          </td>
        </tr>
      </tbody>
    </v-table>

    <div v-if="isLoadingMore" class="d-flex align-center justify-center py-4 text-medium-emphasis">
      <v-progress-circular indeterminate size="18" width="2" class="mr-2" />
      <span class="text-body-2">{{
        t('common.labels.loadedRowsCount', { loaded: visibleRows.length, total: rows.length })
      }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const INITIAL_ROW_BATCH = 50;
const ROW_BATCH_SIZE = 50;

interface Props {
  headers: string[];
  rows: string[][];
  emptyCell?: string;
  clickableRows?: boolean;
  selectedRowIndex?: number;
  showRowNumbers?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  emptyCell: '—',
  clickableRows: false,
  selectedRowIndex: undefined,
  showRowNumbers: false,
});

const emit = defineEmits<{
  'row-click': [rowIndex: number];
}>();

const { t } = useI18n();

const scrollContainer = ref<HTMLElement | null>(null);
const visibleCount = ref(0);
const isLoadingMore = ref(false);

const visibleRows = computed(() => props.rows.slice(0, visibleCount.value));

function resetVisibleRows(): void {
  visibleCount.value = Math.min(
    Math.max(INITIAL_ROW_BATCH, (props.selectedRowIndex ?? 0) + ROW_BATCH_SIZE),
    props.rows.length
  );
}

function loadMoreRows(): void {
  if (isLoadingMore.value) return;
  if (visibleCount.value >= props.rows.length) return;

  isLoadingMore.value = true;
  visibleCount.value = Math.min(visibleCount.value + ROW_BATCH_SIZE, props.rows.length);
  requestAnimationFrame(() => {
    isLoadingMore.value = false;
  });
}

async function ensureScrollable(): Promise<void> {
  await nextTick();

  const container = scrollContainer.value;
  if (!container) return;

  while (
    visibleCount.value < props.rows.length &&
    container.scrollHeight <= container.clientHeight + 1
  ) {
    visibleCount.value = Math.min(visibleCount.value + ROW_BATCH_SIZE, props.rows.length);
    await nextTick();
  }
}

function onScroll(event: Event): void {
  const target = event.target as HTMLElement;
  const scrollBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
  if (scrollBottom < 100) {
    loadMoreRows();
  }
}

function onRowClick(rowIdx: number): void {
  if (!props.clickableRows) return;
  emit('row-click', rowIdx);
}

watch(
  () => props.rows,
  async () => {
    resetVisibleRows();
    if (scrollContainer.value) {
      scrollContainer.value.scrollTop = 0;
      scrollContainer.value.scrollLeft = 0;
    }
    await ensureScrollable();
  },
  { immediate: true }
);

watch(
  () => props.selectedRowIndex,
  async () => {
    if ((props.selectedRowIndex ?? 0) >= visibleCount.value) {
      visibleCount.value = Math.min(
        Math.max(visibleCount.value, (props.selectedRowIndex ?? 0) + ROW_BATCH_SIZE),
        props.rows.length
      );
    }
    await ensureScrollable();
  }
);
</script>

<style scoped>
.preview-table-container {
  flex: 1;
  overflow: auto;
  border: 1px solid rgba(var(--v-border-color), 0.2);
  border-radius: 8px;
  min-height: 100px;
}

.preview-table {
  width: max-content;
  min-width: 100%;
}

.preview-table th {
  background: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-border-color), 0.3);
  position: sticky;
  top: 0;
  z-index: 1;
  color: rgb(var(--v-theme-primary));
  font-weight: 600;
}

.preview-table th,
.preview-table td {
  max-width: 200px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.row-number-column {
  width: 72px;
  min-width: 72px;
}

.preview-table-row--clickable {
  cursor: pointer;
}

.preview-table-row--clickable:hover {
  background: rgba(var(--v-theme-primary), 0.06);
}

.preview-table-row--selected {
  background: rgba(var(--v-theme-primary), 0.12);
}
</style>
