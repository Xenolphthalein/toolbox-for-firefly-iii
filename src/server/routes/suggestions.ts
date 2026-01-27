import { Router, Request, Response } from 'express';
import { getFireflyApi } from '../clients/firefly.js';
import { AISuggestionService } from '../services/aiSuggestions.js';
import { isFireflyConfigured, isAIConfigured } from '../config/index.js';
import {
  getSessionId,
  asyncHandler,
  badRequest,
  setupSSE,
  bulkOperationRateLimit,
} from '../middleware/index.js';
import { createLogger } from '../utils/logger.js';
import {
  getCacheKey,
  getCachedTransactions,
  setCachedTransactions,
} from '../services/transactionCache.js';

const logger = createLogger('Suggestions');
import {
  validateBody,
  dateRangeSchema,
  suggestionRequestSchema,
  applySuggestionsSchema,
  countTransactionsSchema,
  type SuggestionRequestBody,
  type ApplySuggestionsBody,
  type DateRangeBody,
  type CountTransactionsBody,
} from '../utils/index.js';
import type { CategorySuggestion, TagSuggestion } from '../../shared/types/app.js';
import type { FireflyTransaction } from '../../shared/types/firefly.js';

const router = Router();

// Middleware to check configuration
router.use((_req: Request, _res: Response, next) => {
  if (!isFireflyConfigured()) {
    throw badRequest(
      'Firefly III is not configured. Please set FIREFLY_API_URL and FIREFLY_API_TOKEN.'
    );
  }
  next();
});

// Get uncategorized transactions
router.post(
  '/uncategorized',
  validateBody(dateRangeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { startDate, endDate } = req.body as DateRangeBody;

    logger.debug('Fetching uncategorized transactions', { startDate, endDate });

    const fireflyApi = getFireflyApi();
    const service = new AISuggestionService(fireflyApi);

    const transactions = await service.getUncategorizedTransactions(startDate, endDate);

    logger.debug(`Found ${transactions.length} uncategorized transactions`);

    res.json({
      success: true,
      data: transactions,
      message: `Found ${transactions.length} uncategorized transactions`,
    } satisfies { success: true; data: FireflyTransaction[]; message: string });
  })
);

// Get unprocessed transactions for tags
router.post(
  '/untagged',
  validateBody(dateRangeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { startDate, endDate } = req.body as DateRangeBody;

    logger.debug('Fetching unprocessed transactions for tags', { startDate, endDate });

    const fireflyApi = getFireflyApi();
    const service = new AISuggestionService(fireflyApi);

    const transactions = await service.getUnprocessedTransactionsForTags(startDate, endDate);

    logger.debug(`Found ${transactions.length} unprocessed transactions for tags`);

    res.json({
      success: true,
      data: transactions,
      message: `Found ${transactions.length} transactions not yet processed for tags`,
    } satisfies { success: true; data: FireflyTransaction[]; message: string });
  })
);

// Get category suggestions (requires AI - OpenAI or Ollama)
router.post(
  '/suggest-categories',
  validateBody(suggestionRequestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    if (!isAIConfigured()) {
      logger.warn('Suggestion request rejected: AI not configured');
      throw badRequest('AI is not configured. Please configure OpenAI or Ollama in settings.');
    }

    const { startDate, endDate, options } = req.body as SuggestionRequestBody;

    logger.info('Starting category suggestion generation', { startDate, endDate, options });

    const fireflyApi = getFireflyApi();
    const service = new AISuggestionService(fireflyApi);

    const suggestions = await service.suggestCategories(startDate, endDate, options);

    logger.info(`Generated ${suggestions.length} category suggestions`);

    res.json({
      success: true,
      data: suggestions,
      message: `Generated ${suggestions.length} category suggestions`,
    } satisfies { success: true; data: CategorySuggestion[]; message: string });
  })
);

// Stream category suggestions (SSE) - requires AI
router.post(
  '/stream-categories',
  validateBody(suggestionRequestSchema),
  async (req: Request, res: Response) => {
    if (!isAIConfigured()) {
      res.status(400).json({
        success: false,
        error: 'AI is not configured. Please configure OpenAI or Ollama in settings.',
      });
      return;
    }

    const { startDate, endDate, options } = req.body as SuggestionRequestBody;
    const sessionId = getSessionId(req);
    const cacheKey = getCacheKey(startDate, endDate, 'uncategorized');

    const sse = setupSSE(res, req);

    const fireflyApi = getFireflyApi();
    const service = new AISuggestionService(fireflyApi);

    // Try to use cached transactions
    const cachedTransactions = getCachedTransactions(sessionId, cacheKey);

    try {
      for await (const event of service.streamCategorySuggestions(
        startDate,
        endDate,
        options,
        cachedTransactions || undefined
      )) {
        // Stop processing if client disconnected
        if (!sse.isConnected()) break;
        sse.send(event.type, event.data);
      }
      sse.end();
    } catch (error) {
      sse.error(error instanceof Error ? error : 'Unknown error');
    }
  }
);

// Stream tag suggestions (SSE) - requires AI
router.post(
  '/stream-tags',
  validateBody(suggestionRequestSchema),
  async (req: Request, res: Response) => {
    if (!isAIConfigured()) {
      res.status(400).json({
        success: false,
        error: 'AI is not configured. Please configure OpenAI or Ollama in settings.',
      });
      return;
    }

    const { startDate, endDate, options } = req.body as SuggestionRequestBody;
    const sessionId = getSessionId(req);
    const cacheKey = getCacheKey(startDate, endDate, 'untagged');

    const sse = setupSSE(res, req);

    const fireflyApi = getFireflyApi();
    const service = new AISuggestionService(fireflyApi);

    // Try to use cached transactions
    const cachedTransactions = getCachedTransactions(sessionId, cacheKey);

    try {
      for await (const event of service.streamTagSuggestions(
        startDate,
        endDate,
        options,
        cachedTransactions || undefined
      )) {
        // Stop processing if client disconnected
        if (!sse.isConnected()) break;
        sse.send(event.type, event.data);
      }
      sse.end();
    } catch (error) {
      sse.error(error instanceof Error ? error : 'Unknown error');
    }
  }
);

// Get tag suggestions (requires AI - OpenAI or Ollama)
router.post(
  '/suggest-tags',
  validateBody(suggestionRequestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    if (!isAIConfigured()) {
      throw badRequest('AI is not configured. Please configure OpenAI or Ollama in settings.');
    }

    const { startDate, endDate, options } = req.body as SuggestionRequestBody;

    const fireflyApi = getFireflyApi();
    const service = new AISuggestionService(fireflyApi);

    const suggestions = await service.suggestTags(startDate, endDate, options);

    res.json({
      success: true,
      data: suggestions,
      message: `Generated suggestions for ${suggestions.length} transactions`,
    } satisfies { success: true; data: TagSuggestion[]; message: string });
  })
);

// Apply category suggestions
// Rate limited to prevent excessive API calls to Firefly III
router.post(
  '/apply-categories',
  bulkOperationRateLimit,
  validateBody(applySuggestionsSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { updates } = req.body as ApplySuggestionsBody;

    const fireflyApi = getFireflyApi();
    const service = new AISuggestionService(fireflyApi);

    const result = await service.applyCategories(updates);

    res.json({
      success: true,
      data: result,
      message: `Applied ${result.successful.length} categories, ${result.failed.length} failed`,
    });
  })
);

// Apply tag suggestions
// Rate limited to prevent excessive API calls to Firefly III
router.post(
  '/apply-tags',
  bulkOperationRateLimit,
  validateBody(applySuggestionsSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { updates } = req.body as ApplySuggestionsBody;

    const fireflyApi = getFireflyApi();
    const service = new AISuggestionService(fireflyApi);

    const result = await service.applyTags(updates);

    res.json({
      success: true,
      data: result,
      message: `Applied tags to ${result.successful.length} transactions, ${result.failed.length} failed`,
    });
  })
);

// Get all categories
router.get(
  '/categories',
  asyncHandler(async (_req: Request, res: Response) => {
    const fireflyApi = getFireflyApi();
    const service = new AISuggestionService(fireflyApi);

    const categories = await service.getCategories();

    res.json({
      success: true,
      data: categories,
    });
  })
);

// Get all tags
router.get(
  '/tags',
  asyncHandler(async (_req: Request, res: Response) => {
    const fireflyApi = getFireflyApi();
    const service = new AISuggestionService(fireflyApi);

    const tags = await service.getTags();

    res.json({
      success: true,
      data: tags,
    });
  })
);

// Count uncategorized transactions for wizard step 1
router.post(
  '/count-uncategorized',
  validateBody(countTransactionsSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { startDate, endDate, limit, offset } = req.body as CountTransactionsBody;
    const sessionId = getSessionId(req);
    const cacheKey = getCacheKey(startDate, endDate, 'uncategorized');

    const fireflyApi = getFireflyApi();
    const service = new AISuggestionService(fireflyApi);

    // Check cache first
    let transactions = getCachedTransactions(sessionId, cacheKey);
    if (!transactions) {
      transactions = await service.getUncategorizedTransactions(startDate, endDate);
      // Cache for later use in stream-categories
      setCachedTransactions(sessionId, cacheKey, transactions);
    }

    // Return count and optionally a preview of transactions with pagination
    const previewLimit = limit || 10;
    const previewOffset = offset || 0;
    const preview = transactions
      .slice(previewOffset, previewOffset + previewLimit)
      .map((t) => t.attributes.transactions[0]);

    res.json({
      success: true,
      data: { count: transactions.length, transactions: preview },
    });
  })
);

// Count unprocessed transactions for tags wizard step 1
router.post(
  '/count-untagged',
  validateBody(countTransactionsSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { startDate, endDate, limit, offset } = req.body as CountTransactionsBody;
    const sessionId = getSessionId(req);
    const cacheKey = getCacheKey(startDate, endDate, 'untagged');

    const fireflyApi = getFireflyApi();
    const service = new AISuggestionService(fireflyApi);

    // Check cache first
    let transactions = getCachedTransactions(sessionId, cacheKey);
    if (!transactions) {
      transactions = await service.getUnprocessedTransactionsForTags(startDate, endDate);
      // Cache for later use in stream-tags
      setCachedTransactions(sessionId, cacheKey, transactions);
    }

    // Return count and optionally a preview of transactions with pagination
    const previewLimit = limit || 10;
    const previewOffset = offset || 0;
    const preview = transactions
      .slice(previewOffset, previewOffset + previewLimit)
      .map((t) => t.attributes.transactions[0]);

    res.json({
      success: true,
      data: { count: transactions.length, transactions: preview },
    });
  })
);

export default router;
