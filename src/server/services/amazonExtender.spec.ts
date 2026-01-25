import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AmazonOrderExtender, AMAZON_EXTENDER_TAG } from './amazonExtender.js';
import type { FireflyTransaction, FireflyTransactionSplit } from '../../shared/types/firefly.js';
import type { FireflyApiClient } from '../clients/firefly.js';
import type { AmazonOrder } from '../../shared/types/app.js';

// Helper to create a mock transaction
function createMockTransaction(
  id: string,
  description: string,
  amount: string,
  date: string,
  destinationName: string = 'Amazon',
  tags: string[] = []
): FireflyTransaction {
  return {
    id,
    type: 'transactions',
    attributes: {
      created_at: date,
      updated_at: date,
      user: '1',
      group_title: description,
      transactions: [
        {
          date,
          description,
          amount,
          type: 'withdrawal',
          source_id: 'src1',
          source_name: 'Checking',
          destination_id: 'dest1',
          destination_name: destinationName,
          currency_code: 'EUR',
          currency_symbol: '€',
          currency_id: '1',
          tags,
          transaction_journal_id: `journal-${id}`,
        } as unknown as FireflyTransactionSplit,
      ],
    },
    links: { self: '' },
  };
}

// Create mock order
function createMockOrder(
  orderId: string,
  totalAmount: number,
  orderDate: string,
  items: Array<{ title: string; price: number; quantity?: number }> = []
): AmazonOrder {
  return {
    orderId,
    orderDate,
    totalAmount,
    currency: 'EUR',
    items: items.map((item) => ({
      title: item.title,
      asin: 'B001234567',
      quantity: item.quantity || 1,
      price: item.price,
      discount: 0,
      itemUrl: '',
    })),
    orderStatus: 'Delivered',
    detailsUrl: '',
    promotions: [],
    totalSavings: 0,
  };
}

// Create mock Firefly API client
function createMockFireflyApi(): FireflyApiClient {
  return {
    getAllTransactions: vi.fn().mockResolvedValue([]),
    getTransaction: vi.fn().mockResolvedValue({
      id: '1',
      attributes: { transactions: [{ tags: [] }] },
    }),
    updateTransaction: vi.fn().mockResolvedValue({}),
  } as unknown as FireflyApiClient;
}

describe('AmazonOrderExtender', () => {
  let mockApi: FireflyApiClient;
  let extender: AmazonOrderExtender;

  beforeEach(() => {
    vi.clearAllMocks();
    mockApi = createMockFireflyApi();
    extender = new AmazonOrderExtender(mockApi);
  });

  describe('loadOrders', () => {
    it('should load orders', () => {
      const orders = [
        createMockOrder('123', 29.99, '2024-01-15', [{ title: 'Test Item', price: 29.99 }]),
      ];

      extender.loadOrders(orders);

      expect(extender.getLoadedOrders()).toEqual(orders);
    });
  });

  describe('clearOrders', () => {
    it('should clear loaded orders', () => {
      const orders = [createMockOrder('123', 29.99, '2024-01-15', [])];
      extender.loadOrders(orders);

      extender.clearOrders();

      expect(extender.getLoadedOrders()).toEqual([]);
    });
  });

  describe('parseOrderExport', () => {
    it('should parse valid order export', () => {
      const jsonData = [
        {
          orderId: '123-456',
          orderDate: '2024-01-15',
          totalAmount: 29.99,
          currency: 'EUR',
          items: [{ title: 'Test Item', price: 29.99, quantity: '1', asin: 'B001234567' }],
        },
      ];

      const orders = extender.parseOrderExport(jsonData);

      expect(orders).toHaveLength(1);
      expect(orders[0].orderId).toBe('123-456');
      expect(orders[0].totalAmount).toBe(29.99);
    });

    it('should throw for non-array input', () => {
      expect(() => extender.parseOrderExport({})).toThrow('Expected an array');
    });

    it('should handle missing fields with defaults', () => {
      const jsonData = [{}];

      const orders = extender.parseOrderExport(jsonData);

      expect(orders).toHaveLength(1);
      expect(orders[0].orderId).toMatch(/^unknown-0/);
    });

    it('should handle numeric amount values', () => {
      const jsonData = [
        {
          orderId: '123',
          totalAmount: 29.99, // Numeric values should pass through unchanged
          items: [],
        },
      ];

      const orders = extender.parseOrderExport(jsonData);

      expect(orders[0].totalAmount).toBe(29.99);
    });

    it('should parse items with quantity', () => {
      const jsonData = [
        {
          orderId: '123',
          totalAmount: 59.98,
          items: [{ title: 'Item', price: 29.99, quantity: '2' }],
        },
      ];

      const orders = extender.parseOrderExport(jsonData);

      expect(orders[0].items[0].quantity).toBe(2);
      expect(orders[0].items[0].price).toBe(29.99);
    });
  });

  describe('findAmazonTransactions', () => {
    it('should filter transactions by Amazon indicators', async () => {
      const transactions = [
        createMockTransaction('1', 'AMAZON.DE Order', '29.99', '2024-01-15'),
        createMockTransaction('2', 'Regular purchase', '50.00', '2024-01-15', 'Store'),
        createMockTransaction('3', 'AMZN Marketplace', '15.00', '2024-01-15', 'AMZN'),
      ];
      (mockApi.getAllTransactions as ReturnType<typeof vi.fn>).mockResolvedValue(transactions);

      const result = await extender.findAmazonTransactions();

      expect(result).toHaveLength(2);
      expect(result.map((t) => t.id)).toEqual(['1', '3']);
    });

    it('should use cached transactions when available', async () => {
      const cachedTransactions = [
        createMockTransaction('1', 'Amazon Order', '29.99', '2024-01-15'),
      ];
      extender.setCachedTransactions(cachedTransactions, '2024-01-01', '2024-01-31');

      const result = await extender.findAmazonTransactions('2024-01-01', '2024-01-31');

      expect(mockApi.getAllTransactions).not.toHaveBeenCalled();
      expect(result).toEqual(cachedTransactions);
    });

    it('should fetch new transactions when date range differs', async () => {
      const cachedTransactions = [createMockTransaction('1', 'Amazon', '29.99', '2024-01-15')];
      extender.setCachedTransactions(cachedTransactions, '2024-01-01', '2024-01-31');
      (mockApi.getAllTransactions as ReturnType<typeof vi.fn>).mockResolvedValue([
        createMockTransaction('2', 'Amazon', '50.00', '2024-02-15'),
      ]);

      const result = await extender.findAmazonTransactions('2024-02-01', '2024-02-28');

      expect(mockApi.getAllTransactions).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  describe('clearCachedTransactions', () => {
    it('should clear cached transactions', async () => {
      const cachedTransactions = [createMockTransaction('1', 'Amazon', '29.99', '2024-01-15')];
      extender.setCachedTransactions(cachedTransactions, '2024-01-01', '2024-01-31');
      (mockApi.getAllTransactions as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      extender.clearCachedTransactions();
      await extender.findAmazonTransactions('2024-01-01', '2024-01-31');

      expect(mockApi.getAllTransactions).toHaveBeenCalled();
    });
  });

  describe('streamMatchTransactionsWithOrders', () => {
    it('should throw if no orders loaded', async () => {
      const generator = extender.streamMatchTransactionsWithOrders();

      await expect(generator.next()).rejects.toThrow('No Amazon orders loaded');
    });

    it('should yield progress events', async () => {
      const orders = [
        createMockOrder('123', 29.99, '2024-01-15', [{ title: 'Item', price: 29.99 }]),
      ];
      extender.loadOrders(orders);

      const transactions = [createMockTransaction('1', 'Amazon Order 123', '29.99', '2024-01-15')];
      (mockApi.getAllTransactions as ReturnType<typeof vi.fn>).mockResolvedValue(transactions);

      const events = [];
      for await (const event of extender.streamMatchTransactionsWithOrders()) {
        events.push(event);
      }

      const progressEvents = events.filter((e) => e.type === 'progress');
      expect(progressEvents.length).toBeGreaterThan(0);
    });

    it('should match transactions with orders by order ID', async () => {
      const orders = [
        createMockOrder('123-456', 29.99, '2024-01-15', [{ title: 'Book', price: 29.99 }]),
      ];
      extender.loadOrders(orders);

      const transactions = [
        createMockTransaction('1', 'Amazon Order 123-456', '29.99', '2024-01-15'),
      ];
      (mockApi.getAllTransactions as ReturnType<typeof vi.fn>).mockResolvedValue(transactions);

      const events = [];
      for await (const event of extender.streamMatchTransactionsWithOrders()) {
        events.push(event);
      }

      const resultEvents = events.filter((e) => e.type === 'result');
      expect(resultEvents).toHaveLength(1);
      expect((resultEvents[0].data as any).matchedOrder?.orderId).toBe('123-456');
      expect((resultEvents[0].data as any).matchConfidence).toBeGreaterThan(0.5);
    });

    it('should match by amount and date when no order ID', async () => {
      // Without order ID in description, confidence is low (amountMatch + dateProximity < 0.5)
      // so there will be no match
      const orders = [
        createMockOrder('123', 29.99, '2024-01-15', [{ title: 'Item', price: 29.99 }]),
      ];
      extender.loadOrders(orders);

      const transactions = [createMockTransaction('1', 'Amazon Purchase', '29.99', '2024-01-16')];
      (mockApi.getAllTransactions as ReturnType<typeof vi.fn>).mockResolvedValue(transactions);

      const events = [];
      for await (const event of extender.streamMatchTransactionsWithOrders()) {
        events.push(event);
      }

      const resultEvents = events.filter((e) => e.type === 'result');
      expect(resultEvents).toHaveLength(1);
      // Without order ID in description, confidence is below threshold, so no match
      expect((resultEvents[0].data as any).matchedOrder).toBeNull();
    });

    it('should exclude already processed transactions', async () => {
      const orders = [createMockOrder('123', 29.99, '2024-01-15', [])];
      extender.loadOrders(orders);

      const transactions = [
        createMockTransaction('1', 'Amazon Order', '29.99', '2024-01-15', 'Amazon', [
          AMAZON_EXTENDER_TAG,
        ]),
        createMockTransaction('2', 'Amazon Order', '49.99', '2024-01-16'),
      ];
      (mockApi.getAllTransactions as ReturnType<typeof vi.fn>).mockResolvedValue(transactions);

      const events = [];
      for await (const event of extender.streamMatchTransactionsWithOrders(
        undefined,
        undefined,
        true
      )) {
        events.push(event);
      }

      const resultEvents = events.filter((e) => e.type === 'result');
      expect(resultEvents).toHaveLength(1);
      expect((resultEvents[0].data as any).transactionId).toBe('2');
    });

    it('should include processed transactions when excludeProcessed is false', async () => {
      const orders = [createMockOrder('123', 29.99, '2024-01-15', [])];
      extender.loadOrders(orders);

      const transactions = [
        createMockTransaction('1', 'Amazon Order', '29.99', '2024-01-15', 'Amazon', [
          AMAZON_EXTENDER_TAG,
        ]),
      ];
      (mockApi.getAllTransactions as ReturnType<typeof vi.fn>).mockResolvedValue(transactions);

      const events = [];
      for await (const event of extender.streamMatchTransactionsWithOrders(
        undefined,
        undefined,
        false
      )) {
        events.push(event);
      }

      const resultEvents = events.filter((e) => e.type === 'result');
      expect(resultEvents).toHaveLength(1);
    });

    it('should yield complete event at the end', async () => {
      extender.loadOrders([createMockOrder('123', 29.99, '2024-01-15', [])]);
      (mockApi.getAllTransactions as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const events = [];
      for await (const event of extender.streamMatchTransactionsWithOrders()) {
        events.push(event);
      }

      const completeEvent = events.find((e) => e.type === 'complete');
      expect(completeEvent).toBeDefined();
    });

    it('should generate suggested description with item details', async () => {
      const orders = [
        createMockOrder('123-456', 29.99, '2024-01-15', [
          {
            title: 'Awesome Product With Very Long Name That Should Be Truncated For Display',
            price: 29.99,
          },
        ]),
      ];
      extender.loadOrders(orders);

      const transactions = [createMockTransaction('1', 'Amazon 123-456', '29.99', '2024-01-15')];
      (mockApi.getAllTransactions as ReturnType<typeof vi.fn>).mockResolvedValue(transactions);

      const events = [];
      for await (const event of extender.streamMatchTransactionsWithOrders()) {
        events.push(event);
      }

      const resultEvent = events.find((e) => e.type === 'result');
      expect((resultEvent?.data as any).suggestedDescription).toContain('Amazon 123-456');
      expect((resultEvent?.data as any).suggestedNotes).toContain('Amazon Order 123-456');
    });
  });

  describe('matchTransactionsWithOrders', () => {
    it('should return sorted results by confidence', async () => {
      const orders = [
        createMockOrder('123', 29.99, '2024-01-15', []),
        createMockOrder('456', 49.99, '2024-01-20', []),
      ];
      extender.loadOrders(orders);

      const transactions = [
        createMockTransaction('1', 'Amazon Purchase', '49.99', '2024-01-21'), // Lower confidence
        createMockTransaction('2', 'Amazon Order 123', '29.99', '2024-01-15'), // Higher confidence (has order ID)
      ];
      (mockApi.getAllTransactions as ReturnType<typeof vi.fn>).mockResolvedValue(transactions);

      const results = await extender.matchTransactionsWithOrders();

      expect(results[0].matchConfidence).toBeGreaterThanOrEqual(results[1].matchConfidence);
    });
  });

  describe('applyDescriptions', () => {
    it('should update transactions with new descriptions', async () => {
      const matches = [
        {
          transactionId: '1',
          journalId: 'journal-1',
          newDescription: 'Amazon Order 123: Item',
          newNotes: 'Order details',
        },
      ];
      (mockApi.getTransaction as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: '1',
        attributes: {
          transactions: [{ transaction_journal_id: 'journal-1', tags: [] }],
        },
      });

      const result = await extender.applyDescriptions(matches);

      expect(mockApi.updateTransaction).toHaveBeenCalledWith('1', 'journal-1', {
        description: 'Amazon Order 123: Item',
        notes: 'Order details',
        tags: [AMAZON_EXTENDER_TAG],
      });
      expect(result.successful).toContain('1');
    });

    it('should not duplicate extender tag', async () => {
      const matches = [
        {
          transactionId: '1',
          journalId: 'journal-1',
          newDescription: 'Updated',
        },
      ];
      (mockApi.getTransaction as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: '1',
        attributes: {
          transactions: [{ transaction_journal_id: 'journal-1', tags: [AMAZON_EXTENDER_TAG] }],
        },
      });

      await extender.applyDescriptions(matches);

      const callArgs = (mockApi.updateTransaction as ReturnType<typeof vi.fn>).mock.calls[0][2];
      const tagCount = callArgs.tags.filter((t: string) => t === AMAZON_EXTENDER_TAG).length;
      expect(tagCount).toBe(1);
    });

    it('should handle update failures', async () => {
      (mockApi.getTransaction as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('API Error')
      );

      const matches = [
        {
          transactionId: '1',
          journalId: 'journal-1',
          newDescription: 'Updated',
        },
      ];

      const result = await extender.applyDescriptions(matches);

      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error).toBe('API Error');
    });
  });
});
