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
import { createAmazonMatchResult } from '../../shared/utils/extenderMatching.js';

const logger = createLogger('AmazonExtender');

// Tag applied to transactions processed by the Amazon Extender
export const AMAZON_EXTENDER_TAG = 'Toolbox for FFIII: Amazon Extender';

export interface StreamEvent<T = unknown> {
  type: 'progress' | 'result' | 'error' | 'complete';
  data: T;
}

export class AmazonOrderExtender {
  private static readonly MATCH_THRESHOLD = 0.5;
  private static readonly AMOUNT_TOLERANCE_PERCENT = 0.05;
  private static readonly ORDER_ID_MATCH_WEIGHT = 0.7;
  private static readonly AMOUNT_MATCH_WEIGHT = 0.25;
  private static readonly EXACT_AMOUNT_BONUS_WEIGHT = 0.2;
  private static readonly DATE_PROXIMITY_MAX_WEIGHT = 0.2;
  private static readonly ITEM_TITLE_MATCH_WEIGHT = 0.05;
  private static readonly AUTO_MATCH_MAX_DATE_DISTANCE_DAYS = 3;
  private static readonly AMBIGUOUS_FALLBACK_DELTA = 0.05;

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
   * Find potential Amazon transactions in Firefly III
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

    logger.debug('Fetching transactions from Firefly III', { startDate, endDate });
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
      let runnerUpConfidence = 0;

      for (const order of this.amazonOrders) {
        const { confidence, breakdown } = this.calculateMatchConfidence(
          amount,
          transactionDate,
          split.description,
          order
        );

        if (confidence > bestConfidence) {
          runnerUpConfidence = bestConfidence;
        }

        if (confidence > bestConfidence && confidence > AmazonOrderExtender.MATCH_THRESHOLD) {
          bestConfidence = confidence;
          bestMatch = order;
          bestBreakdown = breakdown;
        } else if (
          confidence > runnerUpConfidence &&
          confidence > AmazonOrderExtender.MATCH_THRESHOLD
        ) {
          runnerUpConfidence = confidence;
        }
      }

      if (
        bestMatch &&
        bestBreakdown &&
        bestBreakdown.orderIdMatch === 0 &&
        bestConfidence - runnerUpConfidence <= AmazonOrderExtender.AMBIGUOUS_FALLBACK_DELTA
      ) {
        bestMatch = null;
        bestConfidence = 0;
        bestBreakdown = undefined;
      }

      const result: AmazonMatchResult = createAmazonMatchResult({
        transactionId: transaction.id,
        transaction: split,
        matchedOrder: bestMatch,
        matchConfidence: bestConfidence,
        confidenceBreakdown: bestBreakdown,
        matchMethod: 'automatic',
      });

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
      breakdown.orderIdMatch = AmazonOrderExtender.ORDER_ID_MATCH_WEIGHT;
    }

    // Check amount match (within 5%)
    const amountDiff = Math.abs(transactionAmount - order.totalAmount);
    const amountTolerance = order.totalAmount * AmazonOrderExtender.AMOUNT_TOLERANCE_PERCENT;
    const hasExactAmount = amountDiff === 0;

    if (amountDiff <= amountTolerance) {
      breakdown.amountMatch = AmazonOrderExtender.AMOUNT_MATCH_WEIGHT;
      if (hasExactAmount) {
        breakdown.exactAmountBonus = AmazonOrderExtender.EXACT_AMOUNT_BONUS_WEIGHT;
      }
    } else if (!hasOrderId) {
      // Amount must match if we don't have order ID
      return { confidence: 0, breakdown };
    }

    const daysDiff = this.getCalendarDayDifference(transactionDate, new Date(order.orderDate));

    if (daysDiff <= AmazonOrderExtender.AUTO_MATCH_MAX_DATE_DISTANCE_DAYS) {
      breakdown.dateProximity =
        AmazonOrderExtender.DATE_PROXIMITY_MAX_WEIGHT *
        (1 - daysDiff / AmazonOrderExtender.AUTO_MATCH_MAX_DATE_DISTANCE_DAYS);
    } else if (!hasOrderId) {
      return { confidence: 0, breakdown };
    }

    if (!hasOrderId && !hasExactAmount) {
      return { confidence: 0, breakdown };
    }

    // Check if any item title appears in description
    for (const item of order.items) {
      const words = item.title.split(' ').filter((w) => w.length > 4);
      for (const word of words) {
        if (description.toLowerCase().includes(word.toLowerCase())) {
          breakdown.itemTitleMatch = AmazonOrderExtender.ITEM_TITLE_MATCH_WEIGHT;
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

  private getCalendarDayDifference(firstDate: Date, secondDate: Date): number {
    const firstUtc = Date.UTC(
      firstDate.getUTCFullYear(),
      firstDate.getUTCMonth(),
      firstDate.getUTCDate()
    );
    const secondUtc = Date.UTC(
      secondDate.getUTCFullYear(),
      secondDate.getUTCMonth(),
      secondDate.getUTCDate()
    );

    return Math.abs(firstUtc - secondUtc) / (1000 * 60 * 60 * 24);
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
