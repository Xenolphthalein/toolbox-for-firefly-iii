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
      <!-- Step 1: Upload Transactions -->
      <template #content-1>
        <div class="step-1-content">
          <!-- Row 1: File Upload -->
          <FileUploadCard
            v-model:file="uploadFile"
            :title="t('views.paypal.uploadTitle')"
            accept=".csv,text/csv"
            file-icon="mdi-file-delimited"
            :accept-label="t('views.paypal.acceptLabel')"
            :loading="uploading"
            @upload="uploadTransactions"
          />

          <!-- Row 2: Transactions Preview Table -->
          <v-card rounded="lg" class="preview-card data-preview-card">
            <v-card-title class="d-flex align-center justify-space-between py-2">
              <div class="d-flex align-center">
                <v-icon class="mr-2">mdi-credit-card</v-icon>
                {{ t('common.labels.transactionsPreview') }}
              </div>
              <v-chip
                v-if="loadedTransactions.length > 0"
                size="small"
                color="success"
                variant="tonal"
              >
                <v-icon start size="small">mdi-swap-horizontal</v-icon>
                {{ t('common.labels.countTransactions', { count: loadedTransactions.length }) }}
              </v-chip>
            </v-card-title>
            <v-card-text>
              <EmptyState
                v-if="loadedTransactions.length === 0"
                icon="mdi-credit-card-off"
                :title="t('common.messages.noTransactionsLoaded')"
                :subtitle="t('views.paypal.uploadFileToPreview')"
              />
              <template v-else>
                <div class="preview-table-container">
                  <v-table density="compact" class="preview-table">
                    <thead>
                      <tr>
                        <th>{{ t('common.labels.date') }}</th>
                        <th>{{ t('common.labels.name') }}</th>
                        <th>{{ t('common.labels.type') }}</th>
                        <th class="text-right">{{ t('views.paypal.gross') }}</th>
                        <th class="text-right">{{ t('views.paypal.fee') }}</th>
                        <th>{{ t('common.labels.status') }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        v-for="(txn, idx) in previewTransactions"
                        :key="txn.transactionCode || idx"
                      >
                        <td class="text-no-wrap">{{ txn.date }}</td>
                        <td class="text-truncate" style="max-width: 200px">
                          {{ txn.name || '—' }}
                        </td>
                        <td class="text-no-wrap">
                          <v-chip size="x-small" variant="tonal">
                            {{ txn.type }}
                          </v-chip>
                        </td>
                        <td
                          class="text-right text-no-wrap font-weight-medium"
                          :class="txn.gross >= 0 ? 'text-success' : 'text-error'"
                        >
                          {{ formatCurrency(txn.gross, txn.currency) }}
                        </td>
                        <td class="text-right text-no-wrap text-medium-emphasis">
                          {{ txn.fee !== 0 ? formatCurrency(txn.fee, txn.currency) : '—' }}
                        </td>
                        <td>
                          <v-chip
                            size="x-small"
                            :color="txn.status === 'Abgeschlossen' ? 'success' : 'warning'"
                            variant="tonal"
                          >
                            {{ txn.status }}
                          </v-chip>
                        </td>
                      </tr>
                    </tbody>
                  </v-table>
                </div>
                <div
                  v-if="loadedTransactions.length > 10"
                  class="text-center text-caption text-medium-emphasis pt-3"
                >
                  {{ t('common.labels.showingFirst', { count: loadedTransactions.length }) }}
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
          loading-text="Fetching PayPal transactions..."
          @change="debouncedFetchTransactions"
          @load-more="loadMoreTransactions"
        >
          <template #options>
            <v-checkbox
              v-model="excludeProcessed"
              :label="t('common.labels.hideAlreadyProcessed')"
              :hint="t('views.paypal.alreadyProcessedHint')"
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
          icon="mdi-credit-card"
        />

        <!-- Empty State -->
        <EmptyState
          v-if="!matching && matchResults.length === 0"
          icon="mdi-magnify"
          :title="t('common.messages.readyToMatch')"
          :subtitle="t('common.messages.clickToMatchPaypal')"
        />

        <!-- Results -->
        <template v-else-if="matchResults.length > 0">
          <!-- Summary Card -->
          <ResultsSummaryCard
            :stats="[
              {
                icon: 'mdi-check',
                label: t('common.labels.countMatches', {
                  count: matchResults.filter((m) => m.matchedPayPalTransaction).length,
                }),
                color: 'success',
              },
              {
                icon: 'mdi-help',
                label: t('common.labels.countUnmatched', {
                  count: matchResults.filter((m) => !m.matchedPayPalTransaction).length,
                }),
                color: 'grey',
              },
            ]"
            :show-select-all="matchResults.filter((m) => m.matchedPayPalTransaction).length > 0"
            :selectable-count="matchResults.filter((m) => m.matchedPayPalTransaction).length"
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
            rounded="lg"
            class="mb-3"
            :class="{ 'border-primary': selection.isSelected(result.transactionId) }"
          >
            <v-card-text>
              <div class="d-flex align-start">
                <v-checkbox
                  v-if="result.matchedPayPalTransaction"
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
                      <v-tooltip
                        v-if="result.matchedPayPalTransaction && result.confidenceBreakdown"
                        location="left"
                      >
                        <template #activator="{ props }">
                          <span v-bind="props">
                            <ConfidenceChip
                              :score="result.matchConfidence"
                              class="cursor-pointer"
                            />
                          </span>
                        </template>
                        <div class="confidence-breakdown">
                          <div class="font-weight-bold mb-1">
                            {{ t('common.labels.confidenceBreakdown') }}
                          </div>
                          <div
                            v-if="result.confidenceBreakdown.transactionCodeMatch > 0"
                            class="d-flex justify-space-between"
                          >
                            <span>{{ t('views.paypal.confidenceBreakdown.transactionCode') }}</span>
                            <span class="ml-3"
                              >+{{
                                Math.round(result.confidenceBreakdown.transactionCodeMatch * 100)
                              }}%</span
                            >
                          </div>
                          <div
                            v-if="result.confidenceBreakdown.bankReferenceMatch > 0"
                            class="d-flex justify-space-between"
                          >
                            <span>{{ t('views.paypal.confidenceBreakdown.bankReference') }}</span>
                            <span class="ml-3"
                              >+{{
                                Math.round(result.confidenceBreakdown.bankReferenceMatch * 100)
                              }}%</span
                            >
                          </div>
                          <div
                            v-if="result.confidenceBreakdown.amountMatch > 0"
                            class="d-flex justify-space-between"
                          >
                            <span>{{ t('views.paypal.confidenceBreakdown.amountMatch') }}</span>
                            <span class="ml-3"
                              >+{{
                                Math.round(result.confidenceBreakdown.amountMatch * 100)
                              }}%</span
                            >
                          </div>
                          <div
                            v-if="result.confidenceBreakdown.exactAmountBonus > 0"
                            class="d-flex justify-space-between"
                          >
                            <span>{{
                              t('views.paypal.confidenceBreakdown.exactAmountBonus')
                            }}</span>
                            <span class="ml-3"
                              >+{{
                                Math.round(result.confidenceBreakdown.exactAmountBonus * 100)
                              }}%</span
                            >
                          </div>
                          <div
                            v-if="result.confidenceBreakdown.dateProximity > 0"
                            class="d-flex justify-space-between"
                          >
                            <span>{{ t('views.paypal.confidenceBreakdown.dateProximity') }}</span>
                            <span class="ml-3"
                              >+{{
                                Math.round(result.confidenceBreakdown.dateProximity * 100)
                              }}%</span
                            >
                          </div>
                          <div
                            v-if="result.confidenceBreakdown.nameMatch > 0"
                            class="d-flex justify-space-between"
                          >
                            <span>{{ t('views.paypal.confidenceBreakdown.nameMatch') }}</span>
                            <span class="ml-3"
                              >+{{ Math.round(result.confidenceBreakdown.nameMatch * 100) }}%</span
                            >
                          </div>
                          <v-divider class="my-1" />
                          <div class="d-flex justify-space-between font-weight-bold">
                            <span>{{ t('views.paypal.confidenceBreakdown.total') }}</span>
                            <span class="ml-3"
                              >{{ Math.round(result.matchConfidence * 100) }}%</span
                            >
                          </div>
                        </div>
                      </v-tooltip>
                      <ConfidenceChip
                        v-else-if="result.matchedPayPalTransaction"
                        :score="result.matchConfidence"
                      />
                      <v-chip v-else size="small" color="grey" variant="outlined">
                        {{ t('common.labels.noMatch') }}
                      </v-chip>
                    </div>
                  </div>

                  <template v-if="result.matchedPayPalTransaction">
                    <v-divider class="my-3" />

                    <v-alert
                      type="success"
                      variant="tonal"
                      density="compact"
                      class="mb-3"
                      icon="mdi-link-variant"
                    >
                      <strong>{{ t('views.paypal.matchedPaypal') }}:</strong>
                      <span class="ml-2">{{
                        result.matchedPayPalTransaction.transactionCode
                      }}</span>
                    </v-alert>

                    <div class="text-subtitle-2 mb-2">{{ t('views.paypal.paypalDetails') }}:</div>
                    <v-list density="compact" class="bg-transparent">
                      <v-list-item class="px-0">
                        <template #prepend>
                          <v-icon size="small" class="mr-2">mdi-account</v-icon>
                        </template>
                        <v-list-item-title class="text-body-2">
                          {{ result.matchedPayPalTransaction.name }}
                        </v-list-item-title>
                        <v-list-item-subtitle v-if="result.matchedPayPalTransaction.recipientEmail">
                          {{ result.matchedPayPalTransaction.recipientEmail }}
                        </v-list-item-subtitle>
                      </v-list-item>
                      <v-list-item
                        v-if="result.matchedPayPalTransaction.itemDescription"
                        class="px-0"
                      >
                        <template #prepend>
                          <v-icon size="small" class="mr-2">mdi-shopping</v-icon>
                        </template>
                        <v-list-item-title class="text-body-2">
                          {{ result.matchedPayPalTransaction.itemDescription }}
                        </v-list-item-title>
                      </v-list-item>
                      <v-list-item class="px-0">
                        <template #prepend>
                          <v-icon size="small" class="mr-2">mdi-cash</v-icon>
                        </template>
                        <v-list-item-title class="text-body-2">
                          {{ t('views.paypal.gross') }}:
                          {{
                            formatCurrency(
                              result.matchedPayPalTransaction.gross,
                              result.matchedPayPalTransaction.currency
                            )
                          }}
                          <span
                            v-if="result.matchedPayPalTransaction.fee !== 0"
                            class="text-medium-emphasis"
                          >
                            ({{ t('views.paypal.fee') }}:
                            {{
                              formatCurrency(
                                result.matchedPayPalTransaction.fee,
                                result.matchedPayPalTransaction.currency
                              )
                            }})
                          </span>
                        </v-list-item-title>
                      </v-list-item>
                    </v-list>

                    <v-divider class="my-3" />

                    <div class="text-subtitle-2 mb-1">{{ t('views.paypal.newDescription') }}:</div>
                    <v-text-field
                      v-model="customDescriptions[result.transactionId]"
                      density="compact"
                      hide-details
                      variant="outlined"
                      class="mb-3"
                    />

                    <div class="text-subtitle-2 mb-1">{{ t('views.paypal.newNotes') }}:</div>
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
import type { PayPalTransaction, PayPalMatchResult } from '@shared/types/app';
import {
  WizardStepper,
  ConfidenceChip,
  EmptyState,
  DateRangeStep,
  ProgressCard,
  ResultsSummaryCard,
  FinalActionButton,
  FileUploadCard,
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
import { formatCurrency, formatDate, PayPalMatchResultSchema, validateFileSize } from '../utils';

// Snackbar
const { showSnackbar } = useSnackbar();

const { t } = useI18n();

// Wizard state
const currentStep = ref(1);
const wizardSteps = computed(() => [
  {
    title: t('views.paypal.steps.uploadActivity.title'),
    subtitle: t('views.paypal.steps.uploadActivity.subtitle'),
  },
  { title: t('common.steps.dateRange'), subtitle: t('common.steps.selectTransactionsToMatch') },
  { title: t('common.steps.matchReview'), subtitle: t('common.steps.reviewAndApplyChanges') },
]);

// Step 1: Upload state
const uploadFile = ref<File[]>([]);
const uploading = ref(false);
const loadedTransactions = ref<PayPalTransaction[]>([]);

// Preview first 10 transactions for table display
const previewTransactions = computed(() => loadedTransactions.value.slice(0, 10));

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
const matchResults = ref<PayPalMatchResult[]>([]);
const customDescriptions = reactive<Record<string, string>>({});
const customNotes = reactive<Record<string, string>>({});

// Progress tracking composable
const progress = useProgress('Initializing...');

// Selection composable
const selection = useSelection<string>();

const allMatchesSelected = computed(() => {
  const matchedResults = matchResults.value.filter((m) => m.matchedPayPalTransaction);
  return (
    matchedResults.length > 0 && matchedResults.every((m) => selection.isSelected(m.transactionId))
  );
});

// Computed: Can proceed to next step
const canProceed = computed(() => {
  switch (currentStep.value) {
    case 1:
      return loadedTransactions.value.length > 0;
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
      return t('views.paypal.buttons.configureDateRange');
    case 2:
      return t('common.buttons.matchTransactions');
    default:
      return t('common.buttons.next');
  }
});

const statusMessage = computed(() => {
  if (currentStep.value === 1) {
    if (loadedTransactions.value.length === 0) return '';
    return t('common.labels.countTransactionsLoaded', { count: loadedTransactions.value.length });
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
    return loadedTransactions.value.length > 0 ? 'success' : '';
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

// Fetch transaction count for current date range
async function fetchTransactionCount() {
  await preview.fetchCount('/paypal/count-transactions', {
    startDate: startDate.value,
    endDate: endDate.value,
    excludeProcessed: excludeProcessed.value,
    extra: `excludeProcessed-${excludeProcessed.value}`,
  });
}

// Load more transactions (pagination)
async function loadMoreTransactions() {
  await preview.loadMore('/paypal/count-transactions', {
    startDate: startDate.value,
    endDate: endDate.value,
    excludeProcessed: excludeProcessed.value,
  });
}

// Upload transactions using FormData (SEC-004: stream file to server instead of reading into memory)
async function uploadTransactions(fileOrFiles: File | File[] | null) {
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

    const response = await api.post('/paypal/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    loadedTransactions.value = response.data.data.transactions;
    showSnackbar(
      t('views.paypal.messages.transactionsLoaded', { count: loadedTransactions.value.length }),
      'success'
    );
  } catch (error) {
    console.error('Upload error:', error);
    showSnackbar(
      error instanceof Error ? error.message : t('views.paypal.messages.failedToUpload'),
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
    await api.delete('/paypal/transactions');
  } catch {
    // Ignore errors on reset
  }

  currentStep.value = 1;
  uploadFile.value = [];
  loadedTransactions.value = [];
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
  event: StreamEvent<PayPalMatchResult | ProgressData | ValidationErrorData | { error: string }>
) {
  switch (event.type) {
    case 'progress': {
      const progressData = event.data as ProgressData;
      progress.update(progressData.current || 0, progressData.total || 0);
      progress.message.value =
        progressData.message ||
        t('common.messages.matchingTransaction', {
          current: progressData.current,
          total: progressData.total,
        });
      break;
    }
    case 'result': {
      const result = event.data as PayPalMatchResult;
      if (result && result.transactionId) {
        matchResults.value.push(result);
        if (result.matchedPayPalTransaction) {
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
      showSnackbar(errorData?.error || t('common.errors.anErrorOccurred'), 'error');
      break;
    }
    case 'complete':
      progress.message.value = t('common.messages.complete');
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
      '/api/paypal/stream-match',
      {
        startDate: startDate.value,
        endDate: endDate.value,
        excludeProcessed: excludeProcessed.value,
      },
      handleStreamEvent,
      { includeSession: true, resultSchema: PayPalMatchResultSchema }
    );

    hasMatched.value = true;
    const matchCount = matchResults.value.filter((m) => m.matchedPayPalTransaction).length;
    if (validationErrorCount.value > 0) {
      showSnackbar(
        t('common.messages.itemsSkipped', { count: validationErrorCount.value }),
        'warning'
      );
    } else if (matchCount > 0) {
      showSnackbar(
        t('views.paypal.messages.matchesFound', {
          matches: matchCount,
          total: matchResults.value.length,
        }),
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

// Toggle select all matches
function toggleSelectAllMatches() {
  const matchedIds = matchResults.value
    .filter((m) => m.matchedPayPalTransaction)
    .map((m) => m.transactionId);
  if (allMatchesSelected.value) {
    selection.deselectAll();
  } else {
    selection.selectAll(matchedIds);
  }
}

// Apply selected matches
async function applySelected() {
  applying.value = true;

  try {
    const matches = matchResults.value
      .filter((r) => selection.isSelected(r.transactionId) && r.matchedPayPalTransaction)
      .map((r) => ({
        transactionId: r.transactionId,
        journalId: r.transaction.transaction_journal_id,
        newDescription: customDescriptions[r.transactionId] || r.suggestedDescription,
        newNotes: customNotes[r.transactionId] || r.suggestedNotes,
      }));

    const response = await api.post('/paypal/apply', { matches });
    const result = response.data.data;

    showSnackbar(
      result.failed.length > 0
        ? t('views.paypal.messages.descriptionsUpdatedWithFailed', {
            successful: result.successful.length,
            failed: result.failed.length,
          })
        : t('views.paypal.messages.descriptionsUpdated', { successful: result.successful.length }),
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

.cursor-pointer {
  cursor: pointer;
}

.confidence-breakdown {
  min-width: 180px;
  font-size: 0.85rem;
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
</style>
