<template>
  <div class="tool-view">
    <!-- Wizard Stepper -->
    <WizardStepper
      v-model="currentStep"
      :steps="wizardSteps"
      :can-proceed="canProceed"
      :loading="stepLoading"
      :disabled="loading || deleting"
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
          :loading="preview.fetching.value"
          :loading-more="preview.loadingMore.value"
          loading-text="Fetching transactions..."
          @change="debouncedFetchCount"
          @load-more="loadMoreTransactions"
        />
      </template>

      <!-- Step 2: Find & Review Duplicates -->
      <template #content-2>
        <!-- Progress Bar (shown during analysis) -->
        <ProgressCard
          :show="loading"
          :current="progress.current.value"
          :total="progress.total.value"
          :message="progress.message.value"
          icon="mdi-magnify"
        />

        <!-- Empty State - Not yet searched -->
        <EmptyState
          v-if="!loading && !hasSearched"
          icon="mdi-magnify"
          title="Ready to analyze"
          subtitle="Click 'Find Duplicates' to scan for potential duplicate transactions"
        />

        <!-- Empty State - No duplicates found -->
        <EmptyState
          v-else-if="!loading && duplicateGroups.length === 0 && hasSearched"
          icon="mdi-check-circle"
          title="No duplicates found"
          subtitle="Your transactions look clean!"
        />

        <!-- Results -->
        <template v-else-if="duplicateGroups.length > 0">
          <!-- Summary Card -->
          <ResultsSummaryCard
            :stats="[
              {
                label: 'duplicate groups',
                value: duplicateGroups.length,
                color: 'warning',
                icon: 'mdi-content-copy',
              },
              {
                label: 'total transactions',
                value: totalDuplicateCount,
                color: 'grey',
                icon: 'mdi-file-document-multiple',
              },
            ]"
            :show-select-all="false"
            :selected-count="selection.selected.value.length"
            action-text="Delete Selected"
            action-color="error"
            action-icon="mdi-delete"
            :action-loading="deleting"
            @action="deleteSelected"
          />

          <!-- Duplicate Groups -->
          <v-expansion-panels variant="accordion" class="duplicate-panels">
            <v-expansion-panel v-for="group in duplicateGroups" :key="group.id" rounded="lg">
              <v-expansion-panel-title>
                <div class="d-flex align-center justify-space-between w-100 pr-4">
                  <div class="d-flex align-center">
                    <v-avatar color="warning" size="32" class="mr-3">
                      <span class="text-caption font-weight-bold">{{
                        group.transactions.length
                      }}</span>
                    </v-avatar>
                    <div>
                      <span class="font-weight-medium">
                        {{
                          group.transactions[0]?.attributes.transactions[0]?.description ||
                          'Unknown'
                        }}
                      </span>
                      <div class="text-caption text-medium-emphasis">
                        {{ formatAmount(group.transactions[0]?.attributes.transactions[0]) }}
                        <template v-if="group.confidenceBreakdown?.dateMatch">
                          • Same date</template
                        >
                        <template v-if="group.confidenceBreakdown?.sourceAccountMatch">
                          • Same source</template
                        >
                        <template v-if="group.confidenceBreakdown?.destinationAccountMatch">
                          • Same destination</template
                        >
                      </div>
                    </div>
                  </div>
                  <div class="d-flex align-center ga-2">
                    <ConfidenceBreakdown
                      v-if="group.confidenceBreakdown"
                      :score="group.matchScore"
                      :items="getDuplicateBreakdownItems(group.confidenceBreakdown)"
                    />
                    <ConfidenceChip v-else :score="group.matchScore" />
                    <v-tooltip location="top">
                      <template #activator="{ props }">
                        <v-btn
                          v-bind="props"
                          icon="mdi-close"
                          size="x-small"
                          variant="text"
                          @click.stop="dismissGroup(group.id)"
                        />
                      </template>
                      <span>Dismiss (not a duplicate)</span>
                    </v-tooltip>
                  </div>
                </div>
              </v-expansion-panel-title>

              <v-expansion-panel-text>
                <TransactionCard
                  v-for="transaction in group.transactions"
                  :key="transaction.id"
                  :transaction="transaction.attributes.transactions[0]"
                  :selected="isSelected(transaction.id)"
                  selectable
                  variant="outlined"
                  class="mb-2"
                  @update:selected="toggleSelection(transaction.id, $event)"
                >
                  <template #actions>
                    <div class="d-flex justify-end mt-2">
                      <v-btn
                        size="small"
                        color="error"
                        variant="text"
                        prepend-icon="mdi-delete"
                        :loading="deletingId === transaction.id"
                        @click.stop="deleteSingle(transaction.id)"
                      >
                        Delete
                      </v-btn>
                    </div>
                  </template>
                </TransactionCard>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
        </template>
      </template>

      <!-- Final Action Button (Find Duplicates) -->
      <template #final-action>
        <FinalActionButton
          v-if="currentStep === 2"
          :has-run="hasSearched"
          text="Find Duplicates"
          rerun-text="Re-scan"
          icon="mdi-magnify"
          :loading="loading"
          @click="findDuplicates"
        />
      </template>
    </WizardStepper>

    <!-- Delete Confirmation Dialog -->
    <v-dialog v-model="confirmDialog" max-width="400">
      <v-card>
        <v-card-title>Confirm Deletion</v-card-title>
        <v-card-text>
          Are you sure you want to delete {{ selection.selected.value.length }} transaction(s)? This
          action cannot be undone.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="confirmDialog = false">Cancel</v-btn>
          <v-btn color="error" @click="confirmDelete">Delete</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import api from '../services/api';
import type { DuplicateGroup, DuplicateConfidenceBreakdown } from '@shared/types/app';
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
  useSelection,
  useTransactionPreview,
  useStreamProcessor,
  useSnackbar,
  type StreamEvent,
  type ProgressData,
  type ValidationErrorData,
} from '../composables';
import { formatCurrency, DuplicateGroupSchema } from '../utils';

// Snackbar
const { showSnackbar } = useSnackbar();

// Wizard state
const currentStep = ref(1);
const wizardSteps = [
  { title: 'Date Range', subtitle: 'Select transactions to analyze' },
  { title: 'Find & Review', subtitle: 'Review and delete duplicates' },
];

// Step 1: Date range state
const startDate = ref<string>();
const endDate = ref<string>();

// Transaction preview composable
const preview = useTransactionPreview();

// Step 2: Analysis state
const loading = ref(false);
const deleting = ref(false);
const deletingId = ref<string | null>(null);
const hasSearched = ref(false);
const confirmDialog = ref(false);
const duplicateGroups = ref<DuplicateGroup[]>([]);

// Progress tracking composable
const progress = useProgress('Initializing...');

// Selection composable
const selection = useSelection<string>();

const totalDuplicateCount = computed(() =>
  duplicateGroups.value.reduce((sum, g) => sum + g.transactions.length, 0)
);

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
      return 'Find Duplicates';
    default:
      return 'Next';
  }
});

const statusMessage = computed(() => {
  if (currentStep.value === 1) {
    if (preview.fetching.value) return 'Fetching...';
    if (preview.count.value === null) return '';
    if (preview.count.value === 0) return 'No transactions found';
    return `${preview.count.value} transactions`;
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
  await preview.fetchCount('/duplicates/count-transactions', {
    startDate: startDate.value,
    endDate: endDate.value,
  });
}

// Load more transactions (using composable)
async function loadMoreTransactions() {
  await preview.loadMore('/duplicates/count-transactions', {
    startDate: startDate.value,
    endDate: endDate.value,
  });
}

// Handle step navigation
function onStepNext(step: number) {
  // Auto-start duplicate finding when entering step 2
  if (step === 2) {
    findDuplicates();
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
  duplicateGroups.value = [];
}

// Stream processor
const { processStream } = useStreamProcessor();

// Track validation errors during stream processing
const validationErrorCount = ref(0);

function handleStreamEvent(
  event: StreamEvent<DuplicateGroup | ProgressData | ValidationErrorData | { error: string }>
) {
  switch (event.type) {
    case 'progress': {
      const progressData = event.data as ProgressData;
      progress.update(
        progressData.current || 0,
        progressData.total || 0,
        progressData.message ||
          `Analyzing transaction ${progressData.current} of ${progressData.total}...`
      );
      break;
    }
    case 'result': {
      const group = event.data as DuplicateGroup;
      if (group && group.id) {
        duplicateGroups.value.push(group);
        duplicateGroups.value.sort((a, b) => b.matchScore - a.matchScore);
      }
      break;
    }
    case 'validation-error': {
      validationErrorCount.value++;
      break;
    }
    case 'error': {
      const errorData = event.data as { error: string };
      showSnackbar(errorData?.error || 'An error occurred', 'error');
      break;
    }
    case 'complete':
      progress.message.value = 'Complete!';
      break;
  }
}

// Find duplicates
async function findDuplicates() {
  loading.value = true;
  hasSearched.value = true;
  duplicateGroups.value = [];
  selection.clear();
  progress.reset();
  validationErrorCount.value = 0;
  progress.message.value = 'Connecting...';

  try {
    await processStream(
      '/api/duplicates/stream-find',
      { startDate: startDate.value, endDate: endDate.value },
      handleStreamEvent,
      { includeSession: true, resultSchema: DuplicateGroupSchema }
    );

    if (validationErrorCount.value > 0) {
      showSnackbar(
        `${validationErrorCount.value} item(s) skipped due to data errors. Check console for details.`,
        'warning'
      );
    } else if (duplicateGroups.value.length > 0) {
      showSnackbar(`Found ${duplicateGroups.value.length} duplicate groups`, 'info');
    }
  } catch (error) {
    showSnackbar(error instanceof Error ? error.message : 'Failed to find duplicates', 'error');
  } finally {
    loading.value = false;
  }
}

// Get breakdown items for the confidence breakdown component
function getDuplicateBreakdownItems(breakdown: DuplicateConfidenceBreakdown): BreakdownItem[] {
  return [
    { label: 'Date Match', value: breakdown.dateMatch, max: 0.2 },
    { label: 'Amount Match', value: breakdown.amountMatch, max: 0.25 },
    { label: 'Description Match', value: breakdown.descriptionMatch, max: 0.2 },
    { label: 'Source Account', value: breakdown.sourceAccountMatch, max: 0.15 },
    { label: 'Destination Account', value: breakdown.destinationAccountMatch, max: 0.15 },
    { label: 'External ID', value: breakdown.externalIdMatch, max: 0.05, muted: true },
    { label: 'Import Hash', value: breakdown.importHashMatch, max: 0.05, muted: true },
  ];
}

// Formatting helpers
function formatAmount(transaction: { amount: string; currency_code: string } | undefined) {
  if (!transaction) return '';
  return formatCurrency(
    Math.abs(parseFloat(transaction.amount)),
    transaction.currency_code || 'EUR'
  );
}

// Selection helpers (using composable)
function isSelected(id: string): boolean {
  return selection.isSelected(id);
}

function toggleSelection(id: string, selected: boolean | null) {
  selection.toggle(id, selected ?? undefined);
}

// Delete functions
function deleteSelected() {
  confirmDialog.value = true;
}

async function confirmDelete() {
  confirmDialog.value = false;
  deleting.value = true;

  try {
    await api.post('/duplicates/delete-bulk', {
      transactionIds: selection.selected.value,
    });

    for (const id of selection.selected.value) {
      for (const group of duplicateGroups.value) {
        group.transactions = group.transactions.filter((t) => t.id !== id);
      }
    }

    duplicateGroups.value = duplicateGroups.value.filter((g) => g.transactions.length > 1);

    showSnackbar(`Deleted ${selection.selected.value.length} transactions`, 'success');
    selection.clear();
  } catch (error) {
    showSnackbar(error instanceof Error ? error.message : 'Failed to delete transactions', 'error');
  } finally {
    deleting.value = false;
  }
}

async function deleteSingle(id: string) {
  deletingId.value = id;

  try {
    await api.delete(`/duplicates/transaction/${id}`);

    for (const group of duplicateGroups.value) {
      group.transactions = group.transactions.filter((t) => t.id !== id);
    }

    duplicateGroups.value = duplicateGroups.value.filter((g) => g.transactions.length > 1);

    // Remove from selection if selected
    if (selection.isSelected(id)) {
      selection.toggle(id, false);
    }

    showSnackbar('Transaction deleted', 'success');
  } catch (error) {
    showSnackbar(error instanceof Error ? error.message : 'Failed to delete transaction', 'error');
  } finally {
    deletingId.value = null;
  }
}

// Dismiss a duplicate group (user decided it's not a duplicate)
function dismissGroup(groupId: string) {
  // Remove from selection any transactions in this group
  const group = duplicateGroups.value.find((g) => g.id === groupId);
  if (group) {
    for (const transaction of group.transactions) {
      if (selection.isSelected(transaction.id)) {
        selection.toggle(transaction.id, false);
      }
    }
  }

  // Remove the group from the list
  duplicateGroups.value = duplicateGroups.value.filter((g) => g.id !== groupId);
}
</script>

<style scoped>
.tool-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px;
}

.duplicate-panels {
  gap: 8px;
}

.duplicate-panels :deep(.v-expansion-panel) {
  border-radius: 16px !important;
}

.duplicate-panels :deep(.v-expansion-panel-title) {
  border-radius: 16px;
}

.duplicate-panels :deep(.v-expansion-panel--active > .v-expansion-panel-title) {
  border-radius: 16px 16px 0 0;
}

.duplicate-panels :deep(.v-expansion-panel::after) {
  display: none;
}
</style>
