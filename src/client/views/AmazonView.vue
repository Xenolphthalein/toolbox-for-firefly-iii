<template>
  <div class="tool-view">
    <!-- Wizard Stepper -->
    <WizardStepper
      v-model="currentStep"
      :steps="wizardSteps"
      :can-proceed="canProceed"
      :loading="stepLoading"
      :disabled="matching || applying"
      :next-button-text="nextButtonText"
      :status-message="statusMessage"
      :status-color="statusColor"
      @next="onStepNext"
      @reset="onReset"
    >
      <!-- Step 1: Upload Orders -->
      <template #content-1>
        <div class="step-1-content">
          <!-- Row 1: File Upload -->
          <FileUploadCard
            v-model:file="uploadFile"
            :title="t('views.amazon.uploadTitle')"
            accept=".json,application/json"
            file-icon="mdi-file-document"
            :accept-label="t('views.amazon.acceptLabel')"
            :loading="uploading"
            @upload="uploadOrders"
          />

          <!-- Row 2: Orders Preview Table -->
          <v-card rounded="lg" class="preview-card data-preview-card">
            <v-card-title class="d-flex align-center justify-space-between py-2">
              <div class="d-flex align-center">
                <v-icon class="mr-2">mdi-package-variant</v-icon>
                {{ t('views.amazon.ordersPreview') }}
              </div>
              <v-chip v-if="loadedOrders.length > 0" size="small" color="success" variant="tonal">
                <v-icon start size="small">mdi-package</v-icon>
                {{ t('views.amazon.ordersCount', { count: loadedOrders.length }) }}
              </v-chip>
            </v-card-title>
            <v-card-text>
              <EmptyState
                v-if="loadedOrders.length === 0"
                icon="mdi-package-variant-closed"
                :title="t('views.amazon.noOrdersLoaded')"
                :subtitle="t('views.amazon.uploadFileToPreview')"
              />
              <template v-else>
                <div class="preview-table-container">
                  <v-table density="compact" class="preview-table">
                    <thead>
                      <tr>
                        <th>{{ t('views.amazon.orderID') }}</th>
                        <th>{{ t('common.labels.date') }}</th>
                        <th>{{ t('views.amazon.items') }}</th>
                        <th class="text-right">{{ t('common.labels.amount') }}</th>
                        <th>{{ t('common.labels.status') }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="order in previewOrders" :key="order.orderId">
                        <td class="text-no-wrap">
                          <code class="text-caption">{{ order.orderId }}</code>
                        </td>
                        <td class="text-no-wrap">{{ formatDate(order.orderDate) }}</td>
                        <td>
                          <v-tooltip location="top">
                            <template #activator="{ props: tooltipProps }">
                              <span v-bind="tooltipProps" class="cursor-help">
                                {{ t('views.amazon.itemsCount', { count: order.items.length }) }}
                              </span>
                            </template>
                            <div class="text-caption">
                              <div v-for="(item, idx) in order.items.slice(0, 5)" :key="idx">
                                {{ item.quantity }}x {{ item.title.slice(0, 50)
                                }}{{ item.title.length > 50 ? '...' : '' }}
                              </div>
                              <div v-if="order.items.length > 5" class="text-medium-emphasis">
                                {{ t('common.labels.andMore', { count: order.items.length - 5 }) }}
                              </div>
                            </div>
                          </v-tooltip>
                        </td>
                        <td class="text-right text-no-wrap font-weight-medium">
                          {{ formatCurrency(order.totalAmount, order.currency) }}
                        </td>
                        <td>
                          <v-chip
                            size="x-small"
                            :color="order.orderStatus === 'Closed' ? 'success' : 'warning'"
                            variant="tonal"
                          >
                            {{ order.orderStatus }}
                          </v-chip>
                        </td>
                      </tr>
                    </tbody>
                  </v-table>
                </div>
                <div
                  v-if="loadedOrders.length > 10"
                  class="text-center text-caption text-medium-emphasis pt-3"
                >
                  {{ t('views.amazon.showingFirst10', { total: loadedOrders.length }) }}
                </div>
              </template>
            </v-card-text>
          </v-card>
        </div>
      </template>

      <!-- Step 2: Configure Date Range -->
      <template #content-2>
        <DateRangeStep
          v-model:start-date="startDate"
          v-model:end-date="endDate"
          :transactions="preview.transactions.value"
          :count="preview.count.value ?? 0"
          :loading="preview.fetching.value || preview.loadingMore.value"
          :loading-text="t('views.amazon.loadingText')"
          @change="debouncedFetchTransactions"
          @load-more="loadMoreTransactions"
        >
          <template #options>
            <v-checkbox
              v-model="excludeProcessed"
              :label="t('common.labels.hideAlreadyProcessed')"
              :hint="t('views.amazon.alreadyProcessedHint')"
              persistent-hint
              hide-details="auto"
              density="compact"
              class="mt-2"
              @update:model-value="debouncedFetchTransactions"
            />
          </template>
        </DateRangeStep>
      </template>

      <!-- Step 3: Match & Review Results -->
      <template #content-3>
        <!-- Progress Bar (shown during matching) -->
        <ProgressCard
          :show="matching"
          :current="progress.current.value"
          :total="progress.total.value"
          :message="progress.message.value"
          icon="mdi-package-variant"
        />

        <!-- Empty State -->
        <EmptyState
          v-if="!matching && matchResults.length === 0"
          icon="mdi-magnify"
          :title="t('common.messages.readyToMatch')"
          :subtitle="t('views.amazon.clickToMatch')"
        />

        <!-- Results -->
        <template v-else-if="matchResults.length > 0">
          <!-- Summary Card -->
          <ResultsSummaryCard
            :stats="[
              {
                icon: 'mdi-check',
                label: t('common.labels.countMatches', {
                  count: matchResults.filter((m) => m.matchedOrder).length,
                }),
                color: 'success',
              },
              {
                icon: 'mdi-help',
                label: t('common.labels.countUnmatched', {
                  count: matchResults.filter((m) => !m.matchedOrder).length,
                }),
                color: 'grey',
              },
            ]"
            :show-select-all="matchResults.filter((m) => m.matchedOrder).length > 0"
            :selectable-count="matchResults.filter((m) => m.matchedOrder).length"
            :all-selected="allMatchesSelected"
            :selected-count="selection.selected.value.length"
            :select-all-text="t('common.labels.selectAllMatches')"
            :action-text="t('common.buttons.applySelected')"
            action-color="success"
            action-icon="mdi-check-all"
            :action-loading="applying"
            @toggle-select-all="toggleSelectAllMatches"
            @action="applySelected"
          />

          <!-- Match Results -->
          <v-card
            v-for="result in matchResults"
            :key="result.transactionId"
            class="mb-3"
            :class="{ 'border-primary': selection.isSelected(result.transactionId) }"
          >
            <v-card-text>
              <div class="d-flex align-start">
                <v-checkbox
                  v-if="result.matchedOrder"
                  :model-value="selection.isSelected(result.transactionId)"
                  hide-details
                  class="mr-4 mt-0"
                  @update:model-value="selection.toggle(result.transactionId, $event ?? undefined)"
                />
                <div v-else class="mr-4" style="width: 40px" />

                <div class="flex-grow-1">
                  <div class="d-flex align-center justify-space-between mb-2">
                    <div>
                      <div class="text-subtitle-1 font-weight-medium">
                        {{ result.transaction.description }}
                      </div>
                      <div class="text-body-2 text-medium-emphasis">
                        {{ formatDate(result.transaction.date) }}
                      </div>
                    </div>
                    <div class="text-right">
                      <div class="text-h6 font-weight-bold text-error">
                        {{
                          formatCurrency(
                            parseFloat(result.transaction.amount),
                            result.transaction.currency_code
                          )
                        }}
                      </div>
                      <ConfidenceBreakdown
                        v-if="result.matchedOrder && result.confidenceBreakdown"
                        :score="result.matchConfidence"
                        :items="getAmazonBreakdownItems(result.confidenceBreakdown)"
                      />
                      <ConfidenceChip
                        v-else-if="result.matchedOrder"
                        :score="result.matchConfidence"
                      />
                      <v-chip v-else size="small" color="grey" variant="outlined">
                        {{ t('common.labels.noMatch') }}
                      </v-chip>
                    </div>
                  </div>

                  <template v-if="result.matchedOrder">
                    <v-divider class="my-3" />

                    <v-alert
                      type="success"
                      variant="tonal"
                      density="compact"
                      class="mb-3"
                      icon="mdi-link-variant"
                    >
                      <strong>{{ t('views.amazon.matchedOrder') }}</strong>
                      <span class="ml-2">{{ result.matchedOrder.orderId }}</span>
                    </v-alert>

                    <div class="text-subtitle-2 mb-2">{{ t('views.amazon.orderItems') }}</div>
                    <v-list density="compact" class="bg-transparent">
                      <v-list-item
                        v-for="(item, idx) in result.matchedOrder.items"
                        :key="idx"
                        class="px-0"
                      >
                        <template #prepend>
                          <v-avatar size="24" color="amber" class="mr-2">
                            <span class="text-caption">{{ item.quantity }}</span>
                          </v-avatar>
                        </template>
                        <v-list-item-title class="text-body-2">
                          {{ item.title }}
                        </v-list-item-title>
                      </v-list-item>
                    </v-list>

                    <v-divider class="my-3" />

                    <div class="text-subtitle-2 mb-1">{{ t('views.amazon.newDescription') }}</div>
                    <v-text-field
                      v-model="customDescriptions[result.transactionId]"
                      density="compact"
                      hide-details
                      variant="outlined"
                      class="mb-3"
                    />

                    <div class="text-subtitle-2 mb-1">{{ t('views.amazon.newNotes') }}</div>
                    <v-textarea
                      v-model="customNotes[result.transactionId]"
                      density="compact"
                      hide-details
                      variant="outlined"
                      rows="3"
                      auto-grow
                    />
                  </template>
                </div>
              </div>
            </v-card-text>
          </v-card>
        </template>
      </template>

      <!-- Final Action Button (Match Transactions) -->
      <template #final-action>
        <FinalActionButton
          v-if="currentStep === 3"
          :has-run="hasMatched"
          :text="t('common.buttons.matchTransactions')"
          :rerun-text="t('common.buttons.rematch')"
          icon="mdi-magnify"
          rerun-icon="mdi-refresh"
          :loading="matching"
          @click="matchTransactions"
        />
      </template>
    </WizardStepper>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import api from '../services/api';
import type {
  AmazonOrder,
  AmazonMatchResult,
  ConfidenceBreakdown as AmazonConfidenceBreakdown,
} from '@shared/types/app';
import {
  WizardStepper,
  ConfidenceChip,
  ConfidenceBreakdown,
  EmptyState,
  DateRangeStep,
  ProgressCard,
  ResultsSummaryCard,
  FinalActionButton,
  FileUploadCard,
} from '../components/common';
import type { BreakdownItem } from '../components/common/ConfidenceBreakdown.vue';
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
import { formatCurrency, formatDate, AmazonMatchResultSchema, validateFileSize } from '../utils';

// i18n
const { t } = useI18n();

// Snackbar
const { showSnackbar } = useSnackbar();

// Wizard state
const currentStep = ref(1);
const wizardSteps = computed(() => [
  {
    title: t('views.amazon.steps.uploadOrders.title'),
    subtitle: t('views.amazon.steps.uploadOrders.subtitle'),
  },
  { title: t('common.steps.dateRange'), subtitle: t('common.steps.selectTransactionsToMatch') },
  { title: t('common.steps.matchReview'), subtitle: t('common.steps.reviewAndApplyChanges') },
]);

// Step 1: Upload state
const uploadFile = ref<File[]>([]);
const uploading = ref(false);
const loadedOrders = ref<AmazonOrder[]>([]);

// Preview first 10 orders for table display
const previewOrders = computed(() => loadedOrders.value.slice(0, 10));

// Step 2: Date range state
const startDate = ref<string>();
const endDate = ref<string>();
const excludeProcessed = ref(true);

// Transaction preview composable
const preview = useTransactionPreview();

// Step 3: Matching state
const matching = ref(false);
const applying = ref(false);
const hasMatched = ref(false);
const matchResults = ref<AmazonMatchResult[]>([]);
const customDescriptions = reactive<Record<string, string>>({});
const customNotes = reactive<Record<string, string>>({});

// Progress tracking composable
const progress = useProgress('Initializing...');

// Selection composable
const selection = useSelection<string>();

const allMatchesSelected = computed(() => {
  const matchedResults = matchResults.value.filter((m) => m.matchedOrder);
  return (
    matchedResults.length > 0 && matchedResults.every((m) => selection.isSelected(m.transactionId))
  );
});

// Computed: Can proceed to next step
const canProceed = computed(() => {
  switch (currentStep.value) {
    case 1:
      return loadedOrders.value.length > 0;
    case 2:
      return preview.count.value !== null && preview.count.value > 0;
    default:
      return true;
  }
});

const stepLoading = computed(() => {
  switch (currentStep.value) {
    case 1:
      return uploading.value;
    case 2:
      return preview.fetching.value;
    default:
      return false;
  }
});

const nextButtonText = computed(() => {
  switch (currentStep.value) {
    case 1:
      return t('common.steps.dateRange');
    case 2:
      return t('common.buttons.matchTransactions');
    default:
      return t('common.buttons.next');
  }
});

const statusMessage = computed(() => {
  if (currentStep.value === 1) {
    if (loadedOrders.value.length === 0) return '';
    return t('views.amazon.ordersCount', { count: loadedOrders.value.length });
  }
  if (currentStep.value === 2) {
    if (preview.fetching.value) return t('common.messages.fetching');
    if (preview.count.value === null) return '';
    if (preview.count.value === 0) return t('common.messages.noTransactionsFound');
    return t('common.labels.countTransactions', { count: preview.count.value });
  }
  return '';
});

const statusColor = computed(() => {
  if (currentStep.value === 1) {
    return loadedOrders.value.length > 0 ? 'success' : '';
  }
  if (currentStep.value === 2 && preview.count.value !== null) {
    return preview.count.value > 0 ? 'success' : 'warning';
  }
  return '';
});

// Debounce helper
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedFetchTransactions() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    fetchTransactionCount();
  }, 500);
}

// Fetch transaction count (using composable with extra param)
async function fetchTransactionCount() {
  await preview.fetchCount('/amazon/count-transactions', {
    startDate: startDate.value,
    endDate: endDate.value,
    excludeProcessed: excludeProcessed.value,
    extra: String(excludeProcessed.value),
  });
}

// Load more transactions (using composable)
async function loadMoreTransactions() {
  await preview.loadMore('/amazon/count-transactions', {
    startDate: startDate.value,
    endDate: endDate.value,
    excludeProcessed: excludeProcessed.value,
    extra: String(excludeProcessed.value),
  });
}

// Upload orders using FormData (SEC-004: stream file to server instead of reading into memory)
async function uploadOrders(fileOrFiles: File | File[] | null) {
  const file = Array.isArray(fileOrFiles) ? fileOrFiles[0] : fileOrFiles;

  if (!file) return;

  // Validate file size before processing (SEC-005)
  const sizeValidation = validateFileSize(file);
  if (!sizeValidation.valid) {
    showSnackbar(sizeValidation.error!, 'error');
    return;
  }

  uploading.value = true;

  try {
    // Use FormData to stream file directly to server (avoids memory issues with large files)
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post('/amazon/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    loadedOrders.value = response.data.data.orders;
    showSnackbar(t('views.amazon.loadedOrders', { count: loadedOrders.value.length }), 'success');
  } catch (error) {
    console.error('Upload error:', error);
    showSnackbar(
      error instanceof Error ? error.message : t('views.amazon.failedToUpload'),
      'error'
    );
  } finally {
    uploading.value = false;
    uploadFile.value = [];
  }
}

// Handle step navigation
function onStepNext(step: number) {
  if (step === 2) {
    // Entering step 2, fetch transactions if we have dates
    if (startDate.value || endDate.value) {
      fetchTransactionCount();
    }
  } else if (step === 3) {
    // Auto-start matching when entering step 3
    matchTransactions();
  }
}

// Reset wizard
async function onReset() {
  try {
    await api.delete('/amazon/orders');
  } catch {
    // Ignore errors on reset
  }

  currentStep.value = 1;
  uploadFile.value = [];
  loadedOrders.value = [];
  startDate.value = undefined;
  endDate.value = undefined;
  excludeProcessed.value = true;
  preview.reset();
  progress.reset();
  selection.clear();
  matching.value = false;
  hasMatched.value = false;
  matchResults.value = [];
  Object.keys(customDescriptions).forEach((key) => delete customDescriptions[key]);
  Object.keys(customNotes).forEach((key) => delete customNotes[key]);
}

// Stream processor
const { processStream } = useStreamProcessor();

// Track validation errors during stream processing
const validationErrorCount = ref(0);

function handleStreamEvent(
  event: StreamEvent<AmazonMatchResult | ProgressData | ValidationErrorData | { error: string }>
) {
  switch (event.type) {
    case 'progress': {
      const progressData = event.data as ProgressData;
      progress.update(
        progressData.current || 0,
        progressData.total || 0,
        progressData.message ||
          t('common.messages.matchingTransaction', {
            current: progressData.current,
            total: progressData.total,
          })
      );
      break;
    }
    case 'result': {
      const result = event.data as AmazonMatchResult;
      if (result && result.transactionId) {
        matchResults.value.push(result);
        if (result.matchedOrder) {
          customDescriptions[result.transactionId] = result.suggestedDescription || '';
          customNotes[result.transactionId] = result.suggestedNotes || '';
        }
        matchResults.value.sort((a, b) => b.matchConfidence - a.matchConfidence);
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

// Match transactions
async function matchTransactions() {
  matching.value = true;
  matchResults.value = [];
  selection.clear();
  progress.reset();
  validationErrorCount.value = 0;
  progress.message.value = 'Connecting...';

  try {
    await processStream(
      '/api/amazon/stream-match',
      {
        startDate: startDate.value,
        endDate: endDate.value,
        excludeProcessed: excludeProcessed.value,
      },
      handleStreamEvent,
      { includeSession: true, resultSchema: AmazonMatchResultSchema }
    );

    hasMatched.value = true;
    const matchCount = matchResults.value.filter((m) => m.matchedOrder).length;
    if (validationErrorCount.value > 0) {
      showSnackbar(
        t('common.messages.itemsSkipped', { count: validationErrorCount.value }),
        'warning'
      );
    } else if (matchCount > 0) {
      showSnackbar(
        t('views.amazon.foundMatches', { matches: matchCount, total: matchResults.value.length }),
        'info'
      );
    }
  } catch (error) {
    showSnackbar(
      error instanceof Error ? error.message : t('common.errors.failedToMatchTransactions'),
      'error'
    );
  } finally {
    matching.value = false;
  }
}

// Selection toggle for all matches
function toggleSelectAllMatches() {
  const matchedIds = matchResults.value.filter((m) => m.matchedOrder).map((m) => m.transactionId);
  selection.toggleAll(matchedIds);
}

// Apply selected matches
async function applySelected() {
  applying.value = true;

  try {
    const matches = matchResults.value
      .filter((r) => selection.isSelected(r.transactionId) && r.matchedOrder)
      .map((r) => ({
        transactionId: r.transactionId,
        journalId: r.transaction.transaction_journal_id,
        newDescription: customDescriptions[r.transactionId] || r.suggestedDescription,
        newNotes: customNotes[r.transactionId] || r.suggestedNotes,
      }));

    const response = await api.post('/amazon/apply', { matches });
    const result = response.data.data;

    showSnackbar(
      t('views.amazon.updatedDescriptions', {
        successful: result.successful.length,
        failed: result.failed.length > 0 ? result.failed.length : 0,
      }),
      result.failed.length > 0 ? 'warning' : 'success'
    );

    matchResults.value = matchResults.value.filter(
      (r) => !result.successful.includes(r.transactionId)
    );
    selection.clear();
  } catch (error) {
    showSnackbar(
      error instanceof Error ? error.message : t('common.errors.failedToApplyDescriptions'),
      'error'
    );
  } finally {
    applying.value = false;
  }
}

// Get breakdown items for the confidence breakdown component
function getAmazonBreakdownItems(breakdown: AmazonConfidenceBreakdown): BreakdownItem[] {
  return [
    { label: t('views.amazon.breakdown.orderIdMatch'), value: breakdown.orderIdMatch, max: 0.5 },
    { label: t('common.labels.amountMatch'), value: breakdown.amountMatch, max: 0.2 },
    { label: t('common.labels.exactAmountBonus'), value: breakdown.exactAmountBonus, max: 0.1 },
    { label: t('common.labels.dateProximity'), value: breakdown.dateProximity, max: 0.1 },
    {
      label: t('views.amazon.breakdown.itemTitleMatch'),
      value: breakdown.itemTitleMatch,
      max: 0.1,
    },
  ];
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

/* Step 1 layout */
.step-1-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 16px;
}

/* Preview card fills remaining space */
.preview-card {
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.preview-card :deep(.v-card-text) {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.preview-card .preview-table-container {
  flex: 1;
}

.data-preview-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 200px;
}

.preview-table-container {
  overflow-y: auto;
  border: 1px solid rgba(var(--v-border-color), 0.2);
  border-radius: 8px;
}

.preview-table {
  min-width: 100%;
}

.preview-table th {
  position: sticky;
  top: 0;
  background: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-border-color), 0.3);
  z-index: 1;
  color: rgb(var(--v-theme-primary));
  font-weight: 600;
}

.preview-table td {
  max-width: 200px;
}

.cursor-help {
  cursor: help;
  border-bottom: 1px dotted rgba(var(--v-border-color), 0.5);
}
</style>
