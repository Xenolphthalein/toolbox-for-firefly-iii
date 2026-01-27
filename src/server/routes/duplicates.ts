import { Router, Request, Response } from 'express';
import { getFireflyApi } from '../clients/firefly.js';
import { DuplicateTransactionFinder } from '../services/duplicateFinder.js';
import { isFireflyConfigured } from '../config/index.js';
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

const logger = createLogger('Duplicates');
import {
  validateBody,
  duplicateFindSchema,
  bulkDeleteSchema,
  countTransactionsSchema,
  type DuplicateFindBody,
  type BulkDeleteBody,
  type CountTransactionsBody,
} from '../utils/index.js';
import type { DuplicateGroup } from '../../shared/types/app.js';

const router = Router();

// Middleware to check Firefly III configuration
router.use((_req: Request, _res: Response, next) => {
  if (!isFireflyConfigured()) {
    throw badRequest(
      'Firefly III is not configured. Please set FIREFLY_API_URL and FIREFLY_API_TOKEN.'
    );
  }
  next();
});

// Stream duplicate finding (SSE)
router.post(
  '/stream-find',
  validateBody(duplicateFindSchema),
  async (req: Request, res: Response) => {
    const { startDate, endDate, options } = req.body as DuplicateFindBody;
    const sessionId = getSessionId(req);
    const cacheKey = getCacheKey(startDate, endDate);

    logger.debug(`Stream find duplicates started`, { startDate, endDate, options });

    const sse = setupSSE(res, req);

    const fireflyApi = getFireflyApi();
    const finder = new DuplicateTransactionFinder(fireflyApi);

    // Try to use cached transactions
    const cachedTransactions = getCachedTransactions(sessionId, cacheKey);
    if (cachedTransactions) {
      logger.debug(`Using ${cachedTransactions.length} cached transactions`);
    }

    try {
      for await (const event of finder.streamFindDuplicates(
        startDate,
        endDate,
        options,
        cachedTransactions || undefined
      )) {
        // Stop processing if client disconnected
        if (!sse.isConnected()) {
          logger.debug('Client disconnected during stream');
          break;
        }
        sse.send(event.type, event.data);
      }
      sse.end();
    } catch (error) {
      logger.error('Error streaming duplicate results', error);
      sse.error(error instanceof Error ? error : 'Unknown error');
    }
  }
);

// Find duplicate transactions
router.post(
  '/find',
  validateBody(duplicateFindSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { startDate, endDate, options } = req.body as DuplicateFindBody;

    logger.debug('Finding duplicates (non-streaming)', { startDate, endDate });

    const fireflyApi = getFireflyApi();
    const finder = new DuplicateTransactionFinder(fireflyApi);

    const duplicates = await finder.findDuplicates(startDate, endDate, options);

    logger.info(`Found ${duplicates.length} duplicate groups`);

    res.json({
      success: true,
      data: duplicates,
      message: `Found ${duplicates.length} potential duplicate groups`,
    } satisfies { success: true; data: DuplicateGroup[]; message: string });
  })
);

// Delete a transaction
// Rate limited to prevent accidental mass deletion
router.delete(
  '/transaction/:id',
  bulkOperationRateLimit,
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;

    logger.info(`Deleting duplicate transaction ${id}`);

    const fireflyApi = getFireflyApi();
    const finder = new DuplicateTransactionFinder(fireflyApi);

    await finder.deleteTransaction(id);

    res.json({
      success: true,
      message: `Transaction ${id} deleted successfully`,
    });
  })
);

// Bulk delete transactions
// Rate limited to prevent accidental mass deletion
router.post(
  '/delete-bulk',
  bulkOperationRateLimit,
  validateBody(bulkDeleteSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { transactionIds } = req.body as BulkDeleteBody;

    const fireflyApi = getFireflyApi();
    const finder = new DuplicateTransactionFinder(fireflyApi);

    const results = {
      successful: [] as string[],
      failed: [] as { id: string; error: string }[],
    };

    for (const id of transactionIds) {
      try {
        await finder.deleteTransaction(id);
        results.successful.push(id);
      } catch (error) {
        results.failed.push({
          id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    res.json({
      success: true,
      data: results,
      message: `Deleted ${results.successful.length} transactions, ${results.failed.length} failed`,
    });
  })
);

// Count transactions for wizard step 1
router.post(
  '/count-transactions',
  validateBody(countTransactionsSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { startDate, endDate, limit, offset } = req.body as CountTransactionsBody;
    const sessionId = getSessionId(req);
    const cacheKey = getCacheKey(startDate, endDate);

    const fireflyApi = getFireflyApi();

    // Check cache first, fetch only if not cached
    let transactions = getCachedTransactions(sessionId, cacheKey);
    if (!transactions) {
      transactions = await fireflyApi.getAllTransactions(startDate, endDate);
      // Cache for later use in stream-find
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
