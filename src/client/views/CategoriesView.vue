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
          :loading-text="t('views.categories.loadingText')"
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
          :subtitle="t('views.categories.clickToAnalyze')"
        />

        <!-- Empty State - All categorized -->
        <EmptyState
          v-else-if="!loading && suggestions.length === 0 && hasSearched"
          icon="mdi-check-circle"
          :title="t('views.categories.allCategorized')"
          :subtitle="t('views.categories.noUncategorizedFound')"
        />

        <!-- Results -->
        <template v-else-if="suggestions.length > 0">
          <!-- Summary Card -->
          <ResultsSummaryCard
            :stats="[
              {
                icon: 'mdi-lightbulb',
                label: t('views.categories.suggestions', { count: classifiableSuggestions.length }),
                color: 'primary',
              },
              ...(unclassifiableSuggestions.length > 0
                ? [
                    {
                      icon: 'mdi-help-circle',
                      label: t('views.categories.unclassifiable', {
                        count: unclassifiableSuggestions.length,
                      }),
                      color: 'warning',
                    },
                  ]
                : []),
            ]"
            show-select-all
            :selectable-count="classifiableSuggestions.length"
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
            :class="{
              'border-primary': selection.isSelected(suggestion.transactionId),
              'border-warning': suggestion.unableToClassify,
            }"
          >
            <v-card-text>
              <div class="d-flex align-start">
                <v-checkbox
                  v-if="!suggestion.unableToClassify"
                  :model-value="selection.isSelected(suggestion.transactionId)"
                  hide-details
                  class="mr-4 mt-0"
                  @update:model-value="
                    selection.toggle(suggestion.transactionId, $event ?? undefined)
                  "
                />
                <v-icon v-else color="warning" class="mr-4 mt-1" size="24">
                  mdi-help-circle
                </v-icon>

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

                  <!-- Unable to classify message -->
                  <template v-if="suggestion.unableToClassify">
                    <v-alert type="warning" variant="tonal" density="compact" class="mb-0">
                      <strong>{{ t('views.categories.unableToClassify') }}:</strong>
                      {{ t('views.categories.aiCouldNotClassify') }}
                    </v-alert>

                    <v-expand-transition>
                      <div v-if="showReasoning[suggestion.transactionId]" class="mt-3">
                        <v-alert type="info" variant="tonal" density="compact">
                          <strong>{{ t('views.categories.aiReasoning') }}</strong>
                          {{ suggestion.reasoning }}
                        </v-alert>
                      </div>
                    </v-expand-transition>

                    <div class="d-flex justify-end mt-2">
                      <v-btn
                        size="small"
                        variant="text"
                        @click="toggleReasoning(suggestion.transactionId)"
                      >
                        {{
                          showReasoning[suggestion.transactionId]
                            ? t('views.categories.hideReasoning')
                            : t('views.categories.showReasoning')
                        }}
                      </v-btn>
                    </div>
                  </template>

                  <!-- Normal suggestion -->
                  <template v-else>
                    <div class="d-flex align-center justify-space-between">
                      <div class="d-flex align-center">
                        <v-icon color="primary" class="mr-2">mdi-arrow-right</v-icon>
                        <v-chip color="primary" variant="tonal">
                          <v-icon start>mdi-shape</v-icon>
                          {{ suggestion.suggestedCategoryName }}
                        </v-chip>
                        <ConfidenceChip :score="suggestion.confidence" class="ml-2" />
                      </div>

                      <v-btn
                        size="small"
                        variant="text"
                        @click="toggleReasoning(suggestion.transactionId)"
                      >
                        {{
                          showReasoning[suggestion.transactionId]
                            ? t('views.categories.hideReasoning')
                            : t('views.categories.showReasoning')
                        }}
                      </v-btn>
                    </div>

                    <v-expand-transition>
                      <div v-if="showReasoning[suggestion.transactionId]" class="mt-3">
                        <v-alert type="info" variant="tonal" density="compact">
                          <strong>{{ t('views.categories.aiReasoning') }}</strong>
                          {{ suggestion.reasoning }}
                        </v-alert>
                      </div>
                    </v-expand-transition>
                  </template>
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
import type { CategorySuggestion, TransactionUpdate } from '@shared/types/app';
import {
  WizardStepper,
  ConfidenceChip,
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
import { formatCurrency, formatDate, CategorySuggestionSchema } from '../utils';
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
  {
    title: t('common.steps.reviewApply'),
    subtitle: t('views.categories.steps.reviewApply.subtitle'),
  },
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
const suggestions = ref<CategorySuggestion[]>([]);
const showReasoning = reactive<Record<string, boolean>>({});

// Progress tracking composable
const progress = useProgress('Initializing...');

// Computed: Classifiable suggestions (can be applied)
const classifiableSuggestions = computed(() =>
  suggestions.value.filter((s) => !s.unableToClassify)
);

// Computed: Unclassifiable suggestions (AI couldn't determine category)
const unclassifiableSuggestions = computed(() =>
  suggestions.value.filter((s) => s.unableToClassify)
);

// Selection composable - only for classifiable suggestions
const selection = useSelection<string>(() => classifiableSuggestions.value.length);

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
    if (preview.count.value === 0) return t('views.categories.noUncategorized');
    return t('views.categories.uncategorized', { count: preview.count.value });
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
  await preview.fetchCount('/suggestions/count-uncategorized', {
    startDate: startDate.value,
    endDate: endDate.value,
  });
}

// Load more transactions (using composable)
async function loadMoreTransactions() {
  await preview.loadMore('/suggestions/count-uncategorized', {
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
  Object.keys(showReasoning).forEach((key) => delete showReasoning[key]);
}

// Stream processor
const { processStream } = useStreamProcessor();

// Track validation errors during stream processing
const validationErrorCount = ref(0);

function handleStreamEvent(
  event: StreamEvent<CategorySuggestion | ProgressData | ValidationErrorData | { error: string }>
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
      const suggestion = event.data as CategorySuggestion;
      if (suggestion && suggestion.transactionId) {
        suggestions.value.push(suggestion);
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
  progress.reset();
  validationErrorCount.value = 0;
  progress.message.value = t('common.messages.connectingToAI');

  try {
    await processStream(
      '/api/suggestions/stream-categories',
      {
        startDate: startDate.value,
        endDate: endDate.value,
        options: { maxSuggestions: 50, minConfidence: 0.3 },
      },
      handleStreamEvent,
      { resultSchema: CategorySuggestionSchema }
    );

    if (validationErrorCount.value > 0) {
      showSnackbar(
        t('common.messages.itemsSkipped', { count: validationErrorCount.value }),
        'warning'
      );
    } else if (suggestions.value.length > 0) {
      showSnackbar(
        t('views.categories.generatedSuggestions', { count: suggestions.value.length }),
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

function toggleSelectAll() {
  selection.toggleAll(classifiableSuggestions.value.map((s) => s.transactionId));
}

function toggleReasoning(id: string) {
  showReasoning[id] = !showReasoning[id];
}

async function applySelected() {
  applying.value = true;

  try {
    const updates: TransactionUpdate[] = suggestions.value
      .filter((s) => selection.isSelected(s.transactionId))
      .map((s) => ({
        transactionId: s.transactionId,
        journalId: s.transaction.transaction_journal_id,
        updates: {
          category_id: s.suggestedCategoryId,
          category_name: s.suggestedCategoryName,
        },
      }));

    const response = await api.post('/suggestions/apply-categories', { updates });

    const result = response.data.data;

    showSnackbar(
      t('views.categories.appliedCategories', {
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
      error instanceof Error ? error.message : t('views.categories.failedToApplyCategories'),
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
