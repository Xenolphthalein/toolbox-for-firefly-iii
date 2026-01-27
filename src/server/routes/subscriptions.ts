import { Router, Request, Response } from 'express';
import { getFireflyApi } from '../clients/firefly.js';
import { SubscriptionFinder } from '../services/subscriptionFinder.js';
import { isFireflyConfigured } from '../config/index.js';
import { getSessionId, asyncHandler, badRequest, setupSSE } from '../middleware/index.js';
import { createLogger } from '../utils/logger.js';
import {
  getCacheKey,
  getCachedTransactions,
  setCachedTransactions,
} from '../services/transactionCache.js';

const logger = createLogger('Subscriptions');
import {
  validateBody,
  subscriptionFindSchema,
  createSubscriptionSchema,
  countTransactionsSchema,
  type SubscriptionFindBody,
  type CreateSubscriptionBody,
  type CountTransactionsBody,
} from '../utils/index.js';
import type { SubscriptionPattern } from '../../shared/types/app.js';
import type { FireflySubscription } from '../../shared/types/firefly.js';

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

// Stream subscription pattern finding (SSE)
router.post(
  '/stream-find',
  validateBody(subscriptionFindSchema),
  async (req: Request, res: Response) => {
    const { startDate, endDate, options } = req.body as SubscriptionFindBody;
    const sessionId = getSessionId(req);
    const cacheKey = getCacheKey(startDate, endDate);

    logger.debug(`Stream find subscriptions started`, { startDate, endDate, options });

    const sse = setupSSE(res, req);

    const fireflyApi = getFireflyApi();
    const finder = new SubscriptionFinder(fireflyApi);

    // Try to use cached transactions
    const cachedTransactions = getCachedTransactions(sessionId, cacheKey);
    if (cachedTransactions) {
      logger.debug(`Using ${cachedTransactions.length} cached transactions`);
    }

    try {
      for await (const event of finder.streamFindSubscriptionPatterns(
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
      logger.error('Error streaming subscription results', error);
      sse.error(error instanceof Error ? error : 'Unknown error');
    }
  }
);

// Find subscription patterns
router.post(
  '/find',
  validateBody(subscriptionFindSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { startDate, endDate, options } = req.body as SubscriptionFindBody;

    logger.debug('Finding subscription patterns (non-streaming)', { startDate, endDate });

    const fireflyApi = getFireflyApi();
    const finder = new SubscriptionFinder(fireflyApi);

    const patterns = await finder.findSubscriptionPatterns(startDate, endDate, options);

    logger.info(`Found ${patterns.length} potential subscription patterns`);

    res.json({
      success: true,
      data: patterns,
      message: `Found ${patterns.length} potential subscription patterns`,
    } satisfies { success: true; data: SubscriptionPattern[]; message: string });
  })
);

// Create a subscription from a pattern
router.post(
  '/create',
  validateBody(createSubscriptionSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const request = req.body as CreateSubscriptionBody;

    logger.info(`Creating subscription from pattern: ${request.name}`);

    const fireflyApi = getFireflyApi();
    const finder = new SubscriptionFinder(fireflyApi);

    const result = await finder.createSubscription(request);

    logger.info('Subscription created successfully', { id: result.subscription.id });

    res.json({
      success: true,
      data: {
        subscription: result.subscription,
        ruleCreated: !!result.rule,
      },
      message: result.rule
        ? `Subscription "${request.name}" and matching rule created successfully`
        : `Subscription "${request.name}" created successfully`,
    } satisfies {
      success: true;
      data: { subscription: FireflySubscription; ruleCreated: boolean };
      message: string;
    });
  })
);

// Get existing subscriptions from Firefly III
router.get(
  '/existing',
  asyncHandler(async (_req: Request, res: Response) => {
    const fireflyApi = getFireflyApi();
    const subscriptions = await fireflyApi.getAllSubscriptions();

    res.json({
      success: true,
      data: subscriptions,
    });
  })
);

// Count transactions for wizard step 1 (withdrawals only for subscriptions)
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
      // For subscriptions, we only care about withdrawals
      const fetched = await fireflyApi.getAllTransactions(startDate, endDate, 'withdrawal');
      // Cache for later use in stream-find
      setCachedTransactions(sessionId, cacheKey, fetched);
      transactions = fetched;
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
