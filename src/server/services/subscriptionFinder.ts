import { v4 as uuidv4 } from 'uuid';
import { FireflyApiClient } from '../clients/firefly.js';
import { createLogger } from '../utils/logger.js';
import type {
  FireflyTransaction,
  FireflyTransactionSplit,
  FireflySubscription,
  FireflyRule,
  FireflyRuleGroup,
} from '../../shared/types/firefly.js';
import type {
  SubscriptionPattern,
  SubscriptionFinderOptions,
  SubscriptionConfidenceBreakdown,
  CreateSubscriptionRequest,
} from '../../shared/types/app.js';

const logger = createLogger('SubscriptionService');

export interface StreamEvent<T = unknown> {
  type: 'progress' | 'result' | 'error' | 'complete';
  data: T;
}

interface TransactionGroup {
  description: string;
  sourceId: string;
  sourceName: string;
  destinationId: string;
  destinationName: string;
  type: string;
  transactions: Array<{
    transaction: FireflyTransaction;
    split: FireflyTransactionSplit;
  }>;
}

// Common payment service accounts that mix regular and subscription transactions
const PAYMENT_SERVICE_PATTERNS = [
  'paypal',
  'klarna',
  'stripe',
  'square',
  'venmo',
  'apple pay',
  'google pay',
  'afterpay',
  'affirm',
  'zip pay',
  'clearpay',
];

/**
 * Calculate similarity between two strings using Levenshtein distance
 * Returns a value between 0 (completely different) and 1 (identical)
 */
function stringSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();

  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  // Use longer string as base for comparison
  const maxLen = Math.max(s1.length, s2.length);
  const distance = levenshteinDistance(s1, s2);

  return 1 - distance / maxLen;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;

  // Create distance matrix
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  // Initialize first column and row
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  // Fill the matrix
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1, // deletion
        dp[i][j - 1] + 1, // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return dp[m][n];
}

/**
 * Extract key terms from a description for fuzzy matching
 * Removes numbers, dates, and common transaction noise
 */
function extractDescriptionTerms(description: string): string {
  return (
    description
      .toLowerCase()
      // Remove dates in various formats
      .replace(/\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}/g, '')
      // Remove standalone numbers (but keep numbers in words)
      .replace(/\b\d+([.,]\d+)?\b/g, '')
      // Remove common transaction reference patterns
      .replace(/\b(ref|nr|no|id|#)[:.]?\s*\w+/gi, '')
      // Remove extra whitespace
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Check if an account name matches a known payment service
 */
function isPaymentServiceAccount(accountName: string): boolean {
  const normalized = accountName.toLowerCase();
  return PAYMENT_SERVICE_PATTERNS.some((pattern) => normalized.includes(pattern));
}

/**
 * SubscriptionFinder - Finds patterns in transactions to suggest Firefly subscriptions
 *
 * Subscriptions (formerly "bills") in Firefly III track expected recurring expenses.
 * This tool analyzes transaction history to identify potential subscriptions.
 */
export class SubscriptionFinder {
  private fireflyApi: FireflyApiClient;
  private defaultOptions: Required<SubscriptionFinderOptions> = {
    minOccurrences: 3,
    maxDateVariance: 5, // days - timing variance allowed
    amountTolerance: 0.5, // 50% - subscriptions can vary a lot (usage-based, price changes)
    descriptionSimilarity: 0.6, // 60% similarity threshold for fuzzy matching
    excludeLinkedToSubscriptions: true, // Hide transactions already linked to bills
  };

  constructor(fireflyApi: FireflyApiClient) {
    this.fireflyApi = fireflyApi;
  }

  /**
   * Get existing subscriptions from Firefly
   */
  async getExistingSubscriptions(): Promise<FireflySubscription[]> {
    return this.fireflyApi.getAllSubscriptions();
  }

  /**
   * Streaming version for finding subscription patterns with progress events
   */
  async *streamFindSubscriptionPatterns(
    startDate?: string,
    endDate?: string,
    options?: SubscriptionFinderOptions,
    cachedTransactions?: FireflyTransaction[]
  ): AsyncGenerator<StreamEvent> {
    const opts = { ...this.defaultOptions, ...options };

    let transactions: FireflyTransaction[];

    if (cachedTransactions) {
      // Use cached transactions
      logger.debug(`Using ${cachedTransactions.length} cached transactions`);
      transactions = cachedTransactions;
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
      yield {
        type: 'progress',
        data: { current: 0, total: 0, message: 'Fetching transactions...' },
      };

      // Fetch all transactions - subscriptions are typically withdrawals
      transactions = await this.fireflyApi.getAllTransactions(startDate, endDate, 'withdrawal');
    }

    // Filter out transactions already linked to subscriptions (bills)
    if (opts.excludeLinkedToSubscriptions) {
      const originalCount = transactions.length;
      transactions = transactions.filter((t) => {
        const split = t.attributes.transactions[0];
        if (!split) return false;
        // Exclude if linked to a bill (subscription)
        return !split.bill_id;
      });
      const filteredCount = originalCount - transactions.length;
      if (filteredCount > 0) {
        yield {
          type: 'progress',
          data: {
            current: 0,
            total: transactions.length,
            message: `Excluded ${filteredCount} transactions already linked to subscriptions...`,
          },
        };
      }
    }

    yield {
      type: 'progress',
      data: { current: 0, total: transactions.length, message: 'Grouping similar transactions...' },
    };

    // Group similar transactions
    const groups = this.groupSimilarTransactions(transactions, opts);
    const total = groups.length;
    logger.debug(`Grouped into ${total} transaction groups`);

    yield {
      type: 'progress',
      data: { current: 0, total, message: `Analyzing ${total} transaction groups...` },
    };

    // Analyze each group for subscription patterns
    let processedCount = 0;

    // Track emitted patterns to avoid duplicates
    const emittedPatternKeys = new Set<string>();

    for (const group of groups) {
      processedCount++;

      if (processedCount % 5 === 0 || processedCount === total) {
        yield {
          type: 'progress',
          data: {
            current: processedCount,
            total,
            message: `Analyzing pattern ${processedCount} of ${total}...`,
          },
        };
      }

      if (group.transactions.length < opts.minOccurrences) {
        continue;
      }

      // Skip this group if ANY transaction is already linked to a subscription
      if (opts.excludeLinkedToSubscriptions) {
        const hasLinkedTransaction = group.transactions.some(
          (t) => t.split.bill_id !== null && t.split.bill_id !== undefined
        );
        if (hasLinkedTransaction) {
          continue;
        }
      }

      const pattern = this.analyzePattern(group, opts);
      if (pattern) {
        // Create a key to identify duplicate patterns
        // Based on: source account, destination account, pattern type, and amount range
        const patternKey = `${pattern.sourceAccount}|${pattern.destinationAccount}|${pattern.pattern.type}|${Math.round(pattern.minAmount)}|${Math.round(pattern.maxAmount)}`;

        // Only emit if we haven't seen this pattern before
        if (!emittedPatternKeys.has(patternKey)) {
          emittedPatternKeys.add(patternKey);
          yield { type: 'result', data: pattern };
        }
      }
    }

    yield { type: 'complete', data: { total: processedCount } };
  }

  async findSubscriptionPatterns(
    startDate?: string,
    endDate?: string,
    options?: SubscriptionFinderOptions
  ): Promise<SubscriptionPattern[]> {
    const patterns: SubscriptionPattern[] = [];
    for await (const event of this.streamFindSubscriptionPatterns(startDate, endDate, options)) {
      if (event.type === 'result') {
        patterns.push(event.data as SubscriptionPattern);
      }
    }
    // Sort by confidence (highest first)
    return patterns.sort((a, b) => b.pattern.confidence - a.pattern.confidence);
  }

  private groupSimilarTransactions(
    transactions: FireflyTransaction[],
    options: Required<SubscriptionFinderOptions>
  ): TransactionGroup[] {
    const groups: Map<string, TransactionGroup> = new Map();

    for (const transaction of transactions) {
      const split = transaction.attributes.transactions[0];
      if (!split) continue;

      // Only consider withdrawals for subscriptions
      if (split.type !== 'withdrawal') continue;

      // Create a key based on similar characteristics
      const descNormalized = this.normalizeDescription(split.description);
      const key = `${split.source_id}|${split.destination_id}|${split.type}|${descNormalized}`;

      if (!groups.has(key)) {
        groups.set(key, {
          description: split.description,
          sourceId: split.source_id,
          sourceName: split.source_name,
          destinationId: split.destination_id,
          destinationName: split.destination_name,
          type: split.type,
          transactions: [],
        });
      }

      groups.get(key)!.transactions.push({ transaction, split });
    }

    // Use fuzzy description matching to group similar transactions
    const fuzzyGroups = this.groupByFuzzyDescription(transactions, options);

    // Merge fuzzy groups (they may find patterns that exact matching missed)
    for (const group of fuzzyGroups) {
      const key = `fuzzy|${group.sourceId}|${group.destinationId}|${extractDescriptionTerms(group.description)}`;
      if (!groups.has(key) && group.transactions.length >= options.minOccurrences) {
        groups.set(key, group);
      }
    }

    // For payment services (PayPal, Klarna, etc.), also group by interval patterns
    // since they mix regular transactions with subscriptions
    const intervalGroups = this.groupByIntervalPattern(transactions, options);

    for (const group of intervalGroups) {
      const key = `interval|${group.sourceId}|${group.destinationId}|${extractDescriptionTerms(group.description)}`;
      if (!groups.has(key) && group.transactions.length >= options.minOccurrences) {
        groups.set(key, group);
      }
    }

    return Array.from(groups.values());
  }

  /**
   * Group transactions by fuzzy description matching
   * This helps find subscriptions even when descriptions vary slightly
   */
  private groupByFuzzyDescription(
    transactions: FireflyTransaction[],
    options: Required<SubscriptionFinderOptions>
  ): TransactionGroup[] {
    const groups: TransactionGroup[] = [];
    const processed = new Set<string>();

    for (const transaction of transactions) {
      const split = transaction.attributes.transactions[0];
      if (!split || split.type !== 'withdrawal') continue;

      const txId = transaction.id;
      if (processed.has(txId)) continue;

      // Extract key terms from description for comparison
      const terms = extractDescriptionTerms(split.description);
      if (!terms) continue;

      // Find all transactions with similar descriptions to the same destination
      const similar: Array<{ transaction: FireflyTransaction; split: FireflyTransactionSplit }> =
        [];

      for (const otherTx of transactions) {
        const otherSplit = otherTx.attributes.transactions[0];
        if (!otherSplit || otherSplit.type !== 'withdrawal') continue;
        if (processed.has(otherTx.id)) continue;

        // Must be same destination account
        if (otherSplit.destination_id !== split.destination_id) continue;

        // Check description similarity
        const otherTerms = extractDescriptionTerms(otherSplit.description);
        const similarity = stringSimilarity(terms, otherTerms);

        if (similarity >= options.descriptionSimilarity) {
          similar.push({ transaction: otherTx, split: otherSplit });
        }
      }

      // Only create a group if we have enough similar transactions
      if (similar.length >= options.minOccurrences) {
        // Mark all as processed
        for (const s of similar) {
          processed.add(s.transaction.id);
        }

        groups.push({
          description: split.description,
          sourceId: split.source_id,
          sourceName: split.source_name,
          destinationId: split.destination_id,
          destinationName: split.destination_name,
          type: split.type,
          transactions: similar,
        });
      }
    }

    return groups;
  }

  /**
   * Group transactions by interval patterns (especially useful for payment services)
   * Finds transactions that occur at regular intervals regardless of description/amount
   */
  private groupByIntervalPattern(
    transactions: FireflyTransaction[],
    options: Required<SubscriptionFinderOptions>
  ): TransactionGroup[] {
    const groups: TransactionGroup[] = [];

    // Group by destination first
    const byDestination = new Map<
      string,
      Array<{ transaction: FireflyTransaction; split: FireflyTransactionSplit }>
    >();

    for (const transaction of transactions) {
      const split = transaction.attributes.transactions[0];
      if (!split || split.type !== 'withdrawal') continue;

      const destKey = split.destination_id;
      if (!byDestination.has(destKey)) {
        byDestination.set(destKey, []);
      }
      byDestination.get(destKey)!.push({ transaction, split });
    }

    // For each destination, look for interval patterns among transactions with similar descriptions
    for (const destTransactions of byDestination.values()) {
      if (destTransactions.length < options.minOccurrences) continue;

      // Check if this is a payment service account
      const isPaymentService = isPaymentServiceAccount(destTransactions[0].split.destination_name);

      // Sub-group by similar description terms
      const descGroups = new Map<
        string,
        Array<{ transaction: FireflyTransaction; split: FireflyTransactionSplit }>
      >();

      for (const tx of destTransactions) {
        const terms = extractDescriptionTerms(tx.split.description);

        // Find an existing group with similar terms
        let foundGroup = false;
        for (const [groupTerms, groupTxs] of descGroups) {
          const similarity = stringSimilarity(terms, groupTerms);
          // For payment services, require higher similarity since there's more noise
          const threshold = isPaymentService
            ? Math.max(options.descriptionSimilarity, 0.7)
            : options.descriptionSimilarity;

          if (similarity >= threshold) {
            groupTxs.push(tx);
            foundGroup = true;
            break;
          }
        }

        if (!foundGroup) {
          descGroups.set(terms, [tx]);
        }
      }

      // Check each description group for interval patterns
      for (const txs of descGroups.values()) {
        if (txs.length < options.minOccurrences) continue;

        // Sort by date
        txs.sort((a, b) => new Date(a.split.date).getTime() - new Date(b.split.date).getTime());

        // Calculate intervals
        const intervals: number[] = [];
        for (let i = 1; i < txs.length; i++) {
          const date1 = new Date(txs[i - 1].split.date);
          const date2 = new Date(txs[i].split.date);
          const daysDiff = Math.round((date2.getTime() - date1.getTime()) / (1000 * 60 * 60 * 24));
          intervals.push(daysDiff);
        }

        // Check if intervals are consistent
        if (intervals.length > 0) {
          const avgInterval = intervals.reduce((s, i) => s + i, 0) / intervals.length;
          const variance = this.calculateVariance(intervals);

          // Allow more variance for longer intervals (yearly subscriptions may vary by a week)
          const allowedVariance = options.maxDateVariance * (1 + avgInterval / 30);

          if (variance <= allowedVariance) {
            groups.push({
              description: txs[0].split.description,
              sourceId: txs[0].split.source_id,
              sourceName: txs[0].split.source_name,
              destinationId: txs[0].split.destination_id,
              destinationName: txs[0].split.destination_name,
              type: txs[0].split.type,
              transactions: txs,
            });
          }
        }
      }
    }

    return groups;
  }

  private normalizeDescription(description: string): string {
    return description
      .toLowerCase()
      .replace(/[0-9]+/g, '#') // Replace numbers with placeholder
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  private analyzePattern(
    group: TransactionGroup,
    options: Required<SubscriptionFinderOptions>
  ): SubscriptionPattern | null {
    const { transactions } = group;

    // Sort by date
    transactions.sort(
      (a, b) => new Date(a.split.date).getTime() - new Date(b.split.date).getTime()
    );

    // Calculate intervals between transactions
    const intervals: number[] = [];
    for (let i = 1; i < transactions.length; i++) {
      const date1 = new Date(transactions[i - 1].split.date);
      const date2 = new Date(transactions[i].split.date);
      const daysDiff = Math.round((date2.getTime() - date1.getTime()) / (1000 * 60 * 60 * 24));
      intervals.push(daysDiff);
    }

    if (intervals.length === 0) {
      return null;
    }

    // Determine pattern type (Firefly subscription frequencies)
    const patternResult = this.detectPatternType(intervals, options.maxDateVariance);
    if (!patternResult) {
      return null;
    }

    // Calculate amount statistics (for min/max)
    const amounts = transactions.map((t) => parseFloat(t.split.amount));
    const minAmount = Math.min(...amounts);
    const maxAmount = Math.max(...amounts);
    const averageAmount = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;

    // Calculate interval consistency score (primary factor)
    const intervalVariance = this.calculateVariance(intervals);
    const avgInterval = intervals.reduce((s, i) => s + i, 0) / intervals.length;
    // Normalize variance relative to the interval length
    const normalizedIntervalVariance = intervalVariance / Math.max(avgInterval, 1);
    // Score: 1.0 for perfect consistency, lower for more variance
    const intervalScore = Math.max(0, 1 - normalizedIntervalVariance / options.maxDateVariance);

    // Calculate description similarity score
    const descriptions = transactions.map((t) => extractDescriptionTerms(t.split.description));
    const baseDesc = descriptions[0];
    const similarities = descriptions.slice(1).map((d) => stringSimilarity(baseDesc, d));
    const avgSimilarity =
      similarities.length > 0 ? similarities.reduce((s, v) => s + v, 0) / similarities.length : 1;

    // Check if this is a payment service (requires more evidence)
    const isPaymentService = isPaymentServiceAccount(group.destinationName);

    // Amount variance - less important but still a factor
    const amountVariance = this.calculateVariancePercentage(amounts);
    // Only slightly penalize high amount variance (subscriptions CAN vary a lot)
    const amountPenalty = amountVariance > options.amountTolerance * 100 ? 0.1 : 0;

    // Combine scores with weights:
    // - Interval consistency: 50% (most important)
    // - Description similarity: 30%
    // - Number of occurrences: 15%
    // - Amount consistency: 5% (least important)
    // - Payment service penalty: -10% if applicable
    const occurrenceScore = Math.min(1, transactions.length / 6); // Max score at 6+ transactions
    const paymentServicePenalty = isPaymentService ? -0.1 : 0;

    // Build confidence breakdown with weighted scores
    const confidenceBreakdown: SubscriptionConfidenceBreakdown = {
      intervalConsistency: intervalScore * 0.5,
      descriptionSimilarity: avgSimilarity * 0.3,
      occurrenceCount: occurrenceScore * 0.15,
      amountConsistency: (1 - amountPenalty) * 0.05,
      paymentServicePenalty,
    };

    // Calculate confidence as direct sum of all breakdown components
    const confidence =
      confidenceBreakdown.intervalConsistency +
      confidenceBreakdown.descriptionSimilarity +
      confidenceBreakdown.occurrenceCount +
      confidenceBreakdown.amountConsistency +
      confidenceBreakdown.paymentServicePenalty;

    // Build reasons
    const reasons: string[] = [];
    reasons.push(`Found ${transactions.length} similar transactions`);
    reasons.push(`Pattern: ${this.formatPatternType(patternResult.type, patternResult.interval)}`);
    reasons.push(`Interval consistency: ${(intervalScore * 100).toFixed(0)}%`);
    if (avgSimilarity < 1) {
      reasons.push(`Description similarity: ${(avgSimilarity * 100).toFixed(0)}%`);
    }
    reasons.push(`Amount range: ${minAmount.toFixed(2)} - ${maxAmount.toFixed(2)}`);
    if (amountVariance > 10) {
      reasons.push(`Amount variance: ${amountVariance.toFixed(1)}% (variable pricing)`);
    }
    reasons.push(`Destination: ${group.destinationName}`);
    if (isPaymentService) {
      reasons.push(`Payment service account (10% penalty applied)`);
    }

    return {
      id: uuidv4(),
      transactions: transactions.map((t) => t.transaction),
      pattern: {
        type: patternResult.type,
        interval: patternResult.interval,
        dayOfWeek: patternResult.dayOfWeek,
        dayOfMonth: patternResult.dayOfMonth,
        confidence: Math.max(0.1, Math.min(1, confidence)), // Clamp between 0.1 and 1
      },
      minAmount,
      maxAmount,
      averageAmount,
      description: group.description,
      sourceAccount: group.sourceName,
      destinationAccount: group.destinationName,
      reasons,
      confidenceBreakdown,
    };
  }

  private formatPatternType(type: string, interval: number): string {
    // interval 0 = every occurrence, 1 = every other (skip one), etc.
    switch (type) {
      case 'weekly':
        return interval === 0
          ? 'Weekly'
          : interval === 1
            ? 'Every other week'
            : `Every ${interval + 1} weeks`;
      case 'monthly':
        return interval === 0 ? 'Monthly' : `Every ${interval + 1} months`;
      case 'quarterly':
        return 'Quarterly';
      case 'half-year':
        return 'Every 6 months';
      case 'yearly':
        return 'Yearly';
      default:
        return type;
    }
  }

  private detectPatternType(
    intervals: number[],
    maxVariance: number
  ): {
    type: 'weekly' | 'monthly' | 'quarterly' | 'half-year' | 'yearly';
    interval: number;
    confidence: number;
    dayOfWeek?: number;
    dayOfMonth?: number;
  } | null {
    const avgInterval = intervals.reduce((sum, i) => sum + i, 0) / intervals.length;
    const variance = this.calculateVariance(intervals);

    // Check for weekly pattern (7 days ± variance)
    if (avgInterval >= 7 - maxVariance && avgInterval <= 7 + maxVariance) {
      if (variance <= maxVariance) {
        return {
          type: 'weekly',
          interval: 0, // skip = 0 means every week
          confidence: Math.max(0.6, 1 - variance / maxVariance),
          dayOfWeek: this.getMostCommonDayOfWeek(intervals),
        };
      }
    }

    // Check for bi-weekly pattern (every other week)
    if (avgInterval >= 14 - maxVariance && avgInterval <= 14 + maxVariance) {
      if (variance <= maxVariance * 1.5) {
        return {
          type: 'weekly',
          interval: 1, // skip = 1 means every other week
          confidence: Math.max(0.55, 1 - variance / (maxVariance * 1.5)),
        };
      }
    }

    // Check for monthly pattern (28-31 days)
    if (avgInterval >= 28 - maxVariance && avgInterval <= 31 + maxVariance) {
      if (variance <= maxVariance * 2) {
        return {
          type: 'monthly',
          interval: 0,
          confidence: Math.max(0.6, 1 - variance / (maxVariance * 2)),
          dayOfMonth: this.getMostCommonDayOfMonth(intervals),
        };
      }
    }

    // Check for bi-monthly pattern (skip = 1)
    if (avgInterval >= 56 - maxVariance * 2 && avgInterval <= 62 + maxVariance * 2) {
      return {
        type: 'monthly',
        interval: 1, // skip = 1 means every other month
        confidence: 0.5,
      };
    }

    // Check for quarterly pattern (85-95 days)
    if (avgInterval >= 85 - maxVariance * 3 && avgInterval <= 95 + maxVariance * 3) {
      return {
        type: 'quarterly',
        interval: 0,
        confidence: 0.5,
      };
    }

    // Check for half-year pattern (180 days)
    if (avgInterval >= 175 - maxVariance * 4 && avgInterval <= 190 + maxVariance * 4) {
      return {
        type: 'half-year',
        interval: 0,
        confidence: 0.5,
      };
    }

    // Check for yearly pattern (360-370 days)
    if (avgInterval >= 360 - maxVariance * 5 && avgInterval <= 370 + maxVariance * 5) {
      return {
        type: 'yearly',
        interval: 0,
        confidence: 0.5,
      };
    }

    return null;
  }

  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;
    const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
    const squaredDiffs = values.map((v) => Math.pow(v - avg, 2));
    return Math.sqrt(squaredDiffs.reduce((sum, d) => sum + d, 0) / values.length);
  }

  private calculateVariancePercentage(values: number[]): number {
    if (values.length === 0) return 0;
    const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
    if (avg === 0) return 0;
    const variance = this.calculateVariance(values);
    return (variance / avg) * 100;
  }

  private getMostCommonDayOfWeek(_intervals: number[]): number {
    // This would need actual dates to calculate properly
    // For now, return 0 (Sunday) as placeholder
    return 0;
  }

  private getMostCommonDayOfMonth(_intervals: number[]): number {
    // This would need actual dates to calculate properly
    // For now, return 1 as placeholder
    return 1;
  }

  /**
   * Get or create a rule group for subscription rules
   */
  private async getOrCreateSubscriptionRuleGroup(): Promise<FireflyRuleGroup> {
    const RULE_GROUP_TITLE = 'Subscription Rules (Auto-generated)';

    // Check if the rule group already exists
    const existingGroups = await this.fireflyApi.getAllRuleGroups();
    const existingGroup = existingGroups.find((g) => g.attributes.title === RULE_GROUP_TITLE);

    if (existingGroup) {
      return existingGroup;
    }

    // Create a new rule group for subscription rules
    return this.fireflyApi.createRuleGroup({
      title: RULE_GROUP_TITLE,
      description: 'Auto-generated rules for subscriptions created by Toolbox for Firefly III',
      active: true,
    });
  }

  /**
   * Create a rule for matching transactions to a subscription
   */
  private async createSubscriptionRule(
    subscriptionName: string,
    destinationAccountName: string,
    amountMin: string,
    amountMax: string
  ): Promise<FireflyRule> {
    const ruleGroup = await this.getOrCreateSubscriptionRuleGroup();

    // Build triggers: amount range + destination account
    const triggers: Array<{ type: string; value: string; active?: boolean }> = [];

    // Add amount triggers
    const minAmount = parseFloat(amountMin);
    const maxAmount = parseFloat(amountMax);

    if (minAmount === maxAmount) {
      // Exact amount match
      triggers.push({
        type: 'amount_is',
        value: minAmount.toString(),
        active: true,
      });
    } else {
      // Amount range
      triggers.push({
        type: 'amount_more',
        value: minAmount.toString(),
        active: true,
      });
      triggers.push({
        type: 'amount_less',
        value: maxAmount.toString(),
        active: true,
      });
    }

    // Add destination account trigger
    triggers.push({
      type: 'destination_account_is',
      value: destinationAccountName,
      active: true,
    });

    // Create the rule
    return this.fireflyApi.createRule({
      title: `Auto-link: ${subscriptionName}`,
      description: `Auto-generated rule to link transactions to subscription "${subscriptionName}"`,
      rule_group_id: ruleGroup.id,
      trigger: 'store-journal',
      active: true,
      strict: true, // All triggers must match
      stop_processing: false,
      triggers,
      actions: [
        {
          type: 'link_to_bill',
          value: subscriptionName,
          active: true,
        },
      ],
    });
  }

  /**
   * Create a subscription in Firefly III, optionally with a matching rule
   */
  async createSubscription(
    request: CreateSubscriptionRequest
  ): Promise<{ subscription: FireflySubscription; rule?: FireflyRule }> {
    // Create the subscription
    const subscription = await this.fireflyApi.createSubscription({
      name: request.name,
      amount_min: request.amountMin,
      amount_max: request.amountMax,
      date: request.date,
      repeat_freq: request.repeatFreq,
      skip: request.skip ?? 0,
      currency_code: request.currencyCode,
      currency_id: request.currencyId,
      end_date: request.endDate,
      extension_date: request.extensionDate,
      notes: request.notes,
      active: request.active ?? true,
    });

    // Create a rule if requested and destination account is provided
    let rule: FireflyRule | undefined;
    if (request.createRule !== false && request.destinationAccountName) {
      try {
        rule = await this.createSubscriptionRule(
          request.name,
          request.destinationAccountName,
          request.amountMin,
          request.amountMax
        );
      } catch (error) {
        // Log but don't fail - subscription was created successfully
        logger.error('Failed to create rule for subscription', error);
      }
    }

    return { subscription, rule };
  }
}

// Legacy alias for backwards compatibility
export { SubscriptionFinder as RecurringTransactionFinder };
