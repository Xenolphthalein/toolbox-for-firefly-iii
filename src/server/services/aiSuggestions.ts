import { FireflyApiClient } from '../clients/firefly.js';
import { analyzeForCategory, analyzeForTags } from '../clients/ai.js';
import { createLogger } from '../utils/logger.js';
import type {
  FireflyTransaction,
  FireflyCategory,
  FireflyTag,
} from '../../shared/types/firefly.js';
import type {
  CategorySuggestion,
  TagSuggestion,
  AISuggestionOptions,
  TransactionUpdate,
  BulkUpdateResult,
} from '../../shared/types/app.js';

const logger = createLogger('AIService');

// Tag applied to transactions processed by the Tag Suggester
export const TAGGER_TAG = 'FFIII Toolbox: Suggested Tags';

export interface ProgressCallback {
  onProgress: (current: number, total: number) => void;
  onSuggestion: (suggestion: CategorySuggestion | TagSuggestion) => void;
  onError: (transactionId: string, error: string) => void;
  onComplete: () => void;
}

export class AISuggestionService {
  private fireflyApi: FireflyApiClient;
  private defaultOptions: Required<AISuggestionOptions> = {
    maxSuggestions: 50,
    minConfidence: 0.3,
  };

  constructor(fireflyApi: FireflyApiClient) {
    this.fireflyApi = fireflyApi;
  }

  async getUncategorizedTransactions(
    startDate?: string,
    endDate?: string
  ): Promise<FireflyTransaction[]> {
    const transactions = await this.fireflyApi.getAllTransactions(startDate, endDate);

    return transactions.filter((t) => {
      const split = t.attributes.transactions[0];
      return split && !split.category_id && !split.category_name;
    });
  }

  /**
   * Get transactions that haven't been processed by the tag suggester yet.
   * Filters out transactions that already have the TAGGER_TAG.
   */
  async getUnprocessedTransactionsForTags(
    startDate?: string,
    endDate?: string
  ): Promise<FireflyTransaction[]> {
    const transactions = await this.fireflyApi.getAllTransactions(startDate, endDate);

    return transactions.filter((t) => {
      const split = t.attributes.transactions[0];
      return split && !split.tags?.includes(TAGGER_TAG);
    });
  }

  // Streaming version for category suggestions
  async *streamCategorySuggestions(
    startDate?: string,
    endDate?: string,
    options?: AISuggestionOptions,
    cachedTransactions?: FireflyTransaction[]
  ): AsyncGenerator<{ type: 'progress' | 'suggestion' | 'error' | 'complete'; data: unknown }> {
    const opts = { ...this.defaultOptions, ...options };

    let uncategorized: FireflyTransaction[];

    if (cachedTransactions) {
      // Use cached transactions (already filtered)
      uncategorized = cachedTransactions;
      logger.debug(`Using ${uncategorized.length} cached uncategorized transactions`);
    } else {
      logger.debug('Fetching uncategorized transactions...');
      uncategorized = await this.getUncategorizedTransactions(startDate, endDate);
      logger.info(`Found ${uncategorized.length} uncategorized transactions`);
    }

    const toProcess = uncategorized.slice(0, opts.maxSuggestions);
    const total = toProcess.length;

    // Send initial progress
    yield { type: 'progress', data: { current: 0, total } };

    const categories = await this.fireflyApi.getAllCategories();
    const categoryNames = categories.map((c) => c.attributes.name);
    logger.debug(`Available categories: ${categoryNames.length}`);

    if (categoryNames.length === 0) {
      throw new Error('No categories found in FireflyIII. Please create some categories first.');
    }

    for (let i = 0; i < toProcess.length; i++) {
      const transaction = toProcess[i];
      const split = transaction.attributes.transactions[0];
      if (!split) continue;

      // Emit progress
      yield { type: 'progress', data: { current: i + 1, total } };

      logger.debug(`Analyzing: "${split.description.substring(0, 50)}..."`);

      try {
        const suggestion = await analyzeForCategory(
          split.description,
          split.amount,
          split.type,
          categoryNames
        );

        const category = categories.find((c) => c.attributes.name === suggestion.categoryName);

        // Check if AI returned "Uncategorized" or couldn't find a fitting category
        const isUncategorized =
          suggestion.categoryName.toLowerCase() === 'uncategorized' ||
          suggestion.categoryName.toLowerCase() === '(no category)';

        if (isUncategorized) {
          // Send suggestion with unableToClassify flag so frontend can show appropriate message
          const categorySuggestion: CategorySuggestion = {
            transactionId: transaction.id,
            transaction: split,
            suggestedCategoryId: '',
            suggestedCategoryName: '',
            confidence: suggestion.confidence,
            reasoning: suggestion.reasoning,
            unableToClassify: true,
          };
          logger.debug(
            `Unable to classify: "${split.description.substring(0, 30)}..."`
          );
          yield { type: 'suggestion', data: categorySuggestion };
        } else if (category) {
          const categorySuggestion: CategorySuggestion = {
            transactionId: transaction.id,
            transaction: split,
            suggestedCategoryId: category.id,
            suggestedCategoryName: suggestion.categoryName,
            confidence: suggestion.confidence,
            reasoning: suggestion.reasoning,
          };
          logger.debug(
            `Suggested: ${suggestion.categoryName} (${(suggestion.confidence * 100).toFixed(0)}%)`
          );
          yield { type: 'suggestion', data: categorySuggestion };
        } else {
          logger.debug(`Category not found in Firefly: ${suggestion.categoryName}`);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`Analysis error: ${errorMsg}`);
        yield { type: 'error', data: { transactionId: transaction.id, error: errorMsg } };
      }
    }

    yield { type: 'complete', data: null };
  }

  // Streaming version for tag suggestions
  async *streamTagSuggestions(
    startDate?: string,
    endDate?: string,
    options?: AISuggestionOptions,
    cachedTransactions?: FireflyTransaction[]
  ): AsyncGenerator<{ type: 'progress' | 'suggestion' | 'error' | 'complete'; data: unknown }> {
    const opts = { ...this.defaultOptions, ...options };

    let unprocessed: FireflyTransaction[];

    if (cachedTransactions) {
      // Use cached transactions (already filtered)
      unprocessed = cachedTransactions;
      logger.debug(`Using ${unprocessed.length} cached unprocessed transactions for tags`);
    } else {
      logger.debug('Fetching unprocessed transactions for tags...');
      unprocessed = await this.getUnprocessedTransactionsForTags(startDate, endDate);
      logger.info(`Found ${unprocessed.length} transactions not yet processed for tags`);
    }

    const toProcess = unprocessed.slice(0, opts.maxSuggestions);
    const total = toProcess.length;

    yield { type: 'progress', data: { current: 0, total } };

    const tags = await this.fireflyApi.getAllTags();
    const tagNames = tags.map((t) => t.attributes.tag);
    logger.debug(`Available tags: ${tagNames.length}`);

    if (tagNames.length === 0) {
      throw new Error('No tags found in FireflyIII. Please create some tags first.');
    }

    for (let i = 0; i < toProcess.length; i++) {
      const transaction = toProcess[i];
      const split = transaction.attributes.transactions[0];
      if (!split) continue;

      yield { type: 'progress', data: { current: i + 1, total } };

      logger.debug(`Analyzing for tags: "${split.description.substring(0, 50)}..."`);

      try {
        const suggestedTags = await analyzeForTags(
          split.description,
          split.amount,
          split.type,
          split.tags || [],
          tagNames
        );

        const validTags = suggestedTags
          .map((s) => {
            const tag = tags.find((t) => t.attributes.tag === s.tagName);
            return {
              tagId: tag?.id || '',
              tagName: s.tagName,
              confidence: s.confidence,
              reasoning: s.reasoning,
            };
          })
          .filter((s) => s.tagId);

        if (validTags.length > 0) {
          const tagSuggestion: TagSuggestion = {
            transactionId: transaction.id,
            transaction: split,
            suggestedTags: validTags,
          };
          logger.debug(`Suggested ${validTags.length} tags`);
          yield { type: 'suggestion', data: tagSuggestion };
        } else {
          logger.debug('No valid tags found in Firefly for AI suggestions');
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`Tag analysis error: ${errorMsg}`);
        yield { type: 'error', data: { transactionId: transaction.id, error: errorMsg } };
      }
    }

    yield { type: 'complete', data: null };
  }

  // Keep non-streaming versions for backward compatibility
  async suggestCategories(
    startDate?: string,
    endDate?: string,
    options?: AISuggestionOptions
  ): Promise<CategorySuggestion[]> {
    const suggestions: CategorySuggestion[] = [];
    for await (const event of this.streamCategorySuggestions(startDate, endDate, options)) {
      if (event.type === 'suggestion') {
        suggestions.push(event.data as CategorySuggestion);
      }
    }
    return suggestions.sort((a, b) => b.confidence - a.confidence);
  }

  async suggestTags(
    startDate?: string,
    endDate?: string,
    options?: AISuggestionOptions
  ): Promise<TagSuggestion[]> {
    const suggestions: TagSuggestion[] = [];
    for await (const event of this.streamTagSuggestions(startDate, endDate, options)) {
      if (event.type === 'suggestion') {
        suggestions.push(event.data as TagSuggestion);
      }
    }
    return suggestions;
  }

  async applyCategories(updates: TransactionUpdate[]): Promise<BulkUpdateResult> {
    const result: BulkUpdateResult = {
      successful: [],
      failed: [],
    };

    for (const update of updates) {
      try {
        await this.fireflyApi.updateTransaction(update.transactionId, update.journalId, {
          category_id: update.updates.category_id,
          category_name: update.updates.category_name,
        });
        result.successful.push(update.transactionId);
      } catch (error) {
        result.failed.push({
          transactionId: update.transactionId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return result;
  }

  async applyTags(updates: TransactionUpdate[]): Promise<BulkUpdateResult> {
    const result: BulkUpdateResult = {
      successful: [],
      failed: [],
    };

    for (const update of updates) {
      try {
        // Ensure the tagger tag is included to mark as processed
        const tagsWithMarker = update.updates.tags || [];
        if (!tagsWithMarker.includes(TAGGER_TAG)) {
          tagsWithMarker.push(TAGGER_TAG);
        }

        await this.fireflyApi.updateTransaction(update.transactionId, update.journalId, {
          tags: tagsWithMarker,
        });
        result.successful.push(update.transactionId);
      } catch (error) {
        result.failed.push({
          transactionId: update.transactionId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return result;
  }

  async getCategories(): Promise<FireflyCategory[]> {
    return this.fireflyApi.getAllCategories();
  }

  async getTags(): Promise<FireflyTag[]> {
    return this.fireflyApi.getAllTags();
  }
}
