import { FireflyApiClient } from '../clients/firefly.js';
import { parseAmount } from '../utils/amountParser.js';
import { createLogger } from '../utils/logger.js';
import type { FireflyTransaction } from '../../shared/types/firefly.js';
import type {
  AmazonOrder,
  AmazonOrderItem,
  AmazonMatchResult,
  BulkUpdateResult,
} from '../../shared/types/app.js';

const logger = createLogger('AmazonExtender');

// Tag applied to transactions processed by the Amazon Extender
export const AMAZON_EXTENDER_TAG = 'FFIII Toolbox: Amazon Extender';

export interface StreamEvent<T = unknown> {
  type: 'progress' | 'result' | 'error' | 'complete';
  data: T;
}

export class AmazonOrderExtender {
  private fireflyApi: FireflyApiClient;
  private amazonOrders: AmazonOrder[] = [];
  private cachedAmazonTransactions: FireflyTransaction[] | null = null;
  private cachedDateRange: { startDate?: string; endDate?: string } | null = null;

  constructor(fireflyApi: FireflyApiClient) {
    this.fireflyApi = fireflyApi;
  }

  /**
   * Set cached Amazon transactions (pre-filtered from count-transactions)
   */
  setCachedTransactions(
    transactions: FireflyTransaction[],
    startDate?: string,
    endDate?: string
  ): void {
    this.cachedAmazonTransactions = transactions;
    this.cachedDateRange = { startDate, endDate };
  }

  /**
   * Clear cached transactions
   */
  clearCachedTransactions(): void {
    this.cachedAmazonTransactions = null;
    this.cachedDateRange = null;
  }

  /**
   * Load Amazon orders from a JSON file or array
   */
  loadOrders(orders: AmazonOrder[]): void {
    this.amazonOrders = orders;
  }

  /**
   * Parse Amazon order export JSON from Amazon Order History Exporter
   * https://github.com/xenolphthalein/amazon-order-history-exporter
   */
  parseOrderExport(jsonData: unknown): AmazonOrder[] {
    if (!Array.isArray(jsonData)) {
      throw new Error('Invalid Amazon order export format. Expected an array.');
    }

    return jsonData.map((order, index) => {
      // Validate required fields
      const orderId = order.orderId || `unknown-${index}`;
      const orderDate = order.orderDate || new Date().toISOString().split('T')[0];
      const totalAmount =
        typeof order.totalAmount === 'number' ? order.totalAmount : parseAmount(order.totalAmount);
      const currency = order.currency || 'EUR';
      const items = this.parseItems(order.items || []);
      const orderStatus = order.orderStatus || 'Unknown';
      const detailsUrl = order.detailsUrl || '';
      const promotions = order.promotions || [];
      const totalSavings = typeof order.totalSavings === 'number' ? order.totalSavings : 0;

      return {
        orderId,
        orderDate,
        totalAmount,
        currency,
        items,
        orderStatus,
        detailsUrl,
        promotions,
        totalSavings,
      };
    });
  }

  private parseItems(items: unknown[]): AmazonOrderItem[] {
    return items.map((item) => {
      const i = item as Record<string, unknown>;
      return {
        title: (i.title as string) || 'Unknown Item',
        asin: (i.asin as string) || '',
        quantity: parseInt((i.quantity as string) || '1', 10),
        price: typeof i.price === 'number' ? i.price : parseAmount(i.price),
        discount: typeof i.discount === 'number' ? i.discount : 0,
        itemUrl: (i.itemUrl as string) || '',
      };
    });
  }

  /**
   * Find potential Amazon transactions in FireflyIII
   */
  async findAmazonTransactions(
    startDate?: string,
    endDate?: string
  ): Promise<FireflyTransaction[]> {
    // Check if we have cached transactions for the same date range
    if (
      this.cachedAmazonTransactions &&
      this.cachedDateRange?.startDate === startDate &&
      this.cachedDateRange?.endDate === endDate
    ) {
      logger.debug(`Using ${this.cachedAmazonTransactions.length} cached Amazon transactions`);
      return this.cachedAmazonTransactions;
    }

    logger.debug('Fetching transactions from FireflyIII', { startDate, endDate });
    const transactions = await this.fireflyApi.getAllTransactions(startDate, endDate);
    logger.debug(`Fetched ${transactions.length} total transactions`);

    // Filter for transactions that look like Amazon orders
    const amazonTransactions = transactions.filter((t) => {
      const split = t.attributes.transactions[0];
      if (!split) return false;

      const description = split.description.toLowerCase();
      const destination = split.destination_name.toLowerCase();

      // Common Amazon indicators
      const amazonIndicators = [
        'amazon',
        'amzn',
        'amz*',
        'amazon.de',
        'amazon.com',
        'amazon.co.uk',
        'amazon eu',
        'amazon payments',
        'amazon marketplace',
      ];

      return amazonIndicators.some(
        (indicator) => description.includes(indicator) || destination.includes(indicator)
      );
    });

    logger.info(`Found ${amazonTransactions.length} potential Amazon transactions`);

    // Cache the results
    this.cachedAmazonTransactions = amazonTransactions;
    this.cachedDateRange = { startDate, endDate };

    return amazonTransactions;
  }

  /**
   * Streaming version for matching transactions with orders
   */
  async *streamMatchTransactionsWithOrders(
    startDate?: string,
    endDate?: string,
    excludeProcessed: boolean = true
  ): AsyncGenerator<StreamEvent> {
    if (this.amazonOrders.length === 0) {
      logger.warn('Attempted to match without loaded orders');
      throw new Error('No Amazon orders loaded. Please upload an Amazon order export file first.');
    }

    logger.debug('Starting stream match transactions with orders', {
      startDate,
      endDate,
      excludeProcessed,
    });

    yield {
      type: 'progress',
      data: { current: 0, total: 0, message: 'Finding Amazon transactions...' },
    };

    let transactions = await this.findAmazonTransactions(startDate, endDate);

    // Filter out transactions that have already been processed
    if (excludeProcessed) {
      const initialCount = transactions.length;
      transactions = transactions.filter((t) => {
        const split = t.attributes.transactions[0];
        return !split?.tags?.includes(AMAZON_EXTENDER_TAG);
      });
      logger.debug(
        `Filtered out ${initialCount - transactions.length} already processed transactions`
      );
    }

    const total = transactions.length;
    yield {
      type: 'progress',
      data: {
        current: 0,
        total,
        message: `Matching ${total} transactions with ${this.amazonOrders.length} orders...`,
      },
    };

    for (let i = 0; i < transactions.length; i++) {
      const transaction = transactions[i];
      const split = transaction.attributes.transactions[0];
      if (!split) continue;

      // Emit progress every 5 transactions
      if (i % 5 === 0 || i === transactions.length - 1) {
        yield {
          type: 'progress',
          data: {
            current: i + 1,
            total,
            message: `Matching transaction ${i + 1} of ${total}...`,
          },
        };
      }

      const amount = Math.abs(parseFloat(split.amount));
      const transactionDate = new Date(split.date);

      // Try to find matching order
      let bestMatch: AmazonOrder | null = null;
      let bestConfidence = 0;
      let bestBreakdown: AmazonMatchResult['confidenceBreakdown'] = undefined;

      for (const order of this.amazonOrders) {
        const { confidence, breakdown } = this.calculateMatchConfidence(
          amount,
          transactionDate,
          split.description,
          order
        );

        if (confidence > bestConfidence && confidence > 0.5) {
          bestConfidence = confidence;
          bestMatch = order;
          bestBreakdown = breakdown;
        }
      }

      // Generate suggested description and notes
      const { description: suggestedDescription, notes: suggestedNotes } = bestMatch
        ? this.generateDescription(split.description, bestMatch)
        : { description: split.description, notes: '' };

      const result: AmazonMatchResult = {
        transactionId: transaction.id,
        transaction: split,
        matchedOrder: bestMatch,
        matchConfidence: bestConfidence,
        confidenceBreakdown: bestBreakdown,
        suggestedDescription,
        suggestedNotes,
      };

      yield { type: 'result', data: result };
    }

    yield { type: 'complete', data: { total: transactions.length } };
  }

  /**
   * Match Amazon transactions with order data
   */
  async matchTransactionsWithOrders(
    startDate?: string,
    endDate?: string,
    excludeProcessed: boolean = true
  ): Promise<AmazonMatchResult[]> {
    const results: AmazonMatchResult[] = [];
    for await (const event of this.streamMatchTransactionsWithOrders(
      startDate,
      endDate,
      excludeProcessed
    )) {
      if (event.type === 'result') {
        results.push(event.data as AmazonMatchResult);
      }
    }
    // Sort by confidence (matches first)
    return results.sort((a, b) => b.matchConfidence - a.matchConfidence);
  }

  private calculateMatchConfidence(
    transactionAmount: number,
    transactionDate: Date,
    description: string,
    order: AmazonOrder
  ): {
    confidence: number;
    breakdown: {
      orderIdMatch: number;
      amountMatch: number;
      exactAmountBonus: number;
      dateProximity: number;
      itemTitleMatch: number;
    };
  } {
    const breakdown = {
      orderIdMatch: 0,
      amountMatch: 0,
      exactAmountBonus: 0,
      dateProximity: 0,
      itemTitleMatch: 0,
    };

    // Check if order ID appears in description - this is a very strong indicator
    const hasOrderId = order.orderId && description.includes(order.orderId);
    if (hasOrderId) {
      breakdown.orderIdMatch = 0.7; // Order ID is unique, strong match
    }

    // Check amount match (within 5%)
    const amountDiff = Math.abs(transactionAmount - order.totalAmount);
    const amountTolerance = order.totalAmount * 0.05;

    if (amountDiff <= amountTolerance) {
      breakdown.amountMatch = 0.2;
      if (amountDiff === 0) {
        breakdown.exactAmountBonus = 0.1; // Exact match bonus
      }
    } else if (!hasOrderId) {
      // Amount must match if we don't have order ID
      return { confidence: 0, breakdown };
    }

    // Check date proximity (within 7 days)
    const orderDate = new Date(order.orderDate);
    const daysDiff = Math.abs(
      (transactionDate.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysDiff <= 7) {
      breakdown.dateProximity = 0.1 * (1 - daysDiff / 7);
    }

    // Check if any item title appears in description
    for (const item of order.items) {
      const words = item.title.split(' ').filter((w) => w.length > 4);
      for (const word of words) {
        if (description.toLowerCase().includes(word.toLowerCase())) {
          breakdown.itemTitleMatch = 0.05;
          break;
        }
      }
      if (breakdown.itemTitleMatch > 0) break;
    }

    const confidence = Math.min(
      breakdown.orderIdMatch +
        breakdown.amountMatch +
        breakdown.exactAmountBonus +
        breakdown.dateProximity +
        breakdown.itemTitleMatch,
      1
    );

    return { confidence, breakdown };
  }

  private generateDescription(
    _originalDescription: string,
    order: AmazonOrder
  ): { description: string; notes: string } {
    const MAX_ITEM_LENGTH = 50;

    // Generate full item descriptions for notes
    const fullItemsList = order.items.map((item) => {
      if (item.quantity > 1) {
        return `${item.quantity}x ${item.title}`;
      }
      return item.title;
    });

    // Generate truncated item descriptions for display
    const shortItemsList = order.items.map((item) => {
      let title = item.title;
      if (title.length > MAX_ITEM_LENGTH) {
        title = title.substring(0, MAX_ITEM_LENGTH - 3) + '...';
      }
      if (item.quantity > 1) {
        return `${item.quantity}x ${title}`;
      }
      return title;
    });

    // Short description for the description field
    const shortDescription = `Amazon ${order.orderId}: ${shortItemsList.join(', ')}`;

    // Full description for notes
    const fullNotes = `Amazon Order ${order.orderId}\n\nItems:\n${fullItemsList.map((item) => `• ${item}`).join('\n')}`;

    return { description: shortDescription, notes: fullNotes };
  }

  /**
   * Apply matched descriptions and notes to transactions
   */
  async applyDescriptions(
    matches: Array<{
      transactionId: string;
      journalId: string;
      newDescription: string;
      newNotes?: string;
    }>
  ): Promise<BulkUpdateResult> {
    const result: BulkUpdateResult = {
      successful: [],
      failed: [],
    };

    for (const match of matches) {
      try {
        // Get current transaction to merge tags
        const currentTransaction = await this.fireflyApi.getTransaction(match.transactionId);
        const currentSplit = currentTransaction.attributes.transactions.find(
          (t) => t.transaction_journal_id === match.journalId
        );
        const existingTags = currentSplit?.tags || [];

        // Add our tag if not already present
        const newTags = existingTags.includes(AMAZON_EXTENDER_TAG)
          ? existingTags
          : [...existingTags, AMAZON_EXTENDER_TAG];

        const updateData: { description: string; notes?: string; tags: string[] } = {
          description: match.newDescription,
          tags: newTags,
        };

        if (match.newNotes) {
          updateData.notes = match.newNotes;
        }

        await this.fireflyApi.updateTransaction(match.transactionId, match.journalId, updateData);
        result.successful.push(match.transactionId);
      } catch (error) {
        result.failed.push({
          transactionId: match.transactionId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return result;
  }

  /**
   * Get currently loaded orders
   */
  getLoadedOrders(): AmazonOrder[] {
    return this.amazonOrders;
  }

  /**
   * Clear loaded orders
   */
  clearOrders(): void {
    this.amazonOrders = [];
  }
}
