<template>
  <div class="transform-block" :class="{ 'transform-block-selected': selected }">
    <!-- Block Header -->
    <div class="d-flex align-center justify-space-between">
      <div class="d-flex align-center">
        <v-icon :color="blockInfo.color" size="small" class="mr-2">
          {{ blockInfo.icon }}
        </v-icon>
        <span class="text-body-2 font-weight-medium">{{ blockInfo.label }}</span>
      </div>
      <div class="d-flex align-center">
        <v-btn icon size="x-small" variant="text" @click="$emit('edit')">
          <v-icon size="small">mdi-pencil</v-icon>
        </v-btn>
        <v-btn icon size="x-small" variant="text" color="error" @click="$emit('delete')">
          <v-icon size="small">mdi-delete</v-icon>
        </v-btn>
      </div>
    </div>

    <!-- Block Details -->
    <div class="block-details mt-1">
      <div v-for="(line, idx) in previewLines" :key="idx" class="detail-line">
        <span class="detail-label">{{ line.label }}:</span>
        <span class="detail-value">{{ line.value }}</span>
      </div>
    </div>

    <!-- Nested Blocks for Conditional -->
    <template v-if="block.type === 'conditional'">
      <!-- Then Branch -->
      <div class="nested-branch mt-2">
        <div class="branch-label text-success">
          <v-icon size="x-small" class="mr-1">mdi-check</v-icon>
          {{ t('components.converter.then') }}
        </div>
        <div class="nested-blocks-list">
          <div v-if="block.thenBlocks.length === 0" class="empty-branch">
            {{ t('components.converter.keepValue') }}
          </div>
          <TransformBlockCard
            v-for="nestedBlock in block.thenBlocks"
            :key="nestedBlock.id"
            :block="nestedBlock"
            class="nested-block"
            @edit="$emit('edit')"
            @delete="$emit('edit')"
          />
        </div>
      </div>
      <!-- Else Branch -->
      <div v-if="block.elseBlocks.length > 0" class="nested-branch mt-2">
        <div class="branch-label text-warning">
          <v-icon size="x-small" class="mr-1">mdi-close</v-icon>
          {{ t('components.converter.else') }}
        </div>
        <div class="nested-blocks-list">
          <TransformBlockCard
            v-for="nestedBlock in block.elseBlocks"
            :key="nestedBlock.id"
            :block="nestedBlock"
            class="nested-block"
            @edit="$emit('edit')"
            @delete="$emit('edit')"
          />
        </div>
      </div>
    </template>

    <!-- Nested Blocks for Switch Case -->
    <template v-if="block.type === 'switchCase'">
      <div v-for="caseItem in block.cases" :key="caseItem.value" class="nested-branch mt-2">
        <div class="branch-label text-info">
          <v-icon size="x-small" class="mr-1">mdi-tag</v-icon>
          {{ t('components.converter.case') }} "{{ caseItem.value }}"
        </div>
        <div class="nested-blocks-list">
          <div v-if="caseItem.blocks.length === 0" class="empty-branch">
            {{ t('components.converter.keepValue') }}
          </div>
          <TransformBlockCard
            v-for="nestedBlock in caseItem.blocks"
            :key="nestedBlock.id"
            :block="nestedBlock"
            class="nested-block"
            @edit="$emit('edit')"
            @delete="$emit('edit')"
          />
        </div>
      </div>
      <!-- Default Branch -->
      <div v-if="block.defaultBlocks.length > 0" class="nested-branch mt-2">
        <div class="branch-label text-medium-emphasis">
          <v-icon size="x-small" class="mr-1">mdi-asterisk</v-icon>
          {{ t('settings.default') }}
        </div>
        <div class="nested-blocks-list">
          <TransformBlockCard
            v-for="nestedBlock in block.defaultBlocks"
            :key="nestedBlock.id"
            :block="nestedBlock"
            class="nested-block"
            @edit="$emit('edit')"
            @delete="$emit('edit')"
          />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { TransformBlock, BlockTypeInfo } from '@shared/types/converter';
import { BLOCK_TYPES } from '@shared/types/converter';

const props = defineProps<{
  /** The block configuration */
  block: TransformBlock;
  /** Whether the block is currently selected */
  selected?: boolean;
}>();

defineEmits<{
  edit: [];
  delete: [];
}>();

const { t } = useI18n();

const blockInfo = computed<BlockTypeInfo>(() => {
  return BLOCK_TYPES.find((b) => b.type === props.block.type) || BLOCK_TYPES[0];
});

interface DetailLine {
  label: string;
  value: string;
}

const previewLines = computed<DetailLine[]>(() => {
  const block = props.block;
  switch (block.type) {
    case 'column':
      return [
        {
          label: t('common.labels.from'),
          value: block.sourceColumn || t('components.converter.notSet'),
        },
      ];
    case 'static':
      return [
        {
          label: t('common.labels.value'),
          value: block.value ? `"${block.value}"` : t('components.converter.empty'),
        },
      ];
    case 'truncate':
      return [
        {
          label: t('components.converter.maxLength'),
          value: t('components.converter.chars', { count: block.maxLength }),
        },
        {
          label: t('components.converter.ellipsis'),
          value: block.ellipsis ? t('common.labels.yes') : t('common.labels.no'),
        },
      ];
    case 'dateFormat':
      return [
        { label: t('components.converter.input'), value: block.inputFormat },
        { label: t('components.converter.output'), value: block.outputFormat },
      ];
    case 'numberFormat':
      return [
        {
          label: t('components.converter.format'),
          value: `${block.inputDecimalSeparator} → ${block.outputDecimalSeparator}`,
        },
        { label: t('components.converter.decimals'), value: String(block.decimals) },
        ...(block.absolute
          ? [{ label: t('components.converter.absolute'), value: t('common.labels.yes') }]
          : []),
      ];
    case 'conditional': {
      const source = block.condition.useCurrentValue
        ? t('components.converter.currentValue')
        : block.condition.column || t('components.converter.notSet');
      return [
        {
          label: t('components.converter.if'),
          value: `${source} ${block.condition.operator} "${block.condition.value}"`,
        },
      ];
    }
    case 'switchCase': {
      const source = block.useCurrentValue
        ? t('components.converter.currentValue')
        : block.column || t('components.converter.notSet');
      return [{ label: t('components.converter.switchOn'), value: source }];
    }
    case 'removeRow':
      return [
        {
          label: t('components.converter.if'),
          value: `${block.condition.column || '?'} ${block.condition.operator} "${block.condition.value}"`,
        },
      ];
    case 'prefix':
      return [
        {
          label: t('components.converter.prefix'),
          value: block.prefix ? `"${block.prefix}"` : t('components.converter.empty'),
        },
      ];
    case 'suffix':
      return [
        {
          label: t('components.converter.suffix'),
          value: block.suffix ? `"${block.suffix}"` : t('components.converter.empty'),
        },
      ];
    case 'replace':
      return [
        {
          label: t('components.converter.find'),
          value: block.find ? `"${block.find}"` : t('components.converter.empty'),
        },
        { label: t('components.converter.replace'), value: `"${block.replace || ''}"` },
        ...(block.useRegex
          ? [{ label: t('components.converter.regex'), value: t('common.labels.yes') }]
          : []),
      ];
    case 'customScript':
      return [
        {
          label: t('components.converter.script'),
          value: t('components.converter.customJavaScript'),
        },
      ];
    default:
      return [{ label: t('common.labels.type'), value: t('common.labels.unknown') }];
  }
});
</script>

<style scoped>
.transform-block {
  cursor: grab;
  transition: all 0.15s ease;
  padding: 10px 12px;
  background: rgba(var(--v-theme-on-surface), 0.05);
  border-radius: 8px;
  border: 1px solid rgba(var(--v-border-color), 0.1);
}

.transform-block:hover {
  background: rgba(var(--v-theme-on-surface), 0.08);
  border-color: rgba(var(--v-theme-primary), 0.3);
}

.transform-block-selected {
  border-color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.1);
}

.block-details {
  font-size: 0.75rem;
  line-height: 1.4;
}

.detail-line {
  display: flex;
  gap: 6px;
  overflow: hidden;
}

.detail-label {
  color: rgba(var(--v-theme-on-surface), 0.6);
  flex-shrink: 0;
}

.detail-value {
  color: rgba(var(--v-theme-on-surface), 0.87);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Nested blocks styling */
.nested-branch {
  border-left: 2px solid rgba(var(--v-border-color), 0.2);
  padding-left: 10px;
  margin-left: 4px;
}

.branch-label {
  font-size: 0.7rem;
  font-weight: 500;
  display: flex;
  align-items: center;
  margin-bottom: 4px;
}

.nested-blocks-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nested-block {
  cursor: default;
  font-size: 0.7rem;
  padding: 6px 8px;
}

.nested-block :deep(.text-body-2) {
  font-size: 0.7rem !important;
}

.nested-block :deep(.block-details) {
  font-size: 0.65rem;
}

.nested-block :deep(.v-btn) {
  display: none;
}

.empty-branch {
  font-size: 0.7rem;
  color: rgba(var(--v-theme-on-surface), 0.5);
  font-style: italic;
  padding: 2px 0;
}
</style>
