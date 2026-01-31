<template>
  <v-dialog v-model="dialogOpen" :max-width="dialogMaxWidth" persistent scrollable>
    <v-card rounded="lg">
      <v-card-title class="d-flex align-center">
        <v-icon :color="blockInfo.color" class="mr-2">{{ blockInfo.icon }}</v-icon>
        {{ isEditing ? t('components.converter.editBlock') : t('components.converter.addBlock') }}
        {{ blockInfo.label }} {{ t('components.converter.block') }}
      </v-card-title>

      <v-card-text>
        <!-- Column Block -->
        <template v-if="localBlock.type === 'column'">
          <v-select
            v-model="(localBlock as ColumnBlock).sourceColumn"
            :items="sourceColumns"
            :label="t('components.converter.sourceColumn')"
            variant="outlined"
            :hint="t('components.converter.sourceColumnHint')"
            persistent-hint
          />
        </template>

        <!-- Static Block -->
        <template v-else-if="localBlock.type === 'static'">
          <v-text-field
            v-model="(localBlock as StaticBlock).value"
            :label="t('components.converter.staticValue')"
            variant="outlined"
            :hint="t('components.converter.staticValueHint')"
            persistent-hint
          />
        </template>

        <!-- Truncate Block -->
        <template v-else-if="localBlock.type === 'truncate'">
          <v-text-field
            v-model.number="(localBlock as TruncateBlock).maxLength"
            :label="t('components.converter.maxLength')"
            type="number"
            min="1"
            variant="outlined"
            :hint="t('components.converter.maxLengthHint')"
            persistent-hint
            class="mb-4"
          />
          <v-checkbox
            v-model="(localBlock as TruncateBlock).ellipsis"
            :label="t('components.converter.addEllipsis')"
            hide-details
          />
        </template>

        <!-- Date Format Block -->
        <template v-else-if="localBlock.type === 'dateFormat'">
          <v-text-field
            v-model="(localBlock as DateFormatBlock).inputFormat"
            :label="t('components.converter.inputFormat')"
            variant="outlined"
            :hint="t('components.converter.inputFormatHint')"
            persistent-hint
            class="mb-4"
          />
          <v-text-field
            v-model="(localBlock as DateFormatBlock).outputFormat"
            :label="t('components.converter.outputFormat')"
            variant="outlined"
            :hint="t('components.converter.outputFormatHint')"
            persistent-hint
          />
          <v-alert type="info" variant="tonal" density="compact" class="mt-4">
            <strong>{{ t('components.converter.formatTokens') }}:</strong>
            {{ t('components.converter.formatTokensDesc') }}
          </v-alert>
        </template>

        <!-- Number Format Block -->
        <template v-else-if="localBlock.type === 'numberFormat'">
          <v-row>
            <v-col cols="12" md="6">
              <div class="text-subtitle-2 mb-2">{{ t('components.converter.inputFormat') }}</div>
              <v-select
                v-model="(localBlock as NumberFormatBlock).inputDecimalSeparator"
                :items="[
                  { title: t('components.converter.periodSeparator'), value: '.' },
                  { title: t('common.csvOptions.comma'), value: ',' },
                ]"
                :label="t('components.converter.decimalSeparator')"
                variant="outlined"
                density="compact"
                class="mb-2"
              />
              <v-select
                v-model="(localBlock as NumberFormatBlock).inputThousandsSeparator"
                :items="[
                  { title: t('common.labels.none'), value: '' },
                  { title: t('components.converter.periodSeparator'), value: '.' },
                  { title: t('common.csvOptions.comma'), value: ',' },
                  { title: t('components.converter.space'), value: ' ' },
                ]"
                :label="t('components.converter.thousandsSeparator')"
                variant="outlined"
                density="compact"
              />
            </v-col>
            <v-col cols="12" md="6">
              <div class="text-subtitle-2 mb-2">{{ t('components.converter.outputFormat') }}</div>
              <v-select
                v-model="(localBlock as NumberFormatBlock).outputDecimalSeparator"
                :items="[
                  { title: t('components.converter.periodSeparator'), value: '.' },
                  { title: t('common.csvOptions.comma'), value: ',' },
                ]"
                :label="t('components.converter.decimalSeparator')"
                variant="outlined"
                density="compact"
                class="mb-2"
              />
              <v-select
                v-model="(localBlock as NumberFormatBlock).outputThousandsSeparator"
                :items="[
                  { title: t('common.labels.none'), value: '' },
                  { title: t('components.converter.periodSeparator'), value: '.' },
                  { title: t('common.csvOptions.comma'), value: ',' },
                  { title: t('components.converter.space'), value: ' ' },
                ]"
                :label="t('components.converter.thousandsSeparator')"
                variant="outlined"
                density="compact"
              />
            </v-col>
          </v-row>
          <v-row>
            <v-col cols="12" md="6">
              <v-text-field
                v-model.number="(localBlock as NumberFormatBlock).decimals"
                :label="t('components.converter.decimalPlaces')"
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
                :label="t('components.converter.absoluteValue')"
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
            :label="t('components.converter.matchCurrentValue')"
            :hint="t('components.converter.matchCurrentValueHint')"
            persistent-hint
            class="mb-4"
          />
          <v-row>
            <v-col cols="12" sm="4">
              <v-select
                v-model="(localBlock as ConditionalBlock).condition.column"
                :items="sourceColumns"
                :label="t('components.converter.sourceColumn')"
                variant="outlined"
                :disabled="(localBlock as ConditionalBlock).condition.useCurrentValue"
              />
            </v-col>
            <v-col cols="12" sm="4">
              <v-select
                v-model="(localBlock as ConditionalBlock).condition.operator"
                :items="conditionOperators"
                :label="t('components.converter.operator')"
                variant="outlined"
              />
            </v-col>
            <v-col cols="12" sm="4">
              <v-text-field
                v-model="(localBlock as ConditionalBlock).condition.value"
                :label="t('common.labels.value')"
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
                :label="t('components.converter.thenLabel')"
                :blocks="(localBlock as ConditionalBlock).thenBlocks"
                :source-columns="sourceColumns"
                :empty-text="t('components.converter.thenEmptyText')"
                @update:blocks="(localBlock as ConditionalBlock).thenBlocks = $event"
              />
            </v-col>
            <v-col cols="12" md="6">
              <NestedBlocksEditor
                :label="t('components.converter.elseLabel')"
                :blocks="(localBlock as ConditionalBlock).elseBlocks"
                :source-columns="sourceColumns"
                :empty-text="t('components.converter.elseEmptyText')"
                @update:blocks="(localBlock as ConditionalBlock).elseBlocks = $event"
              />
            </v-col>
          </v-row>
        </template>

        <!-- Switch Case Block -->
        <template v-else-if="localBlock.type === 'switchCase'">
          <v-checkbox
            v-model="(localBlock as SwitchCaseBlock).useCurrentValue"
            :label="t('components.converter.matchCurrentValue')"
            :hint="t('components.converter.matchCurrentValueHint')"
            persistent-hint
            class="mb-4"
          />
          <v-select
            v-model="(localBlock as SwitchCaseBlock).column"
            :items="sourceColumns"
            :label="t('components.converter.sourceColumn')"
            variant="outlined"
            :hint="t('components.converter.caseColumnHint')"
            persistent-hint
            class="mb-4"
            :disabled="(localBlock as SwitchCaseBlock).useCurrentValue"
          />

          <div class="text-subtitle-2 mb-2">{{ t('components.converter.cases') }}</div>
          <v-expansion-panels variant="accordion" class="mb-4">
            <v-expansion-panel
              v-for="(caseItem, index) in (localBlock as SwitchCaseBlock).cases"
              :key="index"
            >
              <v-expansion-panel-title>
                <div class="d-flex align-center ga-2 flex-grow-1">
                  <v-chip size="x-small" color="primary"
                    >{{ t('components.converter.case') }} {{ index + 1 }}</v-chip
                  >
                  <span class="text-body-2"> {{ caseItem.operator }} "{{ caseItem.value }}" </span>
                  <v-chip size="x-small" class="ml-auto mr-2">
                    {{ t('components.converter.blocksCount', { count: caseItem.blocks.length }) }}
                  </v-chip>
                </div>
              </v-expansion-panel-title>
              <v-expansion-panel-text>
                <v-row dense class="mb-3">
                  <v-col cols="12" sm="5">
                    <v-select
                      v-model="caseItem.operator"
                      :items="conditionOperators"
                      :label="t('components.converter.operator')"
                      variant="outlined"
                      density="compact"
                    />
                  </v-col>
                  <v-col cols="12" sm="5">
                    <v-text-field
                      v-model="caseItem.value"
                      :label="t('common.labels.value')"
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
                      {{ t('common.buttons.delete') }}
                    </v-btn>
                  </v-col>
                </v-row>
                <NestedBlocksEditor
                  :label="t('components.converter.outputBlocks')"
                  :blocks="caseItem.blocks"
                  :source-columns="sourceColumns"
                  :empty-text="t('components.converter.caseEmptyText')"
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
            {{ t('components.converter.addCase') }}
          </v-btn>

          <NestedBlocksEditor
            :label="t('components.converter.defaultLabel')"
            :blocks="(localBlock as SwitchCaseBlock).defaultBlocks"
            :source-columns="sourceColumns"
            :empty-text="t('components.converter.defaultEmptyText')"
            @update:blocks="(localBlock as SwitchCaseBlock).defaultBlocks = $event"
          />
        </template>

        <!-- Remove Row Block -->
        <template v-else-if="localBlock.type === 'removeRow'">
          <v-alert type="warning" variant="tonal" density="compact" class="mb-4">
            {{ t('components.converter.removeRowWarning') }}
          </v-alert>
          <v-row>
            <v-col cols="12" sm="4">
              <v-select
                v-model="(localBlock as RemoveRowBlock).condition.column"
                :items="sourceColumns"
                :label="t('components.converter.column')"
                variant="outlined"
              />
            </v-col>
            <v-col cols="12" sm="4">
              <v-select
                v-model="(localBlock as RemoveRowBlock).condition.operator"
                :items="conditionOperators"
                :label="t('components.converter.operator')"
                variant="outlined"
              />
            </v-col>
            <v-col cols="12" sm="4">
              <v-text-field
                v-model="(localBlock as RemoveRowBlock).condition.value"
                :label="t('common.labels.value')"
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
            :label="t('components.converter.prefix')"
            variant="outlined"
            :hint="t('components.converter.prefixHint')"
            persistent-hint
          />
        </template>

        <!-- Suffix Block -->
        <template v-else-if="localBlock.type === 'suffix'">
          <v-text-field
            v-model="(localBlock as SuffixBlock).suffix"
            :label="t('components.converter.suffix')"
            variant="outlined"
            :hint="t('components.converter.suffixHint')"
            persistent-hint
          />
        </template>

        <!-- Replace Block -->
        <template v-else-if="localBlock.type === 'replace'">
          <v-text-field
            v-model="(localBlock as ReplaceBlock).find"
            :label="t('components.converter.find')"
            variant="outlined"
            :hint="t('components.converter.findHint')"
            persistent-hint
            class="mb-4"
          />
          <v-text-field
            v-model="(localBlock as ReplaceBlock).replace"
            :label="t('components.converter.replaceWith')"
            variant="outlined"
            :hint="t('components.converter.replaceHint')"
            persistent-hint
            class="mb-4"
          />
          <v-checkbox
            v-model="(localBlock as ReplaceBlock).useRegex"
            :label="t('components.converter.useRegex')"
            hide-details
            class="mb-2"
          />
          <v-checkbox
            v-model="(localBlock as ReplaceBlock).caseInsensitive"
            :label="t('components.converter.caseInsensitive')"
            hide-details
          />
        </template>

        <!-- Custom Script Block -->
        <template v-else-if="localBlock.type === 'customScript'">
          <v-alert type="warning" variant="tonal" density="compact" class="mb-4">
            <strong>{{ t('common.labels.warning') }}:</strong>
            {{ t('components.converter.customScriptWarning') }}
          </v-alert>
          <v-textarea
            v-model="(localBlock as CustomScriptBlock).script"
            :label="t('components.converter.javaScriptCode')"
            variant="outlined"
            rows="8"
            font="monospace"
            :hint="t('components.converter.scriptHint')"
            persistent-hint
          />
        </template>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="onCancel">{{ t('common.buttons.cancel') }}</v-btn>
        <v-btn color="primary" @click="onSave">{{
          isEditing ? t('common.buttons.save') : t('common.buttons.add')
        }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
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

const { t } = useI18n();

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

const conditionOperators = computed(() => [
  { title: t('components.converter.operatorEquals'), value: 'equals' },
  { title: t('components.converter.operatorContains'), value: 'contains' },
  { title: t('components.converter.operatorStartsWith'), value: 'startsWith' },
  { title: t('components.converter.operatorEndsWith'), value: 'endsWith' },
  { title: t('components.converter.operatorGreaterThan'), value: 'greaterThan' },
  { title: t('components.converter.operatorLessThan'), value: 'lessThan' },
  { title: t('components.converter.operatorIsEmpty'), value: 'isEmpty' },
  { title: t('components.converter.operatorIsNotEmpty'), value: 'isNotEmpty' },
  { title: t('components.converter.operatorMatches'), value: 'matches' },
]);

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
