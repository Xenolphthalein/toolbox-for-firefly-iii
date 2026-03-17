import { reactive, ref } from 'vue';
import { describe, expect, it } from 'vitest';
import { useManualMatchAssignments, type ManualMatchAdapter } from './useManualMatchAssignments';
import type { FireflyTransactionSplit } from '@shared/types/firefly';

interface TestSourceItem {
  id: string;
  label: string;
}

interface TestMatchResult {
  transactionId: string;
  transaction: FireflyTransactionSplit;
  suggestedDescription: string;
  suggestedNotes: string;
  matchConfidence: number;
  source: TestSourceItem | null;
  matchMethod: 'automatic' | 'manual';
}

function createTransactionSplit(
  transactionId: string,
  description: string
): FireflyTransactionSplit {
  return {
    user: '1',
    transaction_journal_id: `journal-${transactionId}`,
    type: 'withdrawal',
    date: '2026-03-17',
    order: 1,
    currency_id: '1',
    currency_code: 'EUR',
    currency_symbol: 'EUR',
    currency_decimal_places: 2,
    foreign_currency_id: null,
    foreign_currency_code: null,
    foreign_currency_symbol: null,
    foreign_currency_decimal_places: null,
    amount: '-10.00',
    foreign_amount: null,
    description,
    source_id: 'source',
    source_name: 'Source',
    source_iban: null,
    source_type: 'asset',
    destination_id: 'destination',
    destination_name: 'Destination',
    destination_iban: null,
    destination_type: 'expense',
    budget_id: null,
    budget_name: null,
    category_id: null,
    category_name: null,
    bill_id: null,
    bill_name: null,
    reconciled: false,
    notes: null,
    tags: [],
    internal_reference: null,
    external_id: null,
    external_url: null,
    original_source: null,
    recurrence_id: null,
    recurrence_total: null,
    recurrence_count: null,
    bunq_payment_id: null,
    import_hash_v2: null,
    sepa_cc: null,
    sepa_ct_op: null,
    sepa_ct_id: null,
    sepa_db: null,
    sepa_country: null,
    sepa_ep: null,
    sepa_ci: null,
    sepa_batch_id: null,
    interest_date: null,
    book_date: null,
    process_date: null,
    due_date: null,
    payment_date: null,
    invoice_date: null,
    latitude: null,
    longitude: null,
    zoom_level: null,
    has_attachments: false,
  };
}

function createResult(args: {
  transactionId: string;
  description: string;
  confidence: number;
  source?: TestSourceItem | null;
  matchMethod?: 'automatic' | 'manual';
}): TestMatchResult {
  const source = args.source ?? null;

  return {
    transactionId: args.transactionId,
    transaction: createTransactionSplit(args.transactionId, args.description),
    suggestedDescription: source ? `${args.description} -> ${source.label}` : args.description,
    suggestedNotes: source ? `notes:${source.label}` : '',
    matchConfidence: args.confidence,
    source,
    matchMethod: args.matchMethod ?? 'automatic',
  };
}

const adapter: ManualMatchAdapter<TestSourceItem, TestMatchResult> = {
  getSourceId: (source) => source.id,
  getMatchedSource: (result) => result.source,
  isMatched: (result) => result.source !== null,
  isManualMatch: (result) => result.matchMethod === 'manual',
  createManualResult: ({ transactionId, transaction, source }) => ({
    transactionId,
    transaction,
    suggestedDescription: `manual:${source.label}`,
    suggestedNotes: `notes:${source.label}`,
    matchConfidence: 1,
    source,
    matchMethod: 'manual',
  }),
  createUnmatchedResult: ({ transactionId, transaction }) => ({
    transactionId,
    transaction,
    suggestedDescription: transaction.description,
    suggestedNotes: '',
    matchConfidence: 0,
    source: null,
    matchMethod: 'automatic',
  }),
};

describe('useManualMatchAssignments', () => {
  function setup() {
    const sourceItems = ref<TestSourceItem[]>([
      { id: 'source-1', label: 'Order 1' },
      { id: 'source-2', label: 'Order 2' },
      { id: 'source-3', label: 'Order 3' },
    ]);
    const matchResults = ref<TestMatchResult[]>([
      createResult({
        transactionId: 'txn-auto',
        description: 'Auto matched',
        confidence: 0.6,
        source: sourceItems.value[0],
      }),
      createResult({
        transactionId: 'txn-a',
        description: 'Unmatched A',
        confidence: 0,
      }),
      createResult({
        transactionId: 'txn-b',
        description: 'Unmatched B',
        confidence: 0,
      }),
    ]);
    const customDescriptions = reactive<Record<string, string>>({});
    const customNotes = reactive<Record<string, string>>({});

    const state = useManualMatchAssignments({
      sourceItems,
      matchResults,
      customDescriptions,
      customNotes,
      adapter,
    });

    return { sourceItems, matchResults, customDescriptions, customNotes, state };
  }

  it('filters out already matched source items and exposes unmatched transactions', () => {
    const { state } = setup();

    expect(state.unmatchedSourceItems.value.map((item) => item.id)).toEqual([
      'source-2',
      'source-3',
    ]);
    expect(state.unmatchedTransactions.value.map((item) => item.transactionId)).toEqual([
      'txn-a',
      'txn-b',
    ]);
    expect(state.manualMatches.value).toEqual([]);
  });

  it('creates a manual match, stores custom text, and sorts the updated results', () => {
    const { state, matchResults, customDescriptions, customNotes } = setup();

    state.selectSource('source-2');
    state.selectTransaction('txn-b');

    expect(state.canCreateManualMatch.value).toBe(true);
    expect(state.createManualMatch()).toBe('txn-b');

    expect(state.selectedSourceId.value).toBeNull();
    expect(state.selectedTransactionId.value).toBeNull();
    expect(state.manualMatches.value.map((item) => item.transactionId)).toEqual(['txn-b']);
    expect(customDescriptions['txn-b']).toBe('manual:Order 2');
    expect(customNotes['txn-b']).toBe('notes:Order 2');
    expect(matchResults.value.map((item) => item.transactionId)).toEqual([
      'txn-b',
      'txn-auto',
      'txn-a',
    ]);
    expect(state.unmatchedSourceItems.value.map((item) => item.id)).toEqual(['source-3']);
  });

  it('removes a manual match and restores the transaction to the unmatched pool', () => {
    const { state, customDescriptions, customNotes } = setup();

    state.selectSource('source-2');
    state.selectTransaction('txn-b');
    state.createManualMatch();

    state.selectTransaction('txn-b');
    state.removeManualMatch('txn-b');

    expect(state.selectedTransactionId.value).toBeNull();
    expect(state.manualMatches.value).toEqual([]);
    expect(state.unmatchedTransactions.value.map((item) => item.transactionId)).toEqual([
      'txn-b',
      'txn-a',
    ]);
    expect(state.unmatchedSourceItems.value.map((item) => item.id)).toEqual([
      'source-2',
      'source-3',
    ]);
    expect(customDescriptions['txn-b']).toBeUndefined();
    expect(customNotes['txn-b']).toBeUndefined();
  });

  it('keeps applied sources unavailable even after successful matches are removed', () => {
    const { state, matchResults } = setup();

    state.selectSource('source-2');
    state.selectTransaction('txn-a');
    expect(state.createManualMatch()).toBe('txn-a');

    state.markApplied(['txn-a']);
    matchResults.value = matchResults.value.filter((item) => item.transactionId !== 'txn-a');

    expect(state.appliedSourceIdSet.value.has('source-2')).toBe(true);
    expect(state.unmatchedSourceItems.value.map((item) => item.id)).toEqual(['source-3']);

    state.resetAll();

    expect(state.appliedSourceIdSet.value.size).toBe(0);
    expect(state.unmatchedSourceItems.value.map((item) => item.id)).toEqual([
      'source-2',
      'source-3',
    ]);
  });
});
