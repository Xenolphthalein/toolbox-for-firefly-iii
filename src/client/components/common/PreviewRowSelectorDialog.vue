<template>
  <v-dialog
    :model-value="modelValue"
    max-width="1100"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card rounded="lg" class="preview-row-dialog">
      <v-card-title class="preview-row-dialog__title d-flex align-center justify-space-between">
        <div class="d-flex align-center">
          <v-icon class="mr-2" color="primary">mdi-table-search</v-icon>
          {{ t('common.labels.selectPreviewRow') }}
        </div>
        <v-chip v-if="rows.length" size="small" color="primary" variant="tonal">
          {{ t('common.labels.previewRowNumber', { row: pendingRowIndex + 1 }) }}
        </v-chip>
      </v-card-title>
      <v-card-text class="preview-row-dialog__body d-flex flex-column ga-4">
        <p class="text-body-2 text-medium-emphasis mb-0">
          {{ t('common.help.selectPreviewRowDesc') }}
        </p>

        <v-text-field
          v-model="searchQuery"
          :label="t('common.labels.search')"
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          clearable
          hide-details
        />

        <LazyPreviewTable
          v-if="filteredEntries.length > 0"
          class="preview-row-dialog__table"
          :headers="headers"
          :rows="filteredRows"
          :selected-row-index="selectedFilteredRowIndex"
          clickable-rows
          show-row-numbers
          @row-click="onFilteredRowClick"
        />

        <div
          v-else
          class="preview-row-dialog__empty d-flex flex-column align-center justify-center text-medium-emphasis"
        >
          <v-icon size="40" class="mb-2">mdi-table-search</v-icon>
          <div class="text-body-1">{{ t('common.messages.noSearchResults') }}</div>
          <div class="text-body-2">{{ t('common.messages.tryDifferentSearch') }}</div>
        </div>
      </v-card-text>
      <v-card-actions class="preview-row-dialog__actions">
        <v-spacer />
        <v-btn variant="text" @click="emit('update:modelValue', false)">
          {{ t('common.buttons.cancel') }}
        </v-btn>
        <v-btn color="primary" variant="flat" :disabled="rows.length === 0" @click="applySelection">
          {{ t('common.buttons.apply') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import LazyPreviewTable from './LazyPreviewTable.vue';

interface Props {
  modelValue: boolean;
  headers: string[];
  rows: string[][];
  selectedRowIndex: number;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  select: [rowIndex: number];
}>();

const { t } = useI18n();

const pendingRowIndex = ref(0);
const searchQuery = ref('');

const normalizedSearchQuery = computed(() => searchQuery.value.trim().toLocaleLowerCase());

const filteredEntries = computed(() =>
  props.rows
    .map((row, index) => ({ row, index }))
    .filter(({ row, index }) => {
      if (!normalizedSearchQuery.value) return true;

      const haystack = `${index + 1} ${row.join(' ')}`.toLocaleLowerCase();
      return haystack.includes(normalizedSearchQuery.value);
    })
);

const filteredRows = computed(() => filteredEntries.value.map(({ row }) => row));

const selectedFilteredRowIndex = computed(() =>
  filteredEntries.value.findIndex(({ index }) => index === pendingRowIndex.value)
);

function applySelection(): void {
  emit('select', pendingRowIndex.value);
  emit('update:modelValue', false);
}

function onFilteredRowClick(filteredRowIndex: number): void {
  const entry = filteredEntries.value[filteredRowIndex];
  if (!entry) return;
  pendingRowIndex.value = entry.index;
}

watch(
  () => [props.modelValue, props.selectedRowIndex, props.rows.length] as const,
  () => {
    pendingRowIndex.value = Math.min(
      props.selectedRowIndex,
      Math.max(props.rows.length - 1, 0)
    );
    searchQuery.value = '';
  },
  { immediate: true }
);
</script>

<style scoped>
.preview-row-dialog {
  display: flex;
  flex-direction: column;
  max-height: min(85vh, 900px);
}

.preview-row-dialog__title {
  padding: 20px 24px 12px;
}

.preview-row-dialog__body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 0 24px 16px;
}

.preview-row-dialog__table {
  flex: 1;
  min-height: 0;
}

.preview-row-dialog__empty {
  flex: 1;
  min-height: 220px;
  border: 1px dashed rgba(var(--v-border-color), 0.3);
  border-radius: 8px;
}

.preview-row-dialog__actions {
  padding: 0 24px 20px;
}
</style>
