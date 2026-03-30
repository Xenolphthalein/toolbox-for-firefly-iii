<template>
  <v-dialog
    :model-value="modelValue"
    max-width="1100"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card rounded="lg" class="preview-row-dialog">
      <v-card-title class="d-flex align-center justify-space-between">
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

        <LazyPreviewTable
          class="preview-row-dialog__table"
          :headers="headers"
          :rows="rows"
          :selected-row-index="pendingRowIndex"
          clickable-rows
          show-row-numbers
          @row-click="pendingRowIndex = $event"
        />
      </v-card-text>
      <v-card-actions>
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
import { ref, watch } from 'vue';
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

function applySelection(): void {
  emit('select', pendingRowIndex.value);
  emit('update:modelValue', false);
}

watch(
  () => [props.modelValue, props.selectedRowIndex, props.rows.length] as const,
  () => {
    pendingRowIndex.value = Math.min(
      props.selectedRowIndex,
      Math.max(props.rows.length - 1, 0)
    );
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

.preview-row-dialog__body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.preview-row-dialog__table {
  flex: 1;
  min-height: 0;
}
</style>
