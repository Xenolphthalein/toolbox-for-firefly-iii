<template>
  <div class="tool-view">
    <!-- AI Privacy Acknowledgment Required Warning -->
    <v-alert
      v-if="appStore.requiresAIAcknowledgment"
      type="warning"
      variant="tonal"
      class="mb-4"
      prominent
    >
      <v-alert-title>{{ t('common.ai.acknowledgmentRequired') }}</v-alert-title>
      <p class="mb-3">
        {{ t('common.ai.acknowledgmentMessage', { provider: appStore.aiProvider }) }}
      </p>
      <v-btn color="warning" variant="flat" :to="{ name: 'settings' }">
        <v-icon start>mdi-cog</v-icon>
        {{ t('common.buttons.goToSettings') }}
      </v-btn>
    </v-alert>

    <!-- Wizard Stepper -->
    <WizardStepper
      v-model="currentStep"
      :steps="wizardSteps"
      :can-proceed="canProceed"
      :loading="stepLoading"
      :disabled="loading || applying"
      :next-button-text="nextButtonText"
      :status-message="statusMessage"
      :status-color="statusColor"
      @next="onStepNext"
      @reset="onReset"
    >
      <!-- Step 1: Select Date Range -->
      <template #content-1>
        <DateRangeStep
          v-model:start-date="startDate"
          v-model:end-date="endDate"
          :transactions="preview.transactions.value"
          :count="preview.count.value ?? 0"
          :loading="preview.fetching.value || preview.loadingMore.value"
          :loading-text="t('views.tags.loadingText')"
          @change="debouncedFetchCount"
          @load-more="loadMoreTransactions"
        />
      </template>

      <!-- Step 2: Review & Apply Suggestions -->
      <template #content-2>
        <!-- Progress Bar (shown during streaming) -->
        <ProgressCard
          :show="loading"
          :current="progress.current.value"
          :total="progress.total.value"
          :message="progress.message.value"
          icon="mdi-brain"
        />

        <!-- Empty State - Not yet analyzed -->
        <EmptyState
          v-if="!loading && !hasSearched"
          icon="mdi-brain"
          :title="t('common.messages.readyToAnalyze')"
          :subtitle="t('views.tags.clickToAnalyze')"
        />

        <!-- Empty State - No suggestions -->
        <EmptyState
          v-else-if="!loading && suggestions.length === 0 && hasSearched"
          icon="mdi-tag-check"
          :title="t('views.tags.noSuggestionsAvailable')"
          :subtitle="t('views.tags.allProcessed')"
        />

        <!-- Results -->
        <template v-else-if="suggestions.length > 0">
          <!-- Summary Card -->
          <ResultsSummaryCard
            :stats="[
              {
                icon: 'mdi-tag-multiple',
                label: t('views.tags.transactionsWithSuggestions', { count: suggestions.length }),
                color: 'primary',
              },
            ]"
            show-select-all
            :selectable-count="suggestions.length"
            :all-selected="selection.allSelected.value"
            :selected-count="selection.selected.value.length"
            :action-text="t('common.buttons.applySelected')"
            action-color="success"
            action-icon="mdi-check-all"
            :action-loading="applying"
            @toggle-select-all="toggleSelectAll"
            @action="applySelected"
          />

          <!-- Suggestion Cards -->
          <v-card
            v-for="suggestion in suggestions"
            :key="suggestion.transactionId"
            class="mb-3"
            :class="{ 'border-primary': selection.isSelected(suggestion.transactionId) }"
          >
            <v-card-text>
              <div class="d-flex align-start">
                <v-checkbox
                  :model-value="selection.isSelected(suggestion.transactionId)"
                  hide-details
                  class="mr-4 mt-0"
                  @update:model-value="
                    selection.toggle(suggestion.transactionId, $event ?? undefined)
                  "
                />

                <div class="flex-grow-1">
                  <div class="d-flex align-center justify-space-between mb-2">
                    <div>
                      <div class="text-subtitle-1 font-weight-medium">
                        {{ suggestion.transaction.description }}
                      </div>
                      <div class="text-body-2 text-medium-emphasis">
                        {{ formatDate(suggestion.transaction.date) }} •
                        {{ suggestion.transaction.source_name }} →
                        {{ suggestion.transaction.destination_name }}
                      </div>
                    </div>
                    <div class="text-right">
                      <div
                        class="text-h6 font-weight-bold"
                        :class="amountClass(suggestion.transaction.type)"
                      >
                        {{ formatAmount(suggestion.transaction) }}
                      </div>
                    </div>
                  </div>

                  <v-divider class="my-3" />

                  <div class="text-subtitle-2 text-medium-emphasis mb-2">
                    {{ t('views.tags.suggestedTags') }}
                  </div>
                  <div class="d-flex flex-wrap ga-2">
                    <v-chip
                      v-for="tag in suggestion.suggestedTags"
                      :key="tag.tagId"
                      color="primary"
                      variant="tonal"
                      :closable="selectedTagsMap[suggestion.transactionId]?.has(tag.tagId)"
                      @click="toggleTag(suggestion.transactionId, tag)"
                      @click:close="toggleTag(suggestion.transactionId, tag)"
                    >
                      <template #prepend>
                        <v-icon
                          v-if="selectedTagsMap[suggestion.transactionId]?.has(tag.tagId)"
                          size="small"
                          class="mr-1"
                        >
                          mdi-check
                        </v-icon>
                        <v-icon v-else size="small" class="mr-1">mdi-tag</v-icon>
                      </template>
                      {{ tag.tagName }}
                      <template #append>
                        <span class="text-caption ml-2"
                          >({{ Math.round(tag.confidence * 100) }}%)</span
                        >
                      </template>
                    </v-chip>
                  </div>

                  <!-- Tag Reasoning -->
                  <v-expansion-panels class="mt-3" variant="accordion">
                    <v-expansion-panel>
                      <v-expansion-panel-title class="text-body-2">
                        {{ t('views.tags.viewReasoningForEachTag') }}
                      </v-expansion-panel-title>
                      <v-expansion-panel-text>
                        <v-list density="compact">
                          <v-list-item v-for="tag in suggestion.suggestedTags" :key="tag.tagId">
                            <template #prepend>
                              <v-chip size="small" color="primary" variant="outlined" class="mr-2">
                                {{ tag.tagName }}
                              </v-chip>
                            </template>
                            <v-list-item-subtitle>
                              {{ tag.reasoning }}
                            </v-list-item-subtitle>
                          </v-list-item>
                        </v-list>
                      </v-expansion-panel-text>
                    </v-expansion-panel>
                  </v-expansion-panels>
                </div>
              </div>
            </v-card-text>
          </v-card>
        </template>
      </template>

      <!-- Final Action Button (Get AI Suggestions) -->
      <template #final-action>
        <FinalActionButton
          v-if="currentStep === 2"
          :has-run="hasSearched"
          :text="t('common.buttons.getAISuggestions')"
          :rerun-text="t('common.buttons.reanalyze')"
          icon="mdi-brain"
          rerun-icon="mdi-refresh"
          :loading="loading"
          @click="getSuggestions"
        />
      </template>
    </WizardStepper>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import api from '../services/api';
import type { TagSuggestion, TransactionUpdate } from '@shared/types/app';
import {
  WizardStepper,
  EmptyState,
  DateRangeStep,
  ProgressCard,
  ResultsSummaryCard,
  FinalActionButton,
} from '../components/common';
import {
  useProgress,
  useSelection,
  useTransactionPreview,
  useStreamProcessor,
  useSnackbar,
  type StreamEvent,
  type ProgressData,
  type ValidationErrorData,
} from '../composables';
import { formatCurrency, formatDate, TagSuggestionSchema } from '../utils';
import { useAppStore } from '../stores/app';

// i18n
const { t } = useI18n();

// App store for AI acknowledgment check
const appStore = useAppStore();

// Snackbar
const { showSnackbar } = useSnackbar();

// Wizard state
const currentStep = ref(1);
const wizardSteps = computed(() => [
  { title: t('common.steps.dateRange'), subtitle: t('common.steps.selectTransactionsToAnalyze') },
  { title: t('common.steps.reviewApply'), subtitle: t('views.tags.steps.reviewApply.subtitle') },
]);

// Step 1: Date range state
const startDate = ref<string>();
const endDate = ref<string>();

// Transaction preview composable
const preview = useTransactionPreview();

// Step 2: Analysis state
const loading = ref(false);
const applying = ref(false);
const hasSearched = ref(false);
const suggestions = ref<TagSuggestion[]>([]);
const selectedTagsMap = reactive<Record<string, Set<string>>>({});

// Progress tracking composable
const progress = useProgress('Initializing...');

// Selection composable
const selection = useSelection<string>(() => suggestions.value.length);

// Computed: Can proceed to next step
const canProceed = computed(() => {
  switch (currentStep.value) {
    case 1:
      return preview.count.value !== null && preview.count.value > 0;
    default:
      return true;
  }
});

const stepLoading = computed(() => {
  switch (currentStep.value) {
    case 1:
      return preview.fetching.value;
    default:
      return false;
  }
});

const nextButtonText = computed(() => {
  switch (currentStep.value) {
    case 1:
      return t('common.buttons.getAISuggestions');
    default:
      return t('common.buttons.next');
  }
});

const statusMessage = computed(() => {
  if (currentStep.value === 1) {
    if (preview.fetching.value) return t('common.messages.fetching');
    if (preview.count.value === null) return '';
    if (preview.count.value === 0) return t('views.tags.noTransactions');
    return t('views.tags.toAnalyze', { count: preview.count.value });
  }
  return '';
});

const statusColor = computed(() => {
  if (currentStep.value === 1 && preview.count.value !== null) {
    return preview.count.value > 0 ? 'success' : 'warning';
  }
  return '';
});

// Debounce helper
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedFetchCount() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    fetchTransactionCount();
  }, 500);
}

// Fetch transaction count (using composable)
async function fetchTransactionCount() {
  await preview.fetchCount('/suggestions/count-untagged', {
    startDate: startDate.value,
    endDate: endDate.value,
  });
}

// Load more transactions (using composable)
async function loadMoreTransactions() {
  await preview.loadMore('/suggestions/count-untagged', {
    startDate: startDate.value,
    endDate: endDate.value,
  });
}

// Handle step navigation
function onStepNext(step: number) {
  // Auto-start analysis when entering step 2
  if (step === 2) {
    getSuggestions();
  }
}

// Reset wizard
function onReset() {
  currentStep.value = 1;
  startDate.value = undefined;
  endDate.value = undefined;
  preview.reset();
  progress.reset();
  selection.clear();
  loading.value = false;
  hasSearched.value = false;
  suggestions.value = [];
  Object.keys(selectedTagsMap).forEach((key) => delete selectedTagsMap[key]);
}

// Stream processor
const { processStream } = useStreamProcessor();

// Track validation errors during stream processing
const validationErrorCount = ref(0);

function handleStreamEvent(
  event: StreamEvent<TagSuggestion | ProgressData | ValidationErrorData | { error: string }>
) {
  switch (event.type) {
    case 'progress': {
      const progressData = event.data as ProgressData;
      progress.update(
        progressData.current || 0,
        progressData.total || 0,
        progressData.message ||
          t('common.messages.analyzingTransaction', {
            current: progressData.current,
            total: progressData.total,
          })
      );
      break;
    }
    case 'suggestion': {
      const suggestion = event.data as TagSuggestion;
      if (suggestion && suggestion.transactionId) {
        suggestions.value.push(suggestion);
        // Pre-select all suggested tags by default
        selectedTagsMap[suggestion.transactionId] = new Set(
          suggestion.suggestedTags.map((t) => t.tagId)
        );
      }
      break;
    }
    case 'validation-error': {
      validationErrorCount.value++;
      break;
    }
    case 'error': {
      const errorData = event.data as { error: string };
      showSnackbar(errorData?.error || t('common.errors.anErrorOccurred'), 'error');
      break;
    }
    case 'complete':
      progress.message.value = 'Complete!';
      break;
  }
}

// Get AI suggestions
async function getSuggestions() {
  // Check if AI acknowledgment is required before proceeding
  if (appStore.requiresAIAcknowledgment) {
    showSnackbar(t('common.messages.acknowledgeAIFirst'), 'warning');
    return;
  }

  loading.value = true;
  hasSearched.value = true;
  suggestions.value = [];
  selection.clear();
  Object.keys(selectedTagsMap).forEach((key) => delete selectedTagsMap[key]);
  progress.reset();
  validationErrorCount.value = 0;
  progress.message.value = t('common.messages.connectingToAI');

  try {
    await processStream(
      '/api/suggestions/stream-tags',
      {
        startDate: startDate.value,
        endDate: endDate.value,
        options: { maxSuggestions: 50, minConfidence: 0.3 },
      },
      handleStreamEvent,
      { resultSchema: TagSuggestionSchema }
    );

    if (validationErrorCount.value > 0) {
      showSnackbar(
        t('common.messages.itemsSkipped', { count: validationErrorCount.value }),
        'warning'
      );
    } else if (suggestions.value.length > 0) {
      showSnackbar(
        t('views.tags.generatedSuggestions', { count: suggestions.value.length }),
        'info'
      );
    }
  } catch (error) {
    showSnackbar(
      error instanceof Error ? error.message : t('common.errors.failedToGetSuggestions'),
      'error'
    );
  } finally {
    loading.value = false;
  }
}

// Helper functions
function formatAmount(transaction: { amount: string; currency_code: string }) {
  return formatCurrency(
    Math.abs(parseFloat(transaction.amount)),
    transaction.currency_code || 'EUR'
  );
}

function amountClass(type: string): string {
  if (type === 'deposit') return 'text-success';
  if (type === 'withdrawal') return 'text-error';
  return '';
}

function toggleTag(transactionId: string, tag: { tagId: string }) {
  if (!selectedTagsMap[transactionId]) {
    selectedTagsMap[transactionId] = new Set();
  }

  if (selectedTagsMap[transactionId].has(tag.tagId)) {
    selectedTagsMap[transactionId].delete(tag.tagId);
  } else {
    selectedTagsMap[transactionId].add(tag.tagId);
  }
}

function toggleSelectAll() {
  selection.toggleAll(suggestions.value.map((s) => s.transactionId));
}

async function applySelected() {
  applying.value = true;

  try {
    const updates: TransactionUpdate[] = suggestions.value
      .filter((s) => selection.isSelected(s.transactionId))
      .map((s) => {
        const selectedTags = selectedTagsMap[s.transactionId] || new Set();
        const tagNames = s.suggestedTags
          .filter((t) => selectedTags.has(t.tagId))
          .map((t) => t.tagName);

        const existingTags = s.transaction.tags || [];
        const allTags = [...new Set([...existingTags, ...tagNames])];

        return {
          transactionId: s.transactionId,
          journalId: s.transaction.transaction_journal_id,
          updates: {
            tags: allTags,
          },
        };
      });

    const response = await api.post('/suggestions/apply-tags', { updates });

    const result = response.data.data;

    showSnackbar(
      t('views.tags.appliedTags', {
        successful: result.successful.length,
        failed: result.failed.length,
      }),
      result.failed.length > 0 ? 'warning' : 'success'
    );

    suggestions.value = suggestions.value.filter(
      (s) => !result.successful.includes(s.transactionId)
    );
    selection.clear();
  } catch (error) {
    showSnackbar(
      error instanceof Error ? error.message : t('views.tags.failedToApplyTags'),
      'error'
    );
  } finally {
    applying.value = false;
  }
}
</script>

<style scoped>
.tool-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px;
}

.border-primary {
  border: 2px solid rgb(var(--v-theme-primary)) !important;
}
</style>
