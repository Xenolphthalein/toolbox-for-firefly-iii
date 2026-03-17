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
          :loading-text="t('views.paypal.loadingText')"
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
            class="manual-match-summary"
            :stats="[
              {
                icon: 'mdi-check',
                label: t('common.labels.countMatches', { count: matchedCount }),
                color: 'success',
              },
              {
                icon: 'mdi-help',
                label: t('common.labels.countUnmatched', { count: unmatchedCount }),
                color: 'grey',
              },
            ]"
            :show-select-all="matchedCount > 0"
            :selectable-count="matchedCount"
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
                      <ConfidenceBreakdown
                        v-if="result.matchedPayPalTransaction && result.confidenceBreakdown"
                        :score="result.matchConfidence"
                        :items="getPayPalBreakdownItems(result.confidenceBreakdown)"
                      />
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
                      <v-chip
                        v-if="result.matchMethod === 'manual'"
                        size="x-small"
                        color="info"
                        variant="tonal"
                        class="ml-2"
                      >
                        {{ t('common.labels.manualMatch') }}
                      </v-chip>
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

      <template #content-4>
        <div class="manual-match-step">
          <ManualMatchBoard
            :helper-text="t('common.manualMatching.helperText')"
            :create-button-text="t('common.buttons.createManualMatch')"
            :create-disabled="!manualMatching.canCreateManualMatch"
            :source-title="t('views.paypal.unmatchedSourceTitle')"
            :source-empty-title="t('views.paypal.unmatchedSourceEmptyTitle')"
            :source-empty-subtitle="t('views.paypal.unmatchedSourceEmptySubtitle')"
            :source-items="payPalManualSourceItems"
            :selected-source-id="manualMatching.selectedSourceId.value"
            :transaction-title="t('common.manualMatching.fireflyTransactionsTitle')"
            :transaction-empty-title="t('common.manualMatching.fireflyTransactionsEmptyTitle')"
            :transaction-empty-subtitle="
              t('common.manualMatching.fireflyTransactionsEmptySubtitle')
            "
            :transaction-items="payPalManualTransactionItems"
            :selected-transaction-id="manualMatching.selectedTransactionId.value"
            :assignments-title="t('common.manualMatching.currentAssignmentsTitle')"
            :assignments-empty-title="t('common.manualMatching.noAssignmentsTitle')"
            :assignments="payPalManualAssignments"
            :remove-button-text="t('common.buttons.removeManualMatch')"
            @select-source="manualMatching.selectSource"
            @select-transaction="manualMatching.selectTransaction"
            @create-match="createPayPalManualMatch"
            @remove-match="removePayPalManualMatch"
          />
        </div>
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
  PayPalConfidenceBreakdown,
  PayPalMatchResult,
  PayPalTransaction,
} from '@shared/types/app';
import {
  MANUAL_MATCH_CONFIDENCE,
  createPayPalMatchResult,
  createPayPalUnmatchedResult,
  getPayPalTransactionIdentity,
} from '@shared/utils/extenderMatching';
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
  ManualMatchBoard,
} from '../components/common';
import type { BreakdownItem } from '../components/common/ConfidenceBreakdown.vue';
import type {
  ManualMatchBoardAssignment,
  ManualMatchBoardItem,
} from '../components/common/ManualMatchBoard.vue';
import {
  useProgress,
  useSelection,
  useTransactionPreview,
  useStreamProcessor,
  useSnackbar,
  useManualMatchAssignments,
  type StreamEvent,
  type ProgressData,
  type ValidationErrorData,
} from '../composables';
import { formatCurrency, formatDate, PayPalMatchResultSchema, validateFileSize } from '../utils';

const { showSnackbar } = useSnackbar();
const { t } = useI18n();

const currentStep = ref(1);
const wizardSteps = computed(() => [
  {
    title: t('views.paypal.steps.uploadActivity.title'),
    subtitle: t('views.paypal.steps.uploadActivity.subtitle'),
  },
  { title: t('common.steps.dateRange'), subtitle: t('common.steps.selectTransactionsToMatch') },
  { title: t('common.steps.matchReview'), subtitle: t('common.steps.reviewAndApplyChanges') },
  {
    title: t('views.paypal.steps.manualMatch.title'),
    subtitle: t('views.paypal.steps.manualMatch.subtitle'),
  },
]);

const uploadFile = ref<File[]>([]);
const uploading = ref(false);
const loadedTransactions = ref<PayPalTransaction[]>([]);
const previewTransactions = computed(() => loadedTransactions.value.slice(0, 10));

const startDate = ref<string>();
const endDate = ref<string>();
const excludeProcessed = ref(true);
const preview = useTransactionPreview();

const matching = ref(false);
const applying = ref(false);
const hasMatched = ref(false);
const matchResults = ref<PayPalMatchResult[]>([]);
const customDescriptions = reactive<Record<string, string>>({});
const customNotes = reactive<Record<string, string>>({});

const progress = useProgress('Initializing...');
const selection = useSelection<string>();

const matchedResults = computed(() =>
  matchResults.value.filter((result) => result.matchedPayPalTransaction)
);
const unmatchedResults = computed(() =>
  matchResults.value.filter((result) => !result.matchedPayPalTransaction)
);
const matchedCount = computed(() => matchedResults.value.length);
const unmatchedCount = computed(() => unmatchedResults.value.length);

const manualMatching = useManualMatchAssignments<PayPalTransaction, PayPalMatchResult>({
  sourceItems: loadedTransactions,
  matchResults,
  customDescriptions,
  customNotes,
  adapter: {
    getSourceId: getPayPalTransactionIdentity,
    getMatchedSource: (result) => result.matchedPayPalTransaction,
    isMatched: (result) => !!result.matchedPayPalTransaction,
    isManualMatch: (result) => result.matchMethod === 'manual',
    createManualResult: ({ transactionId, transaction, source }) =>
      createPayPalMatchResult({
        transactionId,
        transaction,
        matchedPayPalTransaction: source,
        matchConfidence: MANUAL_MATCH_CONFIDENCE,
        matchMethod: 'manual',
      }),
    createUnmatchedResult: ({ transactionId, transaction }) =>
      createPayPalUnmatchedResult({
        transactionId,
        transaction,
      }),
  },
});

const allMatchesSelected = computed(
  () =>
    matchedResults.value.length > 0 &&
    matchedResults.value.every((result) => selection.isSelected(result.transactionId))
);

const payPalManualSourceItems = computed<ManualMatchBoardItem[]>(() =>
  manualMatching.unmatchedSourceItems.value.map((transaction) => {
    const lines = [
      transaction.transactionCode || t('views.paypal.transactionCode'),
      transaction.itemDescription,
      transaction.recipientEmail,
    ].filter(Boolean);

    return {
      id: getPayPalTransactionIdentity(transaction),
      title: transaction.name || transaction.transactionCode || t('navigation.paypal'),
      subtitle: [transaction.date, transaction.type].filter(Boolean).join(' • '),
      amount: formatCurrency(transaction.gross, transaction.currency),
      chips: [
        {
          label: transaction.status,
          color: transaction.status === 'Abgeschlossen' ? 'success' : 'warning',
        },
      ],
      lines,
    };
  })
);

const payPalManualTransactionItems = computed<ManualMatchBoardItem[]>(() =>
  manualMatching.unmatchedTransactions.value.map((result) => {
    const split = result.transaction;
    const lines = [split.destination_name || split.source_name].filter(Boolean);

    return {
      id: result.transactionId,
      title: split.description,
      subtitle: formatDate(split.date),
      amount: formatCurrency(parseFloat(split.amount), split.currency_code),
      lines,
    };
  })
);

const payPalManualAssignments = computed<ManualMatchBoardAssignment[]>(() =>
  manualMatching.manualMatches.value.map((result) => ({
    id: result.transactionId,
    sourceTitle:
      result.matchedPayPalTransaction?.name ||
      result.matchedPayPalTransaction?.transactionCode ||
      '',
    sourceSubtitle: result.matchedPayPalTransaction
      ? [result.matchedPayPalTransaction.date, result.matchedPayPalTransaction.transactionCode]
          .filter(Boolean)
          .join(' • ')
      : '',
    transactionTitle: result.transaction.description,
    transactionSubtitle: formatDate(result.transaction.date),
  }))
);

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
    case 3:
      return t('common.buttons.manualMatching');
    default:
      return t('common.buttons.next');
  }
});

const statusMessage = computed(() => {
  if (currentStep.value === 1) {
    return loadedTransactions.value.length > 0
      ? t('common.labels.countTransactionsLoaded', { count: loadedTransactions.value.length })
      : '';
  }

  if (currentStep.value === 2) {
    if (preview.fetching.value) return t('common.messages.fetching');
    if (preview.count.value === null) return '';
    if (preview.count.value === 0) return t('common.messages.noTransactionsFound');
    return t('common.labels.countTransactions', { count: preview.count.value });
  }

  if ((currentStep.value === 3 || currentStep.value === 4) && matchResults.value.length > 0) {
    return t('views.paypal.messages.matchesFound', {
      matches: matchedCount.value,
      total: matchResults.value.length,
    });
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

  if ((currentStep.value === 3 || currentStep.value === 4) && matchResults.value.length > 0) {
    return matchedCount.value > 0 ? 'success' : 'warning';
  }

  return '';
});

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function debouncedFetchTransactions() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    fetchTransactionCount();
  }, 500);
}

async function fetchTransactionCount() {
  await preview.fetchCount('/paypal/count-transactions', {
    startDate: startDate.value,
    endDate: endDate.value,
    excludeProcessed: excludeProcessed.value,
    extra: `excludeProcessed-${excludeProcessed.value}`,
  });
}

async function loadMoreTransactions() {
  await preview.loadMore('/paypal/count-transactions', {
    startDate: startDate.value,
    endDate: endDate.value,
    excludeProcessed: excludeProcessed.value,
  });
}

async function uploadTransactions(fileOrFiles: File | File[] | null) {
  const file = Array.isArray(fileOrFiles) ? fileOrFiles[0] : fileOrFiles;

  if (!file) return;

  const sizeValidation = validateFileSize(file);
  if (!sizeValidation.valid) {
    showSnackbar(sizeValidation.error!, 'error');
    return;
  }

  uploading.value = true;

  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post('/paypal/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    loadedTransactions.value = response.data.data.transactions;
    manualMatching.resetAll();
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

function onStepNext(step: number) {
  if (step === 2) {
    if (startDate.value || endDate.value) {
      fetchTransactionCount();
    }
  } else if (step === 3) {
    matchTransactions();
  }
}

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
  manualMatching.resetAll();
  Object.keys(customDescriptions).forEach((key) => delete customDescriptions[key]);
  Object.keys(customNotes).forEach((key) => delete customNotes[key]);
}

const { processStream } = useStreamProcessor();
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
    case 'validation-error':
      validationErrorCount.value++;
      break;
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

async function matchTransactions() {
  matching.value = true;
  matchResults.value = [];
  selection.clear();
  progress.reset();
  validationErrorCount.value = 0;
  progress.message.value = 'Connecting...';
  manualMatching.resetSelections();
  Object.keys(customDescriptions).forEach((key) => delete customDescriptions[key]);
  Object.keys(customNotes).forEach((key) => delete customNotes[key]);

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
    if (validationErrorCount.value > 0) {
      showSnackbar(
        t('common.messages.itemsSkipped', { count: validationErrorCount.value }),
        'warning'
      );
    } else if (matchedCount.value > 0) {
      showSnackbar(
        t('views.paypal.messages.matchesFound', {
          matches: matchedCount.value,
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

function toggleSelectAllMatches() {
  selection.toggleAll(matchedResults.value.map((result) => result.transactionId));
}

function createPayPalManualMatch() {
  const transactionId = manualMatching.createManualMatch();
  if (!transactionId) {
    return;
  }

  selection.toggle(transactionId, true);
  showSnackbar(t('views.paypal.messages.manualMatchCreated'), 'success');
}

function removePayPalManualMatch(transactionId: string) {
  manualMatching.removeManualMatch(transactionId);
  selection.toggle(transactionId, false);
  showSnackbar(t('views.paypal.messages.manualMatchRemoved'), 'info');
}

async function applySelected() {
  applying.value = true;

  try {
    const matches = matchResults.value
      .filter(
        (result) => selection.isSelected(result.transactionId) && result.matchedPayPalTransaction
      )
      .map((result) => ({
        transactionId: result.transactionId,
        journalId: result.transaction.transaction_journal_id,
        newDescription: customDescriptions[result.transactionId] || result.suggestedDescription,
        newNotes: customNotes[result.transactionId] || result.suggestedNotes,
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

    manualMatching.markApplied(result.successful);
    for (const transactionId of result.successful) {
      delete customDescriptions[transactionId];
      delete customNotes[transactionId];
    }
    matchResults.value = matchResults.value.filter(
      (resultItem) => !result.successful.includes(resultItem.transactionId)
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

function getPayPalBreakdownItems(breakdown: PayPalConfidenceBreakdown): BreakdownItem[] {
  return [
    {
      label: t('views.paypal.confidenceBreakdown.transactionCode'),
      value: breakdown.transactionCodeMatch,
      max: 0.7,
    },
    {
      label: t('views.paypal.confidenceBreakdown.bankReference'),
      value: breakdown.bankReferenceMatch,
      max: 0.7,
    },
    {
      label: t('views.paypal.confidenceBreakdown.amountMatch'),
      value: breakdown.amountMatch,
      max: 0.3,
    },
    {
      label: t('views.paypal.confidenceBreakdown.exactAmountBonus'),
      value: breakdown.exactAmountBonus,
      max: 0.1,
    },
    {
      label: t('views.paypal.confidenceBreakdown.dateProximity'),
      value: breakdown.dateProximity,
      max: 0.1,
    },
    {
      label: t('views.paypal.confidenceBreakdown.nameMatch'),
      value: breakdown.nameMatch,
      max: 0.05,
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

.manual-match-step {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}
</style>
