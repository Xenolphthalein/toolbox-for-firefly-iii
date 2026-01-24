import { v4 as uuidv4 } from 'uuid';
import { FireflyApiClient } from '../clients/firefly.js';
import { createLogger } from '../utils/logger.js';
import type { FireflyTransaction } from '../../shared/types/firefly.js';
import type {
  DuplicateGroup,
  DuplicateFinderOptions,
  DuplicateConfidenceBreakdown,
} from '../../shared/types/app.js';

const logger = createLogger('DuplicateService');

export interface StreamEvent<T = unknown> {
  type: 'progress' | 'result' | 'error' | 'complete';
  data: T;
}

interface CompareResult {
  isDuplicate: boolean;
  score: number;
  reasons: string[];
  breakdown: DuplicateConfidenceBreakdown;
}

export class DuplicateTransactionFinder {
  private fireflyApi: FireflyApiClient;
  private defaultOptions: Required<DuplicateFinderOptions> = {
    dateRange: 3, // days
    amountTolerance: 0.01, // 1%
    includeDescriptionMatch: true,
    includeSourceMatch: true,
    includeDestinationMatch: true,
  };

  constructor(fireflyApi: FireflyApiClient) {
    this.fireflyApi = fireflyApi;
  }

  /**
   * Streaming version for finding duplicates with progress events
   * @param startDate - Start date for fetching transactions (ignored if cachedTransactions provided)
   * @param endDate - End date for fetching transactions (ignored if cachedTransactions provided)
   * @param options - Duplicate finder options
   * @param cachedTransactions - Pre-fetched transactions to use instead of fetching from API
   */
  async *streamFindDuplicates(
    startDate?: string,
    endDate?: string,
    options?: DuplicateFinderOptions,
    cachedTransactions?: FireflyTransaction[]
  ): AsyncGenerator<StreamEvent> {
    const opts = { ...this.defaultOptions, ...options };

    logger.debug('Starting duplicate finding stream', {
      opts,
      range: { startDate, endDate },
      hasCache: !!cachedTransactions,
    });

    let transactions: FireflyTransaction[];

    if (cachedTransactions) {
      // Use cached transactions
      transactions = cachedTransactions;
      logger.debug(`Using ${transactions.length} cached transactions`);
      yield {
        type: 'progress',
        data: {
          current: 0,
          total: transactions.length,
          message: `Using ${transactions.length} cached transactions...`,
        },
      };
    } else {
      // Send initial progress
      logger.debug('Fetching transactions from API');
      yield {
        type: 'progress',
        data: { current: 0, total: 0, message: 'Fetching transactions...' },
      };

      // Fetch all transactions in the date range
      transactions = await this.fireflyApi.getAllTransactions(startDate, endDate);
      logger.info(`Fetched ${transactions.length} transactions from API`);
    }

    const total = transactions.length;

    yield {
      type: 'progress',
      data: { current: 0, total, message: `Analyzing ${total} transactions...` },
    };

    // Group potential duplicates
    const duplicateGroups: DuplicateGroup[] = [];
    const processedIds = new Set<string>();

    for (let i = 0; i < transactions.length; i++) {
      const transaction = transactions[i];
      const transactionId = transaction.id;

      // Emit progress every 10 transactions or at the end
      if (i % 50 === 0 || i === transactions.length - 1) {
        yield {
          type: 'progress',
          data: {
            current: i + 1,
            total,
            message: `Comparing transaction ${i + 1} of ${total}...`,
          },
        };
      }

      if (processedIds.has(transactionId)) {
        continue;
      }

      const potentialDuplicates: FireflyTransaction[] = [];
      const matchReasons: string[] = [];
      let totalScore = 0;
      const aggregatedBreakdown: DuplicateConfidenceBreakdown = {
        dateMatch: 0,
        amountMatch: 0,
        descriptionMatch: 0,
        sourceAccountMatch: 0,
        destinationAccountMatch: 0,
        externalIdMatch: 0,
        importHashMatch: 0,
      };

      for (let j = i + 1; j < transactions.length; j++) {
        const otherTransaction = transactions[j];
        const otherId = otherTransaction.id;

        if (processedIds.has(otherId)) {
          continue;
        }

        const matchResult = this.compareTransactions(transaction, otherTransaction, opts);

        if (matchResult.isDuplicate) {
          potentialDuplicates.push(otherTransaction);
          matchReasons.push(...matchResult.reasons);
          totalScore += matchResult.score;
          // Aggregate breakdown values
          for (const key of Object.keys(
            matchResult.breakdown
          ) as (keyof DuplicateConfidenceBreakdown)[]) {
            aggregatedBreakdown[key] = Math.max(
              aggregatedBreakdown[key],
              matchResult.breakdown[key]
            );
          }
        }
      }

      if (potentialDuplicates.length > 0) {
        // Mark all duplicates as processed
        processedIds.add(transactionId);
        potentialDuplicates.forEach((t) => processedIds.add(t.id));

        const group: DuplicateGroup = {
          id: uuidv4(),
          transactions: [transaction, ...potentialDuplicates],
          matchScore: totalScore / potentialDuplicates.length,
          matchReasons: [...new Set(matchReasons)],
          confidenceBreakdown: aggregatedBreakdown,
        };

        duplicateGroups.push(group);

        // Emit each duplicate group as it's found
        yield { type: 'result', data: group };
      }
    }

    yield { type: 'complete', data: { total: duplicateGroups.length } };
  }

  async findDuplicates(
    startDate?: string,
    endDate?: string,
    options?: DuplicateFinderOptions
  ): Promise<DuplicateGroup[]> {
    const duplicateGroups: DuplicateGroup[] = [];
    for await (const event of this.streamFindDuplicates(startDate, endDate, options)) {
      if (event.type === 'result') {
        duplicateGroups.push(event.data as DuplicateGroup);
      }
    }
    // Sort by match score (highest first)
    return duplicateGroups.sort((a, b) => b.matchScore - a.matchScore);
  }

  private compareTransactions(
    t1: FireflyTransaction,
    t2: FireflyTransaction,
    options: Required<DuplicateFinderOptions>
  ): CompareResult {
    const reasons: string[] = [];
    let score = 0;
    let matchCount = 0;
    const requiredMatches = 3; // Need at least 3 matching criteria to be considered duplicate

    // Weights that add up to 100%:
    // - Date match: 20% (required)
    // - Amount match: 25% (required)
    // - Description match: 20%
    // - Source account: 15%
    // - Destination account: 15%
    // - External ID or Import hash: 5% bonus (capped at total 100%)

    const breakdown: DuplicateConfidenceBreakdown = {
      dateMatch: 0,
      amountMatch: 0,
      descriptionMatch: 0,
      sourceAccountMatch: 0,
      destinationAccountMatch: 0,
      externalIdMatch: 0,
      importHashMatch: 0,
    };

    // Get first transaction split from each (most transactions have just one)
    const split1 = t1.attributes.transactions[0];
    const split2 = t2.attributes.transactions[0];

    if (!split1 || !split2) {
      return { isDuplicate: false, score: 0, reasons: [], breakdown };
    }

    // Check if same type
    if (split1.type !== split2.type) {
      return { isDuplicate: false, score: 0, reasons: [], breakdown };
    }

    // Check date proximity (20%)
    const date1 = new Date(split1.date);
    const date2 = new Date(split2.date);
    const daysDiff = Math.abs((date1.getTime() - date2.getTime()) / (1000 * 60 * 60 * 24));

    if (daysDiff <= options.dateRange) {
      matchCount++;
      if (daysDiff === 0) {
        reasons.push('Same date');
        score += 0.2;
        breakdown.dateMatch = 0.2;
      } else {
        reasons.push(`Dates within ${Math.ceil(daysDiff)} day(s)`);
        score += 0.15;
        breakdown.dateMatch = 0.15;
      }
    } else {
      return { isDuplicate: false, score: 0, reasons: [], breakdown };
    }

    // Check exact amount match (25% - required)
    const amount1 = parseFloat(split1.amount);
    const amount2 = parseFloat(split2.amount);

    if (amount1 === amount2) {
      matchCount++;
      score += 0.25;
      breakdown.amountMatch = 0.25;
      reasons.push('Exact same amount');
    } else {
      return { isDuplicate: false, score: 0, reasons: [], breakdown };
    }

    // Check description similarity (20%)
    if (options.includeDescriptionMatch) {
      const descSimilarity = this.calculateStringSimilarity(split1.description, split2.description);
      if (descSimilarity > 0.8) {
        matchCount++;
        const descScore = descSimilarity * 0.2;
        score += descScore;
        breakdown.descriptionMatch = descScore;
        if (descSimilarity === 1) {
          reasons.push('Identical description');
        } else {
          reasons.push('Similar description');
        }
      }
    }

    // Check source account (15%)
    if (options.includeSourceMatch && split1.source_id === split2.source_id) {
      matchCount++;
      score += 0.15;
      breakdown.sourceAccountMatch = 0.15;
      reasons.push('Same source account');
    }

    // Check destination account (15%)
    if (options.includeDestinationMatch && split1.destination_id === split2.destination_id) {
      matchCount++;
      score += 0.15;
      breakdown.destinationAccountMatch = 0.15;
      reasons.push('Same destination account');
    }

    // Check currency (counts toward match count but no score - it's expected)
    if (split1.currency_code === split2.currency_code) {
      matchCount++;
    }

    // Check external ID if present (5% bonus)
    if (split1.external_id && split2.external_id && split1.external_id === split2.external_id) {
      matchCount += 2;
      score += 0.05;
      breakdown.externalIdMatch = 0.05;
      reasons.push('Same external ID');
    }

    // Check import hash if present (5% bonus, but cap total at 100%)
    if (
      split1.import_hash_v2 &&
      split2.import_hash_v2 &&
      split1.import_hash_v2 === split2.import_hash_v2
    ) {
      matchCount += 2;
      const hashScore = Math.min(0.05, 1 - score); // Don't exceed 100%
      score += hashScore;
      breakdown.importHashMatch = hashScore;
      reasons.push('Same import hash');
    }

    const isDuplicate = matchCount >= requiredMatches;
    return { isDuplicate, score: Math.min(score, 1), reasons, breakdown };
  }

  private calculateStringSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1;
    if (!str1 || !str2) return 0;

    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();

    if (s1 === s2) return 1;

    // Levenshtein distance based similarity
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;

    if (longer.length === 0) return 1;

    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  private levenshteinDistance(s1: string, s2: string): number {
    const costs: number[] = [];

    for (let i = 0; i <= s1.length; i++) {
      let lastValue = i;
      for (let j = 0; j <= s2.length; j++) {
        if (i === 0) {
          costs[j] = j;
        } else if (j > 0) {
          let newValue = costs[j - 1];
          if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          }
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
      if (i > 0) {
        costs[s2.length] = lastValue;
      }
    }

    return costs[s2.length];
  }

  async deleteTransaction(transactionId: string): Promise<void> {
    await this.fireflyApi.deleteTransaction(transactionId);
  }
}
