import { Router, Request, Response } from 'express';
import multer from 'multer';
import { getFireflyApi } from '../clients/firefly.js';
import { AmazonOrderExtender, getAmazonExtenderStore } from '../services/index.js';
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
  validateBody,
  amazonMatchSchema,
  amazonApplySchema,
  dateRangeSchema,
  countTransactionsSchema,
  parseJsonAsync,
  validateJsonContent,
  type AmazonMatchBody,
  type AmazonApplyBody,
  type DateRangeBody,
  type CountTransactionsBody,
} from '../utils/index.js';
import type { AmazonMatchResult } from '../../shared/types/app.js';
import type { FireflyTransaction } from '../../shared/types/firefly.js';

const router = Router();
const logger = createLogger('Amazon');

// Configure multer for file uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/json' || file.originalname.endsWith('.json')) {
      cb(null, true);
    } else {
      cb(new Error('Only JSON files are allowed'));
    }
  },
});

// Use session store with TTL-based lifecycle management
const extenderStore = getAmazonExtenderStore<AmazonOrderExtender>();

function getExtender(sessionId: string): AmazonOrderExtender {
  let extender = extenderStore.get(sessionId);
  if (!extender) {
    const fireflyApi = getFireflyApi();
    extender = new AmazonOrderExtender(fireflyApi);
    extenderStore.set(sessionId, extender);
  }
  return extender;
}

// Middleware to check FireflyIII configuration
router.use((_req: Request, _res: Response, next) => {
  if (!isFireflyConfigured()) {
    throw badRequest(
      'FireflyIII is not configured. Please set FIREFLY_API_URL and FIREFLY_API_TOKEN.'
    );
  }
  next();
});

// Upload Amazon order export
router.post(
  '/upload',
  (req: Request, res: Response, next) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        logger.warn('Multer error', err);
        res.status(400).json({
          success: false,
          error: err instanceof Error ? err.message : 'File upload failed',
        });
        return;
      }
      next();
    });
  },
  asyncHandler(async (req: Request, res: Response) => {
    logger.debug('Upload request received', { hasFile: !!req.file });

    if (!req.file) {
      throw badRequest('No file uploaded. Make sure to send a file with field name "file".');
    }

    // Validate file content before parsing (reject binary files early)
    const validation = validateJsonContent(req.file.buffer);
    if (!validation.valid) {
      logger.warn('File content validation failed', { error: validation.error });
      throw badRequest(validation.error || 'Invalid file content');
    }

    const sessionId = getSessionId(req);
    const extender = getExtender(sessionId);

    // Parse the JSON file asynchronously to avoid blocking the event loop
    const fileContent = req.file.buffer.toString('utf-8');
    let jsonData: unknown;

    try {
      jsonData = await parseJsonAsync(fileContent);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid JSON file';
      throw badRequest(message);
    }

    // Parse and load orders
    logger.debug('Parsing Amazon orders JSON');
    const orders = extender.parseOrderExport(jsonData);
    logger.info(`Loaded ${orders.length} Amazon orders from file`);
    extender.loadOrders(orders);

    res.json({
      success: true,
      data: {
        orderCount: orders.length,
        orders: orders,
      },
      message: `Successfully loaded ${orders.length} Amazon orders`,
    });
  })
);

// Upload Amazon orders as JSON (alternative to file upload)
router.post(
  '/upload-json',
  asyncHandler(async (req: Request, res: Response) => {
    const { orders: jsonData } = req.body;

    logger.debug('Received Amazon orders JSON upload');

    if (!jsonData) {
      throw badRequest('No order data provided');
    }

    const sessionId = getSessionId(req);
    const extender = getExtender(sessionId);

    // Parse and load orders
    const orders = extender.parseOrderExport(jsonData);
    logger.info(`Loaded ${orders.length} Amazon orders from JSON payload`);
    extender.loadOrders(orders);

    res.json({
      success: true,
      data: {
        orderCount: orders.length,
        orders: orders,
      },
      message: `Successfully loaded ${orders.length} Amazon orders`,
    });
  })
);

// Get loaded orders
router.get('/orders', (req: Request, res: Response) => {
  const sessionId = getSessionId(req);
  const extender = getExtender(sessionId);
  const orders = extender.getLoadedOrders();

  res.json({
    success: true,
    data: orders,
  });
});

// Clear loaded orders
router.delete('/orders', (req: Request, res: Response) => {
  const sessionId = getSessionId(req);
  const extender = getExtender(sessionId);
  extender.clearOrders();

  res.json({
    success: true,
    message: 'Orders cleared',
  });
});

// Find Amazon transactions
router.post(
  '/transactions',
  validateBody(dateRangeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { startDate, endDate } = req.body as DateRangeBody;
    const sessionId = getSessionId(req);

    logger.debug('Finding Amazon transactions', { startDate, endDate });

    const extender = getExtender(sessionId);

    const transactions = await extender.findAmazonTransactions(startDate, endDate);

    logger.info(`Found ${transactions.length} Amazon transactions`);

    res.json({
      success: true,
      data: transactions,
      message: `Found ${transactions.length} Amazon transactions`,
    } satisfies { success: true; data: FireflyTransaction[]; message: string });
  })
);

// Count Amazon transactions (for wizard step 2)
router.post(
  '/count-transactions',
  validateBody(countTransactionsSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const {
      startDate,
      endDate,
      excludeProcessed = true,
      limit,
      offset,
    } = req.body as CountTransactionsBody;
    const sessionId = getSessionId(req);
    const extender = getExtender(sessionId);

    const transactions = await extender.findAmazonTransactions(startDate, endDate);

    // Filter out processed transactions if needed
    const filtered = excludeProcessed
      ? transactions.filter((t) => {
          const split = t.attributes.transactions[0];
          return !split?.tags?.includes('FFIII Toolbox: Amazon Extender');
        })
      : transactions;

    // Return count and optionally a preview of transactions with pagination
    const previewLimit = limit || 10;
    const previewOffset = offset || 0;
    const preview = filtered
      .slice(previewOffset, previewOffset + previewLimit)
      .map((t) => t.attributes.transactions[0]);

    res.json({
      success: true,
      data: { count: filtered.length, transactions: preview },
    });
  })
);

// Match transactions with orders
router.post(
  '/match',
  validateBody(amazonMatchSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { startDate, endDate, excludeProcessed = true } = req.body as AmazonMatchBody;
    const sessionId = getSessionId(req);

    logger.info('Starting Amazon match (non-streaming)', { startDate, endDate, excludeProcessed });

    const extender = getExtender(sessionId);

    const matches = await extender.matchTransactionsWithOrders(
      startDate,
      endDate,
      excludeProcessed
    );

    const matchedCount = matches.filter((m) => m.matchedOrder).length;
    logger.info(`Matched ${matchedCount}/${matches.length} transactions with orders`);

    res.json({
      success: true,
      data: matches,
      message: `Found ${matchedCount} matches out of ${matches.length} transactions`,
    } satisfies { success: true; data: AmazonMatchResult[]; message: string });
  })
);

// Stream match transactions with orders (SSE)
router.post(
  '/stream-match',
  validateBody(amazonMatchSchema),
  async (req: Request, res: Response) => {
    const { startDate, endDate, excludeProcessed = true } = req.body as AmazonMatchBody;
    const sessionId = getSessionId(req);

    logger.info('Starting Amazon match stream', { startDate, endDate, excludeProcessed });

    const extender = getExtender(sessionId);

    const sse = setupSSE(res, req);

    try {
      for await (const event of extender.streamMatchTransactionsWithOrders(
        startDate,
        endDate,
        excludeProcessed
      )) {
        // Stop processing if client disconnected
        if (!sse.isConnected()) {
          logger.debug('Client disconnected during stream');
          break;
        }
        sse.send(event.type, event.data);
      }
      sse.end();
      logger.info('Amazon match stream completed');
    } catch (error) {
      logger.error('Error in Amazon match stream', error);
      sse.error(error instanceof Error ? error : 'Unknown error');
    }
  }
);

// Apply matched descriptions and notes
// Rate limited to prevent excessive API calls to FireflyIII
router.post(
  '/apply',
  bulkOperationRateLimit,
  validateBody(amazonApplySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { matches } = req.body as AmazonApplyBody;

    const sessionId = getSessionId(req);
    const extender = getExtender(sessionId);

    const result = await extender.applyDescriptions(matches);

    res.json({
      success: true,
      data: result,
      message: `Applied ${result.successful.length} descriptions, ${result.failed.length} failed`,
    });
  })
);

export default router;
