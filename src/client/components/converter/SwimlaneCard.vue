<template>
  <v-card class="swimlane" rounded="lg">
    <!-- Swimlane Header -->
    <v-card-title class="swimlane-header d-flex align-center justify-space-between py-2 px-3">
      <div class="d-flex align-center swimlane-drag-handle">
        <v-icon size="small" class="mr-1 drag-icon">mdi-drag-vertical</v-icon>
        <v-icon size="small" class="mr-2" color="primary">mdi-table-column</v-icon>
        <span class="text-subtitle-2 font-weight-medium">{{ columnLabel }}</span>
      </div>
      <v-btn icon size="x-small" variant="text" color="error" @click="$emit('remove')">
        <v-icon size="small">mdi-close</v-icon>
      </v-btn>
    </v-card-title>

    <v-card-text class="swimlane-body pa-3">
      <!-- Column description -->
      <div class="text-caption text-medium-emphasis mb-3">
        {{ columnDescription }}
      </div>

      <!-- Blocks Container -->
      <div class="blocks-container">
        <draggable
          :model-value="swimlane.blocks"
          :group="{ name: 'blocks', pull: true, put: true }"
          item-key="id"
          handle=".transform-block"
          animation="200"
          class="blocks-list"
          @update:model-value="$emit('update:blocks', $event)"
        >
          <template #item="{ element, index }">
            <TransformBlockCard
              :block="element"
              class="mb-2"
              @edit="onEditBlock(index)"
              @delete="onDeleteBlock(index)"
            />
          </template>
        </draggable>

        <!-- Add Block Button -->
        <BlockTypeSelector class="mt-1" color="primary" block @select="onAddBlock" />
      </div>

      <!-- Preview Value -->
      <div v-if="previewValue !== undefined || error" class="preview-section mt-3">
        <div class="text-caption text-medium-emphasis mb-1">Preview:</div>
        <!-- Error State -->
        <div v-if="error" class="preview-error">
          <v-icon size="small" class="mr-1">mdi-alert-circle</v-icon>
          {{ error.message }}
        </div>
        <!-- Success State -->
        <div v-else class="preview-value text-body-2 font-weight-medium">
          {{ previewValue || '(empty)' }}
        </div>
      </div>
    </v-card-text>

    <!-- Block Editor Dialog -->
    <BlockEditorDialog
      v-model="editorDialogOpen"
      :block="editingBlock"
      :block-type="newBlockType"
      :source-columns="sourceColumns"
      @save="onBlockSave"
    />
  </v-card>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import draggable from 'vuedraggable';
import type {
  SwimlaneConfig,
  TransformBlock,
  TransformBlockType,
  SwimlaneError,
} from '@shared/types/converter';
import { FIREFLY_COLUMNS } from '@shared/types/converter';
import TransformBlockCard from './TransformBlockCard.vue';
import BlockTypeSelector from './BlockTypeSelector.vue';
import BlockEditorDialog from './BlockEditorDialog.vue';

const props = defineProps<{
  /** Swimlane configuration */
  swimlane: SwimlaneConfig;
  /** Available source columns from CSV */
  sourceColumns: string[];
  /** Preview value for this swimlane (optional) */
  previewValue?: string;
  /** Error for this swimlane (optional) */
  error?: SwimlaneError;
}>();

const emit = defineEmits<{
  'update:blocks': [blocks: TransformBlock[]];
  remove: [];
}>();

// Find column info
const columnInfo = computed(() => {
  return FIREFLY_COLUMNS.find((c) => c.id === props.swimlane.targetColumn);
});

const columnLabel = computed(() => columnInfo.value?.label || props.swimlane.targetColumn);
const columnDescription = computed(() => columnInfo.value?.description || '');

// Block editor state
const editorDialogOpen = ref(false);
const editingBlock = ref<TransformBlock | null>(null);
const editingBlockIndex = ref<number>(-1);
const newBlockType = ref<TransformBlockType>('column');

function onAddBlock(type: TransformBlockType) {
  editingBlock.value = null;
  newBlockType.value = type;
  editorDialogOpen.value = true;
}

function onEditBlock(index: number) {
  editingBlock.value = props.swimlane.blocks[index];
  editingBlockIndex.value = index;
  editorDialogOpen.value = true;
}

function onDeleteBlock(index: number) {
  const newBlocks = [...props.swimlane.blocks];
  newBlocks.splice(index, 1);
  emit('update:blocks', newBlocks);
}

function onBlockSave(block: TransformBlock) {
  const newBlocks = [...props.swimlane.blocks];
  if (editingBlock.value) {
    // Update existing block
    newBlocks[editingBlockIndex.value] = block;
  } else {
    // Add new block
    newBlocks.push(block);
  }
  emit('update:blocks', newBlocks);
  editingBlock.value = null;
  editingBlockIndex.value = -1;
}
</script>

<style scoped>
.swimlane {
  min-width: 320px;
  max-width: 360px;
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.swimlane-header {
  border-bottom: 1px solid rgba(var(--v-border-color), 0.1);
}

.swimlane-drag-handle {
  cursor: grab;
}

.swimlane-drag-handle:active {
  cursor: grabbing;
}

.drag-icon {
  opacity: 0.4;
  transition: opacity 0.15s;
}

.swimlane-drag-handle:hover .drag-icon {
  opacity: 0.8;
}

.swimlane-body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.blocks-container {
  flex: 1;
  min-height: 80px;
  overflow-y: auto;
  overflow-x: hidden;
}

/* Custom scrollbar for blocks */
.blocks-container::-webkit-scrollbar {
  width: 6px;
}

.blocks-container::-webkit-scrollbar-track {
  background: transparent;
}

.blocks-container::-webkit-scrollbar-thumb {
  background: rgba(var(--v-border-color), 0.3);
  border-radius: 3px;
}

.blocks-container::-webkit-scrollbar-thumb:hover {
  background: rgba(var(--v-border-color), 0.5);
}

.blocks-list {
  min-height: 40px;
}

.empty-blocks {
  border: 2px dashed rgba(var(--v-border-color), 0.15);
  border-radius: 8px;
}

.preview-section {
  padding-top: 12px;
  border-top: 1px solid rgba(var(--v-border-color), 0.1);
}

.preview-value {
  padding: 6px 10px;
  background: rgba(var(--v-theme-primary), 0.15);
  border-radius: 6px;
  white-space: nowrap;
  overflow-x: auto;
  overflow-y: hidden;
  max-width: 100%;
}

.preview-error {
  padding: 6px 10px;
  background: rgba(var(--v-theme-error), 0.15);
  color: rgb(var(--v-theme-error));
  border-radius: 6px;
  font-size: 0.75rem;
  display: flex;
  align-items: flex-start;
  word-break: break-word;
  white-space: normal;
}

/* Custom scrollbar for preview */
.preview-value::-webkit-scrollbar {
  height: 4px;
}

.preview-value::-webkit-scrollbar-track {
  background: transparent;
}

.preview-value::-webkit-scrollbar-thumb {
  background: rgba(var(--v-border-color), 0.3);
  border-radius: 2px;
}
</style>
