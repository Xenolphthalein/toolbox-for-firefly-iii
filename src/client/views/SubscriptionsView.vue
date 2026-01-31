<template>
  <div class="tool-view">
    <!-- Wizard Stepper -->
    <WizardStepper
      v-model="currentStep"
      :steps="wizardSteps"
      :can-proceed="canProceed"
      :loading="stepLoading"
      :disabled="loading || creating"
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
          :loading-text="t('common.status.fetchingTransactions')"
          :presets="['month', 'quarter', 'year']"
          @change="debouncedFetchCount"
          @load-more="loadMoreTransactions"
        >
          <template #options>
            <v-alert
              type="warning"
              variant="tonal"
              class="mt-4"
              density="compact"
              icon="mdi-lightbulb"
            >
              {{ t('views.subscriptions.tip') }}
            </v-alert>
          </template>
        </DateRangeStep>
      </template>

      <!-- Step 2: Find & Review Patterns -->
      <template #content-2>
        <!-- Progress Bar (shown during analysis) -->
        <ProgressCard
          :show="loading"
          :current="progress.current.value"
          :total="progress.total.value"
          :message="progress.message.value"
          icon="mdi-credit-card-clock"
        />

        <!-- Empty State - Not yet searched -->
        <EmptyState
          v-if="!loading && !hasSearched"
          icon="mdi-credit-card-clock"
          :title="t('common.messages.readyToAnalyze')"
          :subtitle="t('views.subscriptions.clickToDetect')"
        />

        <!-- Empty State - No patterns found -->
        <EmptyState
          v-else-if="!loading && patterns.length === 0 && hasSearched"
          icon="mdi-calendar-blank"
          :title="t('views.subscriptions.noPatternsFound')"
          :subtitle="t('views.subscriptions.tryExtendingRange')"
        />

        <!-- Results -->
        <template v-else-if="patterns.length > 0">
          <!-- Summary Card -->
          <ResultsSummaryCard
            :stats="[
              {
                label: t('views.subscriptions.subscriptionPatterns'),
                value: patterns.length,
                color: 'primary',
                icon: 'mdi-credit-card-clock',
              },
              {
                label: t('common.labels.totalTransactions'),
                value: totalTransactionCount,
                color: 'grey',
                icon: 'mdi-file-document-multiple',
              },
            ]"
            :show-select-all="false"
          />

          <!-- Subscription Pattern Panels -->
          <v-expansion-panels variant="accordion" class="subscription-panels">
            <v-expansion-panel v-for="pattern in patterns" :key="pattern.id" rounded="lg">
              <v-expansion-panel-title>
                <div class="d-flex align-center justify-space-between w-100 pr-4">
                  <div class="d-flex align-center">
                    <v-avatar :color="getPatternColor(pattern.pattern.type)" size="32" class="mr-3">
                      <v-icon color="white" size="small">{{
                        getPatternIcon(pattern.pattern.type)
                      }}</v-icon>
                    </v-avatar>
                    <div>
                      <span class="font-weight-medium">{{ pattern.description }}</span>
                      <div class="text-caption text-medium-emphasis">
                        {{ formatCurrency(pattern.averageAmount) }}
                        • {{ formatPatternType(pattern.pattern) }} •
                        {{
                          t('views.subscriptions.occurrences', {
                            count: pattern.transactions.length,
                          })
                        }}
                      </div>
                    </div>
                  </div>
                  <div class="d-flex align-center ga-2">
                    <ConfidenceBreakdown
                      v-if="pattern.confidenceBreakdown"
                      :score="pattern.pattern.confidence"
                      :items="getSubscriptionBreakdownItems(pattern.confidenceBreakdown)"
                    />
                    <ConfidenceChip v-else :score="pattern.pattern.confidence" />
                    <v-tooltip location="top">
                      <template #activator="{ props }">
                        <v-btn
                          v-bind="props"
                          icon="mdi-close"
                          size="x-small"
                          variant="text"
                          @click.stop="dismissPattern(pattern.id)"
                        />
                      </template>
                      <span>{{ t('views.subscriptions.dismissNotSubscription') }}</span>
                    </v-tooltip>
                  </div>
                </div>
              </v-expansion-panel-title>

              <v-expansion-panel-text>
                <!-- Pattern Details Header -->
                <div class="d-flex align-center justify-space-between mb-4 pt-2">
                  <div>
                    <div class="text-body-2 text-medium-emphasis">
                      {{ pattern.sourceAccount }} → {{ pattern.destinationAccount }}
                    </div>
                    <v-chip-group class="mt-2">
                      <v-chip size="small" color="primary" variant="outlined">
                        <v-icon start size="small">mdi-repeat</v-icon>
                        {{ formatPatternType(pattern.pattern) }}
                      </v-chip>
                      <v-chip v-if="hasAmountVariation(pattern)" size="small" variant="outlined">
                        <v-icon start size="small">mdi-cash-multiple</v-icon>
                        {{ formatCurrency(pattern.minAmount!) }} -
                        {{ formatCurrency(pattern.maxAmount!) }}
                      </v-chip>
                    </v-chip-group>
                  </div>
                  <v-btn
                    color="primary"
                    variant="flat"
                    prepend-icon="mdi-plus"
                    @click="openCreateDialog(pattern)"
                  >
                    {{ t('common.buttons.createSubscription') }}
                  </v-btn>
                </div>

                <!-- Transaction Cards -->
                <TransactionCard
                  v-for="transaction in pattern.transactions"
                  :key="transaction.id"
                  :transaction="transaction.attributes.transactions[0]"
                  variant="outlined"
                  class="mb-2"
                />
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
        </template>
      </template>

      <!-- Final Action Button (Find Patterns) -->
      <template #final-action>
        <FinalActionButton
          v-if="currentStep === 2"
          :has-run="hasSearched"
          :text="t('common.buttons.findSubscriptions')"
          :rerun-text="t('common.buttons.rescan')"
          icon="mdi-credit-card-clock"
          rerun-icon="mdi-refresh"
          :loading="loading"
          @click="findPatterns"
        />
      </template>
    </WizardStepper>

    <!-- Create Subscription Dialog -->
    <v-dialog v-model="createDialog" max-width="600">
      <v-card v-if="selectedPattern">
        <v-card-title>{{ t('common.buttons.createSubscription') }}</v-card-title>
        <v-card-text>
          <v-form ref="createForm">
            <v-text-field
              v-model="createData.name"
              :label="t('common.labels.name')"
              :rules="[
                (v) => !!v || t('views.subscriptions.createSubscriptionDialog.nameRequired'),
              ]"
              class="mb-4"
            />

            <v-row>
              <v-col cols="6">
                <v-text-field
                  v-model="createData.amountMin"
                  :label="t('common.labels.minimumAmount')"
                  type="number"
                  :rules="[
                    (v) =>
                      !!v ||
                      t('views.subscriptions.createSubscriptionDialog.minimumAmountRequired'),
                  ]"
                />
              </v-col>
              <v-col cols="6">
                <v-text-field
                  v-model="createData.amountMax"
                  :label="t('common.labels.maximumAmount')"
                  type="number"
                  :rules="[
                    (v) =>
                      !!v ||
                      t('views.subscriptions.createSubscriptionDialog.maximumAmountRequired'),
                  ]"
                />
              </v-col>
            </v-row>

            <v-row class="mt-2">
              <v-col cols="6">
                <v-select
                  v-model="createData.repeatFreq"
                  :label="t('common.labels.frequency')"
                  :items="frequencyOptions"
                  item-title="text"
                  item-value="value"
                />
              </v-col>
              <v-col cols="6">
                <v-text-field
                  v-model="createData.skip"
                  :label="t('common.labels.skipPeriods')"
                  type="number"
                  min="0"
                  :hint="t('views.subscriptions.createSubscriptionDialog.skipPeriodsHint')"
                  persistent-hint
                />
              </v-col>
            </v-row>

            <v-text-field
              v-model="createData.date"
              :label="t('views.subscriptions.createSubscriptionDialog.expectedDateHint')"
              type="date"
              :rules="[
                (v) => !!v || t('views.subscriptions.createSubscriptionDialog.dateRequired'),
              ]"
              class="mt-4"
            />

            <v-textarea
              v-model="createData.notes"
              :label="t('views.subscriptions.createSubscriptionDialog.notesOptional')"
              rows="2"
              class="mt-4"
            />
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="createDialog = false">{{
            t('common.buttons.cancel')
          }}</v-btn>
          <v-btn color="primary" :loading="creating" @click="createSubscription">{{
            t('common.buttons.createSubscription')
          }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import api from '../services/api';
import type {
  SubscriptionPattern,
  SubscriptionConfidenceBreakdown,
  CreateSubscriptionRequest,
} from '@shared/types/app';
import {
  WizardStepper,
  TransactionCard,
  ConfidenceChip,
  ConfidenceBreakdown,
  EmptyState,
  DateRangeStep,
  ProgressCard,
  ResultsSummaryCard,
  FinalActionButton,
} from '../components/common';
import type { BreakdownItem } from '../components/common/ConfidenceBreakdown.vue';
import {
  useProgress,
  useTransactionPreview,
  useStreamProcessor,
  useSnackbar,
  type StreamEvent,
  type ProgressData,
  type ValidationErrorData,
} from '../composables';
import { formatCurrency, SubscriptionPatternSchema } from '../utils';

// i18n
const { t } = useI18n();

// Snackbar
const { showSnackbar } = useSnackbar();

// Wizard state
const currentStep = ref(1);
const wizardSteps = computed(() => [
  { title: t('common.steps.dateRange'), subtitle: t('common.steps.selectTransactionsToAnalyze') },
  {
    title: t('common.steps.findReview'),
    subtitle: t('views.subscriptions.steps.findReview.subtitle'),
  },
]);

// Step 1: Date range state
const startDate = ref<string>();
const endDate = ref<string>();

// Transaction preview composable
const preview = useTransactionPreview();

// Step 2: Analysis state
const loading = ref(false);
const creating = ref(false);
const hasSearched = ref(false);
const createDialog = ref(false);
const selectedPattern = ref<SubscriptionPattern | null>(null);
const patterns = ref<SubscriptionPattern[]>([]);

// Progress tracking composable
const progress = useProgress('Initializing...');

// Computed: Total transaction count across all patterns
const totalTransactionCount = computed(() =>
  patterns.value.reduce((sum, p) => sum + p.transactions.length, 0)
);

// Create dialog data
const createData = reactive({
  name: '',
  amountMin: '',
  amountMax: '',
  repeatFreq: 'monthly' as 'weekly' | 'monthly' | 'quarterly' | 'half-year' | 'yearly',
  skip: 0,
  date: '',
  notes: '',
});

const frequencyOptions = computed(() => [
  { text: t('views.subscriptions.frequencies.weekly'), value: 'weekly' },
  { text: t('views.subscriptions.frequencies.monthly'), value: 'monthly' },
  { text: t('views.subscriptions.frequencies.quarterly'), value: 'quarterly' },
  { text: t('views.subscriptions.frequencies.halfYearly'), value: 'half-year' },
  { text: t('views.subscriptions.frequencies.yearly'), value: 'yearly' },
]);

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
      return t('common.buttons.findSubscriptions');
    default:
      return t('common.buttons.next');
  }
});

const statusMessage = computed(() => {
  if (currentStep.value === 1) {
    if (preview.fetching.value) return t('common.messages.fetching');
    if (preview.count.value === null) return '';
    if (preview.count.value === 0) return t('common.messages.noTransactionsFound');
    return t('common.labels.countTransactions', { count: preview.count.value });
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
  await preview.fetchCount('/subscriptions/count-transactions', {
    startDate: startDate.value,
    endDate: endDate.value,
  });
}

// Load more transactions (using composable)
async function loadMoreTransactions() {
  await preview.loadMore('/subscriptions/count-transactions', {
    startDate: startDate.value,
    endDate: endDate.value,
  });
}

// Handle step navigation
function onStepNext(step: number) {
  // Auto-start pattern finding when entering step 2
  if (step === 2) {
    findPatterns();
  }
}

// Reset wizard
function onReset() {
  currentStep.value = 1;
  startDate.value = undefined;
  endDate.value = undefined;
  preview.reset();
  progress.reset();
  loading.value = false;
  hasSearched.value = false;
  patterns.value = [];
}

// Stream processor
const { processStream } = useStreamProcessor();

// Track validation errors during stream processing
const validationErrorCount = ref(0);

function handleStreamEvent(
  event: StreamEvent<SubscriptionPattern | ProgressData | ValidationErrorData | { error: string }>
) {
  switch (event.type) {
    case 'progress': {
      const progressData = event.data as ProgressData;
      progress.update(
        progressData.current || 0,
        progressData.total || 0,
        progressData.message ||
          t('views.subscriptions.analyzingPattern', {
            current: progressData.current,
            total: progressData.total,
          })
      );
      break;
    }
    case 'result': {
      const pattern = event.data as SubscriptionPattern;
      if (pattern && pattern.id) {
        patterns.value.push(pattern);
        patterns.value.sort((a, b) => b.pattern.confidence - a.pattern.confidence);
      }
      break;
    }
    case 'validation-error': {
      validationErrorCount.value++;
      break;
    }
    case 'error': {
      const errorData = event.data as { error: string };
      showSnackbar(errorData?.error || t('common.messages.somethingWentWrong'), 'error');
      break;
    }
    case 'complete':
      progress.message.value = 'Complete!';
      break;
  }
}

// Find patterns
async function findPatterns() {
  loading.value = true;
  hasSearched.value = true;
  patterns.value = [];
  progress.reset();
  validationErrorCount.value = 0;
  progress.message.value = 'Connecting...';

  try {
    await processStream(
      '/api/subscriptions/stream-find',
      { startDate: startDate.value, endDate: endDate.value },
      handleStreamEvent,
      { includeSession: true, resultSchema: SubscriptionPatternSchema }
    );

    if (validationErrorCount.value > 0) {
      showSnackbar(
        t('common.messages.itemsSkipped', { count: validationErrorCount.value }),
        'warning'
      );
    } else if (patterns.value.length > 0) {
      showSnackbar(
        t('views.subscriptions.foundPatterns', { count: patterns.value.length }),
        'info'
      );
    }
  } catch (error) {
    showSnackbar(
      error instanceof Error ? error.message : t('views.subscriptions.failedToFindPatterns'),
      'error'
    );
  } finally {
    loading.value = false;
  }
}

// Dismiss a pattern (user decided it's not a subscription)
function dismissPattern(patternId: string) {
  patterns.value = patterns.value.filter((p) => p.id !== patternId);
}

// Get breakdown items for the confidence breakdown component
function getSubscriptionBreakdownItems(
  breakdown: SubscriptionConfidenceBreakdown
): BreakdownItem[] {
  const items: BreakdownItem[] = [
    {
      label: t('common.labels.intervalConsistency'),
      value: breakdown.intervalConsistency,
      max: 0.5,
    },
    {
      label: t('common.labels.descriptionMatch'),
      value: breakdown.descriptionSimilarity,
      max: 0.3,
    },
    { label: t('common.labels.occurrenceCount'), value: breakdown.occurrenceCount, max: 0.15 },
    { label: t('common.labels.amountConsistency'), value: breakdown.amountConsistency, max: 0.05 },
  ];

  // Show payment service penalty if applicable
  if (breakdown.paymentServicePenalty < 0) {
    items.push({
      label: t('common.labels.paymentService'),
      value: breakdown.paymentServicePenalty,
      max: 0,
    });
  }

  return items;
}

// Helper functions
function hasAmountVariation(pattern: SubscriptionPattern): boolean {
  return (
    pattern.minAmount !== undefined &&
    pattern.maxAmount !== undefined &&
    pattern.minAmount !== pattern.maxAmount
  );
}

function getPatternColor(type: string): string {
  switch (type) {
    case 'weekly':
      return 'green';
    case 'monthly':
      return 'purple';
    case 'quarterly':
      return 'teal';
    case 'half-year':
      return 'indigo';
    case 'yearly':
      return 'orange';
    default:
      return 'grey';
  }
}

function getPatternIcon(type: string): string {
  switch (type) {
    case 'weekly':
      return 'mdi-calendar-week';
    case 'monthly':
      return 'mdi-calendar-month';
    case 'quarterly':
      return 'mdi-calendar-range';
    case 'half-year':
      return 'mdi-calendar-range';
    case 'yearly':
      return 'mdi-calendar';
    default:
      return 'mdi-credit-card-clock';
  }
}

function formatPatternType(pattern: SubscriptionPattern['pattern']): string {
  const { type, interval } = pattern;

  const typeLabels: Record<string, string> = {
    weekly: t('views.subscriptions.frequencies.weekly'),
    monthly: t('views.subscriptions.frequencies.monthly'),
    quarterly: t('views.subscriptions.frequencies.quarterly'),
    'half-year': t('views.subscriptions.frequencies.halfYearly'),
    yearly: t('views.subscriptions.frequencies.yearly'),
  };

  // interval 0 means every occurrence (no skip)
  if (interval === 0) {
    return typeLabels[type] || type;
  }

  // Special case for bi-weekly
  if (type === 'weekly' && interval === 1) {
    return t('views.subscriptions.everyOtherWeek');
  }

  // For other skip patterns (interval=1 means skip 1, so every 2nd occurrence)
  const unitLabels: Record<string, string> = {
    weekly: t('views.subscriptions.units.weeks'),
    monthly: t('views.subscriptions.units.months'),
    quarterly: t('views.subscriptions.units.quarters'),
    'half-year': t('views.subscriptions.units.halfYears'),
    yearly: t('views.subscriptions.units.years'),
  };

  return t('views.subscriptions.everyInterval', {
    interval: interval + 1,
    unit: unitLabels[type] || type,
  });
}

function openCreateDialog(pattern: SubscriptionPattern) {
  selectedPattern.value = pattern;
  createData.name = pattern.description;

  // Use min/max amounts if available, otherwise use average
  const minAmt = pattern.minAmount ?? pattern.averageAmount;
  const maxAmt = pattern.maxAmount ?? pattern.averageAmount;
  createData.amountMin = Math.abs(minAmt).toFixed(2);
  createData.amountMax = Math.abs(maxAmt).toFixed(2);

  // Map pattern type to subscription frequency
  createData.repeatFreq = pattern.pattern.type as typeof createData.repeatFreq;
  // Pattern interval directly maps to skip (0 = every time, 1 = every other, etc.)
  createData.skip = pattern.pattern.interval;

  // Calculate next expected date from the most recent transaction
  const lastTransaction = pattern.transactions[pattern.transactions.length - 1];
  const lastDate = lastTransaction?.attributes.transactions[0]?.date;
  if (lastDate) {
    createData.date = calculateNextDate(lastDate, pattern.pattern.type);
  } else {
    createData.date = new Date().toISOString().split('T')[0];
  }

  createData.notes = '';
  createDialog.value = true;
}

function calculateNextDate(lastDateStr: string, patternType: string): string {
  const date = new Date(lastDateStr);

  switch (patternType) {
    case 'weekly':
      date.setDate(date.getDate() + 7);
      break;
    case 'monthly':
      date.setMonth(date.getMonth() + 1);
      break;
    case 'quarterly':
      date.setMonth(date.getMonth() + 3);
      break;
    case 'half-year':
      date.setMonth(date.getMonth() + 6);
      break;
    case 'yearly':
      date.setFullYear(date.getFullYear() + 1);
      break;
  }

  return date.toISOString().split('T')[0];
}

async function createSubscription() {
  if (!selectedPattern.value) return;

  creating.value = true;

  try {
    const firstTransaction = selectedPattern.value.transactions[0]?.attributes.transactions[0];
    if (!firstTransaction) {
      throw new Error(t('views.subscriptions.noTransactionData'));
    }

    const request: CreateSubscriptionRequest = {
      name: createData.name,
      amountMin: createData.amountMin,
      amountMax: createData.amountMax,
      date: createData.date,
      repeatFreq: createData.repeatFreq,
      skip: createData.skip,
      currencyCode: firstTransaction.currency_code,
      notes: createData.notes || undefined,
      // Pass destination account for rule creation
      destinationAccountName: firstTransaction.destination_name,
      createRule: true,
    };

    const response = await api.post('/subscriptions/create', request);
    const ruleCreated = response.data?.data?.ruleCreated;

    showSnackbar(
      ruleCreated
        ? t('views.subscriptions.subscriptionAndRuleCreated')
        : t('views.subscriptions.subscriptionCreated'),
      'success'
    );
    createDialog.value = false;

    // Remove the pattern from the list
    patterns.value = patterns.value.filter((p) => p.id !== selectedPattern.value?.id);
  } catch (error) {
    showSnackbar(
      error instanceof Error ? error.message : t('views.subscriptions.failedToCreateSubscription'),
      'error'
    );
  } finally {
    creating.value = false;
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

.subscription-panels {
  gap: 8px;
}

.subscription-panels :deep(.v-expansion-panel) {
  border-radius: 16px !important;
}

.subscription-panels :deep(.v-expansion-panel-title) {
  border-radius: 16px;
}

.subscription-panels :deep(.v-expansion-panel--active > .v-expansion-panel-title) {
  border-radius: 16px 16px 0 0;
}

.subscription-panels :deep(.v-expansion-panel::after) {
  display: none;
}
</style>
