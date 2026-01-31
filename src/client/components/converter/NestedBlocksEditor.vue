<template>
  <div class="nested-blocks-editor">
    <div class="d-flex align-center justify-space-between mb-2">
      <div class="text-subtitle-2">{{ label }}</div>
      <v-chip size="x-small" :color="blocks.length > 0 ? 'primary' : 'default'">
        {{ t('components.converter.blocksCount', { count: blocks.length }) }}
      </v-chip>
    </div>

    <div class="nested-blocks-container pa-2">
      <!-- Block List -->
      <draggable
        :model-value="blocks"
        :group="{ name: 'nested-blocks', pull: true, put: true }"
        item-key="id"
        handle=".nested-block-handle"
        animation="200"
        class="nested-blocks-list"
        @update:model-value="$emit('update:blocks', $event)"
      >
        <template #item="{ element, index }">
          <div class="nested-block-item mb-2">
            <div class="d-flex align-center ga-2">
              <v-icon size="small" class="nested-block-handle cursor-grab text-medium-emphasis"
                >mdi-drag</v-icon
              >
              <v-icon size="small" :color="getBlockInfo(element).color">
                {{ getBlockInfo(element).icon }}
              </v-icon>
              <span class="text-body-2 flex-grow-1 text-truncate">
                {{ getBlockInfo(element).label }}: {{ getBlockPreview(element) }}
              </span>
              <v-btn icon size="x-small" variant="text" @click="onEditBlock(index)">
                <v-icon size="small">mdi-pencil</v-icon>
              </v-btn>
              <v-btn icon size="x-small" variant="text" color="error" @click="onDeleteBlock(index)">
                <v-icon size="small">mdi-delete</v-icon>
              </v-btn>
            </div>
          </div>
        </template>
      </draggable>

      <!-- Empty State -->
      <div v-if="blocks.length === 0" class="text-center text-medium-emphasis py-3">
        <v-icon size="small" class="mb-1">mdi-information-outline</v-icon>
        <div class="text-caption">{{ resolvedEmptyText }}</div>
      </div>

      <!-- Add Block Button -->
      <BlockTypeSelector class="mt-2" size="small" block color="primary" @select="onAddBlock" />
    </div>

    <!-- Nested Block Editor Dialog -->
    <BlockEditorDialog
      v-model="editorDialogOpen"
      :block="editingBlock"
      :block-type="newBlockType"
      :source-columns="sourceColumns"
      @save="onBlockSave"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import draggable from 'vuedraggable';
import type { TransformBlock, TransformBlockType, BlockTypeInfo } from '@shared/types/converter';
import { BLOCK_TYPES } from '@shared/types/converter';
import BlockTypeSelector from './BlockTypeSelector.vue';
import BlockEditorDialog from './BlockEditorDialog.vue';

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    /** Label for the nested blocks section */
    label: string;
    /** The blocks array */
    blocks: TransformBlock[];
    /** Available source columns */
    sourceColumns: string[];
    /** Text to show when no blocks */
    emptyText?: string;
  }>(),
  {
    emptyText: undefined,
  }
);

const resolvedEmptyText = computed(
  () => props.emptyText ?? t('components.converter.noBlocksDefined')
);

const emit = defineEmits<{
  'update:blocks': [blocks: TransformBlock[]];
}>();

// Editor state
const editorDialogOpen = ref(false);
const editingBlock = ref<TransformBlock | null>(null);
const editingBlockIndex = ref(-1);
const newBlockType = ref<TransformBlockType>('static');

function getBlockInfo(block: TransformBlock): BlockTypeInfo {
  return BLOCK_TYPES.find((b) => b.type === block.type) || BLOCK_TYPES[0];
}

function getBlockPreview(block: TransformBlock): string {
  switch (block.type) {
    case 'column':
      return block.sourceColumn || t('components.converter.selectColumn');
    case 'static':
      return block.value ? `"${block.value}"` : t('components.converter.empty');
    case 'truncate':
      return t('components.converter.maxChars', { max: block.maxLength });
    case 'dateFormat':
      return `${block.inputFormat} → ${block.outputFormat}`;
    case 'numberFormat':
      return `${block.inputDecimalSeparator} → ${t('components.converter.decimalsShort', { decimals: block.decimals })}`;
    case 'conditional':
      return t('components.converter.conditionalPreview', {
        then: block.thenBlocks.length,
        else: block.elseBlocks.length,
      });
    case 'switchCase':
      return t('components.converter.switchCasePreview', { cases: block.cases.length });
    case 'removeRow':
      return block.condition.column || t('components.converter.configure');
    case 'prefix':
      return block.prefix || t('components.converter.empty');
    case 'suffix':
      return block.suffix || t('components.converter.empty');
    case 'replace':
      return block.find || t('components.converter.configure');
    case 'customScript':
      return 'JS';
    default:
      return '';
  }
}

function onAddBlock(type: TransformBlockType) {
  editingBlock.value = null;
  newBlockType.value = type;
  editingBlockIndex.value = -1;
  editorDialogOpen.value = true;
}

function onEditBlock(index: number) {
  editingBlock.value = props.blocks[index];
  editingBlockIndex.value = index;
  editorDialogOpen.value = true;
}

function onDeleteBlock(index: number) {
  const newBlocks = [...props.blocks];
  newBlocks.splice(index, 1);
  emit('update:blocks', newBlocks);
}

function onBlockSave(block: TransformBlock) {
  const newBlocks = [...props.blocks];
  if (editingBlockIndex.value >= 0) {
    newBlocks[editingBlockIndex.value] = block;
  } else {
    newBlocks.push(block);
  }
  emit('update:blocks', newBlocks);
  editingBlock.value = null;
  editingBlockIndex.value = -1;
}
</script>

<style scoped>
.nested-blocks-container {
  background: rgba(var(--v-theme-on-surface), 0.03);
  border: 1px solid rgba(var(--v-border-color), 0.1);
  border-radius: 8px;
}

.nested-blocks-list {
  min-height: 20px;
}

.nested-block-item {
  cursor: default;
  padding: 10px 12px;
  background: rgba(var(--v-theme-on-surface), 0.05);
  border-radius: 6px;
  border: 1px solid rgba(var(--v-border-color), 0.1);
}

.nested-block-item:hover {
  background: rgba(var(--v-theme-on-surface), 0.08);
  border-color: rgba(var(--v-theme-primary), 0.3);
}

.nested-block-handle {
  cursor: grab;
}

.nested-block-handle:active {
  cursor: grabbing;
}

.cursor-grab {
  cursor: grab;
}
</style>
