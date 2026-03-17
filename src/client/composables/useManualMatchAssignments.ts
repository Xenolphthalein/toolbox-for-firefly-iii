import { computed, ref, type Ref } from 'vue';
import type { FireflyTransactionSplit } from '@shared/types/firefly';

interface MatchResultBase {
  transactionId: string;
  transaction: FireflyTransactionSplit;
  suggestedDescription: string;
  suggestedNotes: string;
  matchConfidence: number;
}

export interface ManualMatchAdapter<SourceItem, MatchResult extends MatchResultBase> {
  getSourceId: (source: SourceItem) => string;
  getMatchedSource: (result: MatchResult) => SourceItem | null;
  isMatched: (result: MatchResult) => boolean;
  isManualMatch: (result: MatchResult) => boolean;
  createManualResult: (args: {
    transactionId: string;
    transaction: FireflyTransactionSplit;
    source: SourceItem;
  }) => MatchResult;
  createUnmatchedResult: (args: {
    transactionId: string;
    transaction: FireflyTransactionSplit;
  }) => MatchResult;
}

interface UseManualMatchAssignmentsOptions<SourceItem, MatchResult extends MatchResultBase> {
  sourceItems: Ref<SourceItem[]>;
  matchResults: Ref<MatchResult[]>;
  customDescriptions: Record<string, string>;
  customNotes: Record<string, string>;
  adapter: ManualMatchAdapter<SourceItem, MatchResult>;
}

export function useManualMatchAssignments<SourceItem, MatchResult extends MatchResultBase>({
  sourceItems,
  matchResults,
  customDescriptions,
  customNotes,
  adapter,
}: UseManualMatchAssignmentsOptions<SourceItem, MatchResult>) {
  const selectedSourceId = ref<string | null>(null);
  const selectedTransactionId = ref<string | null>(null);
  const appliedSourceIds = ref<string[]>([]);

  const appliedSourceIdSet = computed(() => new Set(appliedSourceIds.value));

  const unmatchedTransactions = computed(() =>
    matchResults.value.filter((result) => !adapter.isMatched(result))
  );

  const matchedSourceIdSet = computed(() => {
    const ids = new Set<string>();

    for (const result of matchResults.value) {
      if (!adapter.isMatched(result)) {
        continue;
      }

      const source = adapter.getMatchedSource(result);
      if (source) {
        ids.add(adapter.getSourceId(source));
      }
    }

    return ids;
  });

  const unavailableSourceIdSet = computed(() => {
    const ids = new Set<string>(appliedSourceIds.value);

    for (const id of matchedSourceIdSet.value) {
      ids.add(id);
    }

    return ids;
  });

  const unmatchedSourceItems = computed(() =>
    sourceItems.value.filter(
      (source) => !unavailableSourceIdSet.value.has(adapter.getSourceId(source))
    )
  );

  const manualMatches = computed(() =>
    matchResults.value.filter((result) => adapter.isManualMatch(result))
  );

  const canCreateManualMatch = computed(
    () => selectedSourceId.value !== null && selectedTransactionId.value !== null
  );

  function sortResults(results: MatchResult[]): MatchResult[] {
    return [...results].sort((a, b) => b.matchConfidence - a.matchConfidence);
  }

  function selectSource(id: string): void {
    selectedSourceId.value = selectedSourceId.value === id ? null : id;
  }

  function selectTransaction(id: string): void {
    selectedTransactionId.value = selectedTransactionId.value === id ? null : id;
  }

  function clearSelections(): void {
    selectedSourceId.value = null;
    selectedTransactionId.value = null;
  }

  function createManualMatch(): string | null {
    if (!canCreateManualMatch.value) {
      return null;
    }

    const source = unmatchedSourceItems.value.find(
      (item) => adapter.getSourceId(item) === selectedSourceId.value
    );
    const result = unmatchedTransactions.value.find(
      (item) => item.transactionId === selectedTransactionId.value
    );

    if (!source || !result) {
      return null;
    }

    const manualResult = adapter.createManualResult({
      transactionId: result.transactionId,
      transaction: result.transaction,
      source,
    });

    matchResults.value = sortResults(
      matchResults.value.map((item) =>
        item.transactionId === result.transactionId ? manualResult : item
      )
    );

    customDescriptions[manualResult.transactionId] = manualResult.suggestedDescription;
    customNotes[manualResult.transactionId] = manualResult.suggestedNotes;
    clearSelections();

    return manualResult.transactionId;
  }

  function removeManualMatch(transactionId: string): void {
    const existing = matchResults.value.find(
      (result) => result.transactionId === transactionId && adapter.isManualMatch(result)
    );

    if (!existing) {
      return;
    }

    const unmatchedResult = adapter.createUnmatchedResult({
      transactionId: existing.transactionId,
      transaction: existing.transaction,
    });

    matchResults.value = sortResults(
      matchResults.value.map((result) =>
        result.transactionId === transactionId ? unmatchedResult : result
      )
    );

    delete customDescriptions[transactionId];
    delete customNotes[transactionId];

    if (selectedTransactionId.value === transactionId) {
      selectedTransactionId.value = null;
    }
  }

  function markApplied(transactionIds: string[]): void {
    const nextAppliedSourceIds = new Set(appliedSourceIds.value);

    for (const transactionId of transactionIds) {
      const result = matchResults.value.find((item) => item.transactionId === transactionId);
      if (!result || !adapter.isMatched(result)) {
        continue;
      }

      const source = adapter.getMatchedSource(result);
      if (source) {
        nextAppliedSourceIds.add(adapter.getSourceId(source));
      }
    }

    appliedSourceIds.value = [...nextAppliedSourceIds];
  }

  function resetSelections(): void {
    clearSelections();
  }

  function resetAll(): void {
    clearSelections();
    appliedSourceIds.value = [];
  }

  return {
    selectedSourceId,
    selectedTransactionId,
    unmatchedSourceItems,
    unmatchedTransactions,
    manualMatches,
    canCreateManualMatch,
    appliedSourceIdSet,
    selectSource,
    selectTransaction,
    clearSelections,
    createManualMatch,
    removeManualMatch,
    markApplied,
    resetSelections,
    resetAll,
  };
}
