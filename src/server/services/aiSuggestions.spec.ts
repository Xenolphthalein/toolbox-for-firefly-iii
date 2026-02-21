import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AISuggestionService, TAGGER_TAG } from './aiSuggestions.js';
import type { FireflyTransaction, FireflyTransactionSplit } from '../../shared/types/firefly.js';
import type { FireflyApiClient } from '../clients/firefly.js';

// Mock the AI client
vi.mock('../clients/ai.js', () => ({
  analyzeForCategory: vi.fn(),
  analyzeForTags: vi.fn(),
}));

import { analyzeForCategory, analyzeForTags } from '../clients/ai.js';

// Helper to create a mock transaction
function createMockTransaction(
  id: string,
  description: string,
  amount: string,
  categoryId: string | null = null,
  categoryName: string | null = null,
  tags: string[] = [],
  type: FireflyTransactionSplit['type'] = 'withdrawal'
): FireflyTransaction {
  return {
    id,
    type: 'transactions',
    attributes: {
      created_at: '2024-01-01',
      updated_at: '2024-01-01',
      user: '1',
      group_title: description,
      transactions: [
        {
          date: '2024-01-01',
          description,
          amount,
          type,
          source_id: 'src1',
          source_name: 'Checking',
          destination_id: 'dest1',
          destination_name: 'Merchant',
          currency_code: 'EUR',
          currency_symbol: '€',
          currency_id: '1',
          category_id: categoryId,
          category_name: categoryName,
          tags,
        } as unknown as FireflyTransactionSplit,
      ],
    },
    links: { self: '' },
  };
}

// Create mock Firefly API client
function createMockFireflyApi(): FireflyApiClient {
  return {
    getAllTransactions: vi.fn().mockResolvedValue([]),
    getAllCategories: vi.fn().mockResolvedValue([
      { id: 'cat1', attributes: { name: 'Groceries' } },
      { id: 'cat2', attributes: { name: 'Entertainment' } },
    ]),
    getAllTags: vi.fn().mockResolvedValue([
      { id: 'tag1', attributes: { tag: 'food' } },
      { id: 'tag2', attributes: { tag: 'subscription' } },
    ]),
    updateTransaction: vi.fn().mockResolvedValue({}),
  } as unknown as FireflyApiClient;
}

describe('AISuggestionService', () => {
  let mockApi: FireflyApiClient;
  let service: AISuggestionService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockApi = createMockFireflyApi();
    service = new AISuggestionService(mockApi);
  });

  describe('getUncategorizedTransactions', () => {
    it('should return transactions without categories', async () => {
      const transactions = [
        createMockTransaction('1', 'Test', '10.00', null, null),
        createMockTransaction('2', 'Categorized', '20.00', 'cat1', 'Groceries'),
      ];
      (mockApi.getAllTransactions as ReturnType<typeof vi.fn>).mockResolvedValue(transactions);

      const result = await service.getUncategorizedTransactions();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('should return empty array when all transactions have categories', async () => {
      const transactions = [createMockTransaction('1', 'Test', '10.00', 'cat1', 'Groceries')];
      (mockApi.getAllTransactions as ReturnType<typeof vi.fn>).mockResolvedValue(transactions);

      const result = await service.getUncategorizedTransactions();

      expect(result).toHaveLength(0);
    });

    it('should pass date range to API', async () => {
      await service.getUncategorizedTransactions('2024-01-01', '2024-12-31');

      expect(mockApi.getAllTransactions).toHaveBeenCalledWith(
        '2024-01-01',
        '2024-12-31',
        undefined
      );
    });

    it('should pass single type filter to API and apply remaining filters', async () => {
      const transactions = [
        createMockTransaction('1', 'Coffee', '9.00', null, null, ['morning'], 'withdrawal'),
        createMockTransaction('2', 'Salary', '1200.00', null, null, [], 'deposit'),
      ];
      (mockApi.getAllTransactions as ReturnType<typeof vi.fn>).mockResolvedValue(transactions);

      const result = await service.getUncategorizedTransactions('2024-01-01', '2024-12-31', {
        types: ['withdrawal'],
        minAmount: 5,
        maxAmount: 10,
        tagTerms: ['morn'],
      });

      expect(mockApi.getAllTransactions).toHaveBeenCalledWith(
        '2024-01-01',
        '2024-12-31',
        'withdrawal'
      );
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });
  });

  describe('getUnprocessedTransactionsForTags', () => {
    it('should return transactions without tagger tag', async () => {
      const transactions = [
        createMockTransaction('1', 'Test', '10.00', null, null, []),
        createMockTransaction('2', 'Processed', '20.00', null, null, [TAGGER_TAG]),
      ];
      (mockApi.getAllTransactions as ReturnType<typeof vi.fn>).mockResolvedValue(transactions);

      const result = await service.getUnprocessedTransactionsForTags();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('should return all transactions when none have tagger tag', async () => {
      const transactions = [
        createMockTransaction('1', 'Test 1', '10.00', null, null, ['other-tag']),
        createMockTransaction('2', 'Test 2', '20.00', null, null, []),
      ];
      (mockApi.getAllTransactions as ReturnType<typeof vi.fn>).mockResolvedValue(transactions);

      const result = await service.getUnprocessedTransactionsForTags();

      expect(result).toHaveLength(2);
    });
  });

  describe('streamCategorySuggestions', () => {
    it('should yield progress events', async () => {
      const transactions = [createMockTransaction('1', 'Test', '10.00')];
      (mockApi.getAllTransactions as ReturnType<typeof vi.fn>).mockResolvedValue(transactions);
      (analyzeForCategory as ReturnType<typeof vi.fn>).mockResolvedValue({
        categoryName: 'Groceries',
        confidence: 0.8,
        reasoning: 'Test reasoning',
      });

      const events = [];
      for await (const event of service.streamCategorySuggestions()) {
        events.push(event);
      }

      const progressEvents = events.filter((e) => e.type === 'progress');
      expect(progressEvents.length).toBeGreaterThan(0);
    });

    it('should yield suggestion events for valid categories', async () => {
      const transactions = [createMockTransaction('1', 'Supermarket', '50.00')];
      (mockApi.getAllTransactions as ReturnType<typeof vi.fn>).mockResolvedValue(transactions);
      (analyzeForCategory as ReturnType<typeof vi.fn>).mockResolvedValue({
        categoryName: 'Groceries',
        confidence: 0.9,
        reasoning: 'Supermarket purchase',
      });

      const events = [];
      for await (const event of service.streamCategorySuggestions()) {
        events.push(event);
      }

      const suggestionEvents = events.filter((e) => e.type === 'suggestion');
      expect(suggestionEvents).toHaveLength(1);
      expect((suggestionEvents[0].data as any).suggestedCategoryName).toBe('Groceries');
    });

    it('should mark uncategorizable transactions', async () => {
      const transactions = [createMockTransaction('1', 'Unknown transaction', '10.00')];
      (mockApi.getAllTransactions as ReturnType<typeof vi.fn>).mockResolvedValue(transactions);
      (analyzeForCategory as ReturnType<typeof vi.fn>).mockResolvedValue({
        categoryName: 'Uncategorized',
        confidence: 0.1,
        reasoning: 'Unable to determine category',
      });

      const events = [];
      for await (const event of service.streamCategorySuggestions()) {
        events.push(event);
      }

      const suggestionEvents = events.filter((e) => e.type === 'suggestion');
      expect(suggestionEvents).toHaveLength(1);
      expect((suggestionEvents[0].data as any).unableToClassify).toBe(true);
    });

    it('should yield error events on analysis failure', async () => {
      const transactions = [createMockTransaction('1', 'Test', '10.00')];
      (mockApi.getAllTransactions as ReturnType<typeof vi.fn>).mockResolvedValue(transactions);
      (analyzeForCategory as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('AI failed'));

      const events = [];
      for await (const event of service.streamCategorySuggestions()) {
        events.push(event);
      }

      const errorEvents = events.filter((e) => e.type === 'error');
      expect(errorEvents).toHaveLength(1);
      expect((errorEvents[0].data as any).error).toBe('AI failed');
    });

    it('should throw if no categories exist', async () => {
      (mockApi.getAllCategories as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const events = [];
      try {
        for await (const event of service.streamCategorySuggestions()) {
          events.push(event);
        }
        // Should have thrown
        expect.fail('Expected error to be thrown');
      } catch (error) {
        expect((error as Error).message).toContain('No categories found');
      }
    });

    it('should use cached transactions when provided', async () => {
      const cachedTransactions = [createMockTransaction('1', 'Cached', '10.00')];
      (analyzeForCategory as ReturnType<typeof vi.fn>).mockResolvedValue({
        categoryName: 'Groceries',
        confidence: 0.8,
        reasoning: 'Test',
      });

      const events = [];
      for await (const event of service.streamCategorySuggestions(
        undefined,
        undefined,
        undefined,
        cachedTransactions
      )) {
        events.push(event);
      }

      expect(mockApi.getAllTransactions).not.toHaveBeenCalled();
      expect(events.filter((e) => e.type === 'suggestion')).toHaveLength(1);
    });

    it('should respect maxSuggestions option', async () => {
      const transactions = [
        createMockTransaction('1', 'Test 1', '10.00'),
        createMockTransaction('2', 'Test 2', '20.00'),
        createMockTransaction('3', 'Test 3', '30.00'),
      ];
      (mockApi.getAllTransactions as ReturnType<typeof vi.fn>).mockResolvedValue(transactions);
      (analyzeForCategory as ReturnType<typeof vi.fn>).mockResolvedValue({
        categoryName: 'Groceries',
        confidence: 0.8,
        reasoning: 'Test',
      });

      const events = [];
      for await (const event of service.streamCategorySuggestions(undefined, undefined, {
        maxSuggestions: 2,
      })) {
        events.push(event);
      }

      // Should analyze only 2 transactions
      expect(analyzeForCategory).toHaveBeenCalledTimes(2);
    });

    it('should yield complete event at the end', async () => {
      (mockApi.getAllTransactions as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const events = [];
      for await (const event of service.streamCategorySuggestions()) {
        events.push(event);
      }

      const completeEvent = events.find((e) => e.type === 'complete');
      expect(completeEvent).toBeDefined();
    });
  });

  describe('streamTagSuggestions', () => {
    it('should yield progress and suggestion events', async () => {
      const transactions = [createMockTransaction('1', 'Test', '10.00')];
      (mockApi.getAllTransactions as ReturnType<typeof vi.fn>).mockResolvedValue(transactions);
      (analyzeForTags as ReturnType<typeof vi.fn>).mockResolvedValue([
        { tagName: 'food', confidence: 0.9, reasoning: 'Food related' },
      ]);

      const events = [];
      for await (const event of service.streamTagSuggestions()) {
        events.push(event);
      }

      const progressEvents = events.filter((e) => e.type === 'progress');
      const suggestionEvents = events.filter((e) => e.type === 'suggestion');
      expect(progressEvents.length).toBeGreaterThan(0);
      expect(suggestionEvents).toHaveLength(1);
    });

    it('should throw if no tags exist', async () => {
      (mockApi.getAllTags as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const events = [];
      try {
        for await (const event of service.streamTagSuggestions()) {
          events.push(event);
        }
        // Should have thrown
        expect.fail('Expected error to be thrown');
      } catch (error) {
        expect((error as Error).message).toContain('No tags found');
      }
    });

    it('should handle tag analysis errors', async () => {
      const transactions = [createMockTransaction('1', 'Test', '10.00')];
      (mockApi.getAllTransactions as ReturnType<typeof vi.fn>).mockResolvedValue(transactions);
      (analyzeForTags as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Tag AI failed'));

      const events = [];
      for await (const event of service.streamTagSuggestions()) {
        events.push(event);
      }

      const errorEvents = events.filter((e) => e.type === 'error');
      expect(errorEvents).toHaveLength(1);
    });
  });

  describe('suggestCategories', () => {
    it('should return suggestions sorted by confidence', async () => {
      const transactions = [
        createMockTransaction('1', 'Low confidence', '10.00'),
        createMockTransaction('2', 'High confidence', '20.00'),
      ];
      (mockApi.getAllTransactions as ReturnType<typeof vi.fn>).mockResolvedValue(transactions);
      (analyzeForCategory as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          categoryName: 'Groceries',
          confidence: 0.5,
          reasoning: 'Low',
        })
        .mockResolvedValueOnce({
          categoryName: 'Entertainment',
          confidence: 0.9,
          reasoning: 'High',
        });

      const result = await service.suggestCategories();

      expect(result[0].confidence).toBeGreaterThan(result[1].confidence);
    });
  });

  describe('applyCategories', () => {
    it('should update transactions with categories', async () => {
      const updates = [
        {
          transactionId: '1',
          journalId: 'j1',
          updates: { category_id: 'cat1', category_name: 'Groceries' },
        },
      ];

      const result = await service.applyCategories(updates);

      expect(mockApi.updateTransaction).toHaveBeenCalledWith('1', 'j1', {
        category_id: 'cat1',
        category_name: 'Groceries',
      });
      expect(result.successful).toContain('1');
    });

    it('should handle update failures', async () => {
      (mockApi.updateTransaction as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Update failed')
      );

      const updates = [
        {
          transactionId: '1',
          journalId: 'j1',
          updates: { category_id: 'cat1' },
        },
      ];

      const result = await service.applyCategories(updates);

      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error).toBe('Update failed');
    });
  });

  describe('applyTags', () => {
    it('should add tagger tag when applying tags', async () => {
      const updates = [
        {
          transactionId: '1',
          journalId: 'j1',
          updates: { tags: ['food'] },
        },
      ];

      await service.applyTags(updates);

      expect(mockApi.updateTransaction).toHaveBeenCalledWith('1', 'j1', {
        tags: ['food', TAGGER_TAG],
      });
    });

    it('should not duplicate tagger tag', async () => {
      const updates = [
        {
          transactionId: '1',
          journalId: 'j1',
          updates: { tags: ['food', TAGGER_TAG] },
        },
      ];

      await service.applyTags(updates);

      const callArgs = (mockApi.updateTransaction as ReturnType<typeof vi.fn>).mock.calls[0][2];
      const tagCount = callArgs.tags.filter((t: string) => t === TAGGER_TAG).length;
      expect(tagCount).toBe(1);
    });

    it('should handle missing tags array', async () => {
      const updates = [
        {
          transactionId: '1',
          journalId: 'j1',
          updates: {},
        },
      ];

      await service.applyTags(updates);

      expect(mockApi.updateTransaction).toHaveBeenCalledWith('1', 'j1', {
        tags: [TAGGER_TAG],
      });
    });
  });

  describe('getCategories', () => {
    it('should return categories from API', async () => {
      const result = await service.getCategories();

      expect(mockApi.getAllCategories).toHaveBeenCalled();
      expect(result).toHaveLength(2);
    });
  });

  describe('getTags', () => {
    it('should return tags from API', async () => {
      const result = await service.getTags();

      expect(mockApi.getAllTags).toHaveBeenCalled();
      expect(result).toHaveLength(2);
    });
  });
});
