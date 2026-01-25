<template>
  <v-card rounded="lg" class="transaction-preview-card">
    <v-card-title class="d-flex align-center justify-space-between py-2">
      <div class="d-flex align-center">
        <v-icon class="mr-2" size="small">mdi-format-list-bulleted</v-icon>
        Transaction Preview
      </div>
      <v-chip v-if="totalCount > 0" size="small" color="success" variant="tonal">
        <v-icon start size="small">mdi-file-document-multiple</v-icon>
        {{ transactions.length }} of {{ totalCount }}
      </v-chip>
    </v-card-title>
    <v-card-text class="pt-0">
      <!-- Loading State (initial load) -->
      <div
        v-if="loading && transactions.length === 0"
        class="d-flex align-center justify-center py-8 flex-grow-1"
      >
        <v-progress-circular indeterminate size="24" class="mr-3" />
        <span class="text-body-2 text-medium-emphasis">{{ loadingText }}</span>
      </div>

      <!-- Empty State -->
      <div
        v-else-if="transactions.length === 0"
        class="d-flex flex-column align-center justify-center text-medium-emphasis flex-grow-1"
      >
        <v-icon size="48" class="mb-2">mdi-file-document-outline</v-icon>
        <span class="text-body-1">No transactions to preview</span>
        <span class="text-body-2 mt-1">Select a date range to load transactions</span>
      </div>

      <!-- Transaction Table -->
      <template v-else>
        <div class="table-wrapper">
          <!-- Loading overlay when refreshing -->
          <v-overlay
            v-model="isRefreshing"
            contained
            class="align-center justify-center"
            scrim="surface"
            :opacity="0.8"
          >
            <div class="d-flex align-center">
              <v-progress-circular indeterminate size="24" class="mr-3" />
              <span class="text-body-2">{{ loadingText }}</span>
            </div>
          </v-overlay>

          <div ref="scrollContainer" class="table-container" @scroll="onScroll">
            <v-table density="compact" class="transaction-table">
              <thead>
                <tr>
                  <th class="date-col">Date</th>
                  <th class="description-col">Description</th>
                  <th class="accounts-col">From → To</th>
                  <th class="amount-col text-right">Amount</th>
                  <th class="category-col">Category</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="transaction in transactions" :key="transaction.transaction_journal_id">
                  <td class="text-no-wrap">{{ formatDate(transaction.date) }}</td>
                  <td class="text-truncate description-col">{{ transaction.description }}</td>
                  <td class="text-truncate accounts-col">
                    {{ transaction.source_name }} → {{ transaction.destination_name }}
                  </td>
                  <td class="text-right text-no-wrap" :class="getAmountClass(transaction)">
                    {{ formatAmount(transaction) }}
                  </td>
                  <td class="text-truncate category-col">{{ transaction.category_name || '—' }}</td>
                </tr>
              </tbody>
            </v-table>

            <!-- Loading more indicator -->
            <div v-if="loadingMore" class="d-flex align-center justify-center py-4">
              <v-progress-circular indeterminate size="20" class="mr-2" />
              <span class="text-body-2 text-medium-emphasis">Loading more...</span>
            </div>
          </div>
        </div>
      </template>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { FireflyTransactionSplit } from '@shared/types/firefly';

interface Props {
  transactions: FireflyTransactionSplit[];
  count?: number;
  loading?: boolean;
  loadingMore?: boolean;
  loadingText?: string;
}

const props = withDefaults(defineProps<Props>(), {
  count: undefined,
  loading: false,
  loadingMore: false,
  loadingText: 'Fetching transactions...',
});

// Show overlay when loading but we already have transactions (refreshing)
const isRefreshing = computed(
  () => props.loading && props.transactions.length > 0 && !props.loadingMore
);

const emit = defineEmits<{
  (e: 'load-more'): void;
}>();

// Use count prop if provided, otherwise fall back to transactions length
const totalCount = computed(() => props.count ?? props.transactions.length);

// Check if all transactions are loaded
const allLoaded = computed(() => props.transactions.length >= totalCount.value);

// Handle scroll event to detect when user reaches bottom
function onScroll(event: Event) {
  if (props.loading || allLoaded.value) return;

  const target = event.target as HTMLElement;
  const scrollBottom = target.scrollHeight - target.scrollTop - target.clientHeight;

  // Trigger load more when within 100px of bottom
  if (scrollBottom < 100) {
    emit('load-more');
  }
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatAmount(transaction: FireflyTransactionSplit): string {
  const amount = parseFloat(transaction.amount);
  const formatter = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: transaction.currency_code || 'EUR',
  });
  return formatter.format(Math.abs(amount));
}

function getAmountClass(transaction: FireflyTransactionSplit): string {
  if (transaction.type === 'deposit') return 'text-success';
  if (transaction.type === 'withdrawal') return 'text-error';
  return '';
}
</script>

<style scoped>
.transaction-preview-card {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
}

.transaction-preview-card :deep(.v-card-text) {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.table-wrapper {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.table-container {
  flex: 1;
  min-height: 0;
  overflow: auto;
  border: 1px solid rgba(var(--v-border-color), 0.2);
  border-radius: 8px;
}

.transaction-table {
  min-width: 100%;
}

.transaction-table th {
  background: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-border-color), 0.3);
  position: sticky;
  top: 0;
  z-index: 1;
  color: rgb(var(--v-theme-primary));
  font-weight: 600;
}

.date-col {
  width: 110px;
  min-width: 110px;
}

.description-col {
  max-width: 250px;
}

.accounts-col {
  max-width: 200px;
}

.amount-col {
  width: 100px;
  min-width: 100px;
}

.category-col {
  max-width: 120px;
}
</style>
