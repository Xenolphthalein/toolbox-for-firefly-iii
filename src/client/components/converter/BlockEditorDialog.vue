<template>
  <v-dialog v-model="dialogOpen" :max-width="dialogMaxWidth" persistent scrollable>
    <v-card rounded="lg">
      <v-card-title class="d-flex align-center">
        <v-icon :color="blockInfo.color" class="mr-2">{{ blockInfo.icon }}</v-icon>
        {{ isEditing ? 'Edit' : 'Add' }} {{ blockInfo.label }} Block
      </v-card-title>

      <v-card-text>
        <!-- Column Block -->
        <template v-if="localBlock.type === 'column'">
          <v-select
            v-model="(localBlock as ColumnBlock).sourceColumn"
            :items="sourceColumns"
            label="Source Column"
            variant="outlined"
            hint="Select a column from your CSV file"
            persistent-hint
          />
        </template>

        <!-- Static Block -->
        <template v-else-if="localBlock.type === 'static'">
          <v-text-field
            v-model="(localBlock as StaticBlock).value"
            label="Static Value"
            variant="outlined"
            hint="Enter a fixed value for this column"
            persistent-hint
          />
        </template>

        <!-- Truncate Block -->
        <template v-else-if="localBlock.type === 'truncate'">
          <v-text-field
            v-model.number="(localBlock as TruncateBlock).maxLength"
            label="Max Length"
            type="number"
            min="1"
            variant="outlined"
            hint="Maximum number of characters"
            persistent-hint
            class="mb-4"
          />
          <v-checkbox
            v-model="(localBlock as TruncateBlock).ellipsis"
            label="Add ellipsis (...) when truncated"
            hide-details
          />
        </template>

        <!-- Date Format Block -->
        <template v-else-if="localBlock.type === 'dateFormat'">
          <v-text-field
            v-model="(localBlock as DateFormatBlock).inputFormat"
            label="Input Format"
            variant="outlined"
            hint="Format of the date in your CSV (e.g., DD.MM.YYYY, MM/DD/YYYY)"
            persistent-hint
            class="mb-4"
          />
          <v-text-field
            v-model="(localBlock as DateFormatBlock).outputFormat"
            label="Output Format"
            variant="outlined"
            hint="Format for Firefly (usually YYYY-MM-DD)"
            persistent-hint
          />
          <v-alert type="info" variant="tonal" density="compact" class="mt-4">
            <strong>Format tokens:</strong> YYYY (year), MM (month), DD (day), HH (hour), mm
            (minute), ss (second)
          </v-alert>
        </template>

        <!-- Number Format Block -->
        <template v-else-if="localBlock.type === 'numberFormat'">
          <v-row>
            <v-col cols="12" md="6">
              <div class="text-subtitle-2 mb-2">Input Format</div>
              <v-select
                v-model="(localBlock as NumberFormatBlock).inputDecimalSeparator"
                :items="[
                  { title: 'Period (.)', value: '.' },
                  { title: 'Comma (,)', value: ',' },
                ]"
                label="Decimal Separator"
                variant="outlined"
                density="compact"
                class="mb-2"
              />
              <v-select
                v-model="(localBlock as NumberFormatBlock).inputThousandsSeparator"
                :items="[
                  { title: 'None', value: '' },
                  { title: 'Period (.)', value: '.' },
                  { title: 'Comma (,)', value: ',' },
                  { title: 'Space', value: ' ' },
                ]"
                label="Thousands Separator"
                variant="outlined"
                density="compact"
              />
            </v-col>
            <v-col cols="12" md="6">
              <div class="text-subtitle-2 mb-2">Output Format</div>
              <v-select
                v-model="(localBlock as NumberFormatBlock).outputDecimalSeparator"
                :items="[
                  { title: 'Period (.)', value: '.' },
                  { title: 'Comma (,)', value: ',' },
                ]"
                label="Decimal Separator"
                variant="outlined"
                density="compact"
                class="mb-2"
              />
              <v-select
                v-model="(localBlock as NumberFormatBlock).outputThousandsSeparator"
                :items="[
                  { title: 'None', value: '' },
                  { title: 'Period (.)', value: '.' },
                  { title: 'Comma (,)', value: ',' },
                  { title: 'Space', value: ' ' },
                ]"
                label="Thousands Separator"
                variant="outlined"
                density="compact"
              />
            </v-col>
          </v-row>
          <v-row>
            <v-col cols="12" md="6">
              <v-text-field
                v-model.number="(localBlock as NumberFormatBlock).decimals"
                label="Decimal Places"
                type="number"
                min="0"
                max="10"
                variant="outlined"
                density="compact"
              />
            </v-col>
            <v-col cols="12" md="6" class="d-flex align-center">
              <v-checkbox
                v-model="(localBlock as NumberFormatBlock).absolute"
                label="Absolute value (remove negative)"
                hide-details
                density="compact"
              />
            </v-col>
          </v-row>
        </template>

        <!-- Conditional Block -->
        <template v-else-if="localBlock.type === 'conditional'">
          <v-checkbox
            v-model="(localBlock as ConditionalBlock).condition.useCurrentValue"
            label="Match against current value (instead of source column)"
            hint="Use this to apply conditions based on the result of previous transformations"
            persistent-hint
            class="mb-4"
          />
          <v-row>
            <v-col cols="12" sm="4">
              <v-select
                v-model="(localBlock as ConditionalBlock).condition.column"
                :items="sourceColumns"
                label="Source Column"
                variant="outlined"
                :disabled="(localBlock as ConditionalBlock).condition.useCurrentValue"
              />
            </v-col>
            <v-col cols="12" sm="4">
              <v-select
                v-model="(localBlock as ConditionalBlock).condition.operator"
                :items="conditionOperators"
                label="Operator"
                variant="outlined"
              />
            </v-col>
            <v-col cols="12" sm="4">
              <v-text-field
                v-model="(localBlock as ConditionalBlock).condition.value"
                label="Value"
                variant="outlined"
                :disabled="
                  ['isEmpty', 'isNotEmpty'].includes(
                    (localBlock as ConditionalBlock).condition.operator
                  )
                "
              />
            </v-col>
          </v-row>

          <v-row class="mt-2">
            <v-col cols="12" md="6">
              <NestedBlocksEditor
                label="Then (condition is true)"
                :blocks="(localBlock as ConditionalBlock).thenBlocks"
                :source-columns="sourceColumns"
                empty-text="No blocks. Value unchanged when true."
                @update:blocks="(localBlock as ConditionalBlock).thenBlocks = $event"
              />
            </v-col>
            <v-col cols="12" md="6">
              <NestedBlocksEditor
                label="Else (condition is false)"
                :blocks="(localBlock as ConditionalBlock).elseBlocks"
                :source-columns="sourceColumns"
                empty-text="No blocks. Value unchanged when false."
                @update:blocks="(localBlock as ConditionalBlock).elseBlocks = $event"
              />
            </v-col>
          </v-row>
        </template>

        <!-- Switch Case Block -->
        <template v-else-if="localBlock.type === 'switchCase'">
          <v-checkbox
            v-model="(localBlock as SwitchCaseBlock).useCurrentValue"
            label="Match against current value (instead of source column)"
            hint="Use this to apply conditions based on the result of previous transformations"
            persistent-hint
            class="mb-4"
          />
          <v-select
            v-model="(localBlock as SwitchCaseBlock).column"
            :items="sourceColumns"
            label="Source Column"
            variant="outlined"
            hint="Column to evaluate for each case"
            persistent-hint
            class="mb-4"
            :disabled="(localBlock as SwitchCaseBlock).useCurrentValue"
          />

          <div class="text-subtitle-2 mb-2">Cases</div>
          <v-expansion-panels variant="accordion" class="mb-4">
            <v-expansion-panel
              v-for="(caseItem, index) in (localBlock as SwitchCaseBlock).cases"
              :key="index"
            >
              <v-expansion-panel-title>
                <div class="d-flex align-center ga-2 flex-grow-1">
                  <v-chip size="x-small" color="primary">Case {{ index + 1 }}</v-chip>
                  <span class="text-body-2"> {{ caseItem.operator }} "{{ caseItem.value }}" </span>
                  <v-chip size="x-small" class="ml-auto mr-2">
                    {{ caseItem.blocks.length }} block{{ caseItem.blocks.length !== 1 ? 's' : '' }}
                  </v-chip>
                </div>
              </v-expansion-panel-title>
              <v-expansion-panel-text>
                <v-row dense class="mb-3">
                  <v-col cols="12" sm="5">
                    <v-select
                      v-model="caseItem.operator"
                      :items="conditionOperators"
                      label="Operator"
                      variant="outlined"
                      density="compact"
                    />
                  </v-col>
                  <v-col cols="12" sm="5">
                    <v-text-field
                      v-model="caseItem.value"
                      label="Value"
                      variant="outlined"
                      density="compact"
                      :disabled="['isEmpty', 'isNotEmpty'].includes(caseItem.operator)"
                    />
                  </v-col>
                  <v-col cols="12" sm="2" class="d-flex align-center justify-center">
                    <v-btn
                      variant="tonal"
                      size="small"
                      color="error"
                      :disabled="(localBlock as SwitchCaseBlock).cases.length <= 1"
                      @click="removeSwitchCase(index)"
                    >
                      <v-icon>mdi-delete</v-icon>
                      Delete
                    </v-btn>
                  </v-col>
                </v-row>
                <NestedBlocksEditor
                  label="Output Blocks"
                  :blocks="caseItem.blocks"
                  :source-columns="sourceColumns"
                  empty-text="No blocks. Value unchanged for this case."
                  @update:blocks="caseItem.blocks = $event"
                />
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>

          <v-btn
            variant="tonal"
            size="small"
            prepend-icon="mdi-plus"
            class="mb-4"
            @click="addSwitchCase"
          >
            Add Case
          </v-btn>

          <NestedBlocksEditor
            label="Default (no case matches)"
            :blocks="(localBlock as SwitchCaseBlock).defaultBlocks"
            :source-columns="sourceColumns"
            empty-text="No blocks. Value unchanged when no case matches."
            @update:blocks="(localBlock as SwitchCaseBlock).defaultBlocks = $event"
          />
        </template>

        <!-- Remove Row Block -->
        <template v-else-if="localBlock.type === 'removeRow'">
          <v-alert type="warning" variant="tonal" density="compact" class="mb-4">
            Rows matching this condition will be excluded from the output.
          </v-alert>
          <v-row>
            <v-col cols="12" sm="4">
              <v-select
                v-model="(localBlock as RemoveRowBlock).condition.column"
                :items="sourceColumns"
                label="Column"
                variant="outlined"
              />
            </v-col>
            <v-col cols="12" sm="4">
              <v-select
                v-model="(localBlock as RemoveRowBlock).condition.operator"
                :items="conditionOperators"
                label="Operator"
                variant="outlined"
              />
            </v-col>
            <v-col cols="12" sm="4">
              <v-text-field
                v-model="(localBlock as RemoveRowBlock).condition.value"
                label="Value"
                variant="outlined"
                :disabled="
                  ['isEmpty', 'isNotEmpty'].includes(
                    (localBlock as RemoveRowBlock).condition.operator
                  )
                "
              />
            </v-col>
          </v-row>
        </template>

        <!-- Prefix Block -->
        <template v-else-if="localBlock.type === 'prefix'">
          <v-text-field
            v-model="(localBlock as PrefixBlock).prefix"
            label="Prefix"
            variant="outlined"
            hint="Text to add before the value"
            persistent-hint
          />
        </template>

        <!-- Suffix Block -->
        <template v-else-if="localBlock.type === 'suffix'">
          <v-text-field
            v-model="(localBlock as SuffixBlock).suffix"
            label="Suffix"
            variant="outlined"
            hint="Text to add after the value"
            persistent-hint
          />
        </template>

        <!-- Replace Block -->
        <template v-else-if="localBlock.type === 'replace'">
          <v-text-field
            v-model="(localBlock as ReplaceBlock).find"
            label="Find"
            variant="outlined"
            hint="Text to search for"
            persistent-hint
            class="mb-4"
          />
          <v-text-field
            v-model="(localBlock as ReplaceBlock).replace"
            label="Replace With"
            variant="outlined"
            hint="Replacement text"
            persistent-hint
            class="mb-4"
          />
          <v-checkbox
            v-model="(localBlock as ReplaceBlock).useRegex"
            label="Use Regular Expression"
            hide-details
            class="mb-2"
          />
          <v-checkbox
            v-model="(localBlock as ReplaceBlock).caseInsensitive"
            label="Case Insensitive"
            hide-details
          />
        </template>

        <!-- Custom Script Block -->
        <template v-else-if="localBlock.type === 'customScript'">
          <v-alert type="warning" variant="tonal" density="compact" class="mb-4">
            <strong>Warning:</strong> Custom scripts run in the browser. Use with caution.
          </v-alert>
          <v-textarea
            v-model="(localBlock as CustomScriptBlock).script"
            label="JavaScript Code"
            variant="outlined"
            rows="8"
            font="monospace"
            hint="Variables: value (current value), row (array of all columns), columns (header names)"
            persistent-hint
          />
        </template>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="onCancel">Cancel</v-btn>
        <v-btn color="primary" @click="onSave">{{ isEditing ? 'Save' : 'Add' }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type {
  TransformBlock,
  TransformBlockType,
  BlockTypeInfo,
  ColumnBlock,
  StaticBlock,
  TruncateBlock,
  DateFormatBlock,
  NumberFormatBlock,
  ConditionalBlock,
  SwitchCaseBlock,
  RemoveRowBlock,
  PrefixBlock,
  SuffixBlock,
  ReplaceBlock,
  CustomScriptBlock,
} from '@shared/types/converter';
import { BLOCK_TYPES, createBlock } from '@shared/types/converter';
import NestedBlocksEditor from './NestedBlocksEditor.vue';

const props = defineProps<{
  /** Whether the dialog is open */
  modelValue: boolean;
  /** Block to edit (null for new block) */
  block?: TransformBlock | null;
  /** Block type when creating new (required if block is null) */
  blockType?: TransformBlockType;
  /** Available source columns from CSV */
  sourceColumns: string[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  save: [block: TransformBlock];
}>();

const dialogOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});

const isEditing = computed(() => !!props.block);

// Wider dialog for conditional/switchCase blocks
const dialogMaxWidth = computed(() => {
  if (localBlock.value.type === 'conditional' || localBlock.value.type === 'switchCase') {
    return 900;
  }
  return 600;
});

// Create a local copy of the block for editing
const localBlock = ref<TransformBlock>(createBlock('column'));

// Initialize localBlock when dialog opens or block changes
watch(
  [() => props.modelValue, () => props.block, () => props.blockType],
  ([open]) => {
    if (open) {
      if (props.block) {
        // Deep clone the existing block
        localBlock.value = JSON.parse(JSON.stringify(props.block));
      } else if (props.blockType) {
        // Create new block of specified type
        localBlock.value = createBlock(props.blockType);
      }
    }
  },
  { immediate: true }
);

const blockInfo = computed<BlockTypeInfo>(() => {
  return BLOCK_TYPES.find((b) => b.type === localBlock.value.type) || BLOCK_TYPES[0];
});

const conditionOperators = [
  { title: 'Equals', value: 'equals' },
  { title: 'Contains', value: 'contains' },
  { title: 'Starts With', value: 'startsWith' },
  { title: 'Ends With', value: 'endsWith' },
  { title: 'Greater Than', value: 'greaterThan' },
  { title: 'Less Than', value: 'lessThan' },
  { title: 'Is Empty', value: 'isEmpty' },
  { title: 'Is Not Empty', value: 'isNotEmpty' },
  { title: 'Matches Regex', value: 'matches' },
];

function onSave() {
  emit('save', JSON.parse(JSON.stringify(localBlock.value)));
  dialogOpen.value = false;
}

function onCancel() {
  dialogOpen.value = false;
}

function addSwitchCase() {
  if (localBlock.value.type === 'switchCase') {
    (localBlock.value as SwitchCaseBlock).cases.push({
      operator: 'equals',
      value: '',
      blocks: [],
    });
  }
}

function removeSwitchCase(index: number) {
  if (localBlock.value.type === 'switchCase') {
    (localBlock.value as SwitchCaseBlock).cases.splice(index, 1);
  }
}
</script>

<style scoped>
:deep(.v-textarea textarea) {
  font-family: monospace;
  font-size: 0.875rem;
}
</style>
