import { Router, Request, Response } from 'express';
import multer from 'multer';
import { getFireflyApi } from '../clients/firefly.js';
import { PayPalExtender, getPayPalExtenderStore } from '../services/index.js';
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
  paypalUploadCsvSchema,
  paypalMatchSchema,
  paypalApplySchema,
  dateRangeSchema,
  countTransactionsSchema,
  validateCsvContent,
  type PayPalUploadCsvBody,
  type PayPalMatchBody,
  type PayPalApplyBody,
  type DateRangeBody,
  type CountTransactionsBody,
} from '../utils/index.js';
import type { PayPalMatchResult } from '../../shared/types/app.js';
import type { FireflyTransaction } from '../../shared/types/firefly.js';

const router = Router();
const logger = createLogger('PayPal');

// Configure multer for file uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype === 'text/csv' ||
      file.originalname.endsWith('.csv') ||
      file.mimetype === 'application/vnd.ms-excel'
    ) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  },
});

// Use session store with TTL-based lifecycle management
const extenderStore = getPayPalExtenderStore<PayPalExtender>();

function getExtender(sessionId: string): PayPalExtender {
  let extender = extenderStore.get(sessionId);
  if (!extender) {
    const fireflyApi = getFireflyApi();
    extender = new PayPalExtender(fireflyApi);
    extenderStore.set(sessionId, extender);
  }
  return extender;
}

// Middleware to check Firefly III configuration
router.use((_req: Request, _res: Response, next) => {
  if (!isFireflyConfigured()) {
    throw badRequest(
      'Firefly III is not configured. Please set FIREFLY_API_URL and FIREFLY_API_TOKEN.'
    );
  }
  next();
});

// Upload PayPal activity report CSV
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
    logger.debug('PayPal upload request received', { hasFile: !!req.file });

    if (!req.file) {
      throw badRequest('No file uploaded. Make sure to send a CSV file with field name "file".');
    }

    // Validate file content before parsing (reject binary files early)
    const validation = validateCsvContent(req.file.buffer);
    if (!validation.valid) {
      logger.warn('File content validation failed', { error: validation.error });
      throw badRequest(validation.error || 'Invalid file content');
    }

    const sessionId = getSessionId(req);
    const extender = getExtender(sessionId);

    // Parse the CSV file
    const fileContent = req.file.buffer.toString('utf-8');

    logger.debug('Parsing PayPal CSV export');
    const transactions = extender.parseCSVExport(fileContent);
    logger.info(`Loaded ${transactions.length} PayPal transactions from file`);

    extender.loadTransactions(transactions);

    res.json({
      success: true,
      data: {
        transactionCount: transactions.length,
        transactions: transactions,
      },
      message: `Successfully loaded ${transactions.length} PayPal transactions`,
    });
  })
);

// Upload PayPal CSV content directly (alternative to file upload)
router.post(
  '/upload-csv',
  validateBody(paypalUploadCsvSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { csvContent } = req.body as PayPalUploadCsvBody;

    logger.debug('Received PayPal CSV content upload');

    const sessionId = getSessionId(req);
    const extender = getExtender(sessionId);

    // Parse and load transactions
    const transactions = extender.parseCSVExport(csvContent);
    logger.info(`Loaded ${transactions.length} PayPal transactions from CSV content`);
    extender.loadTransactions(transactions);

    res.json({
      success: true,
      data: {
        transactionCount: transactions.length,
        transactions: transactions,
      },
      message: `Successfully loaded ${transactions.length} PayPal transactions`,
    });
  })
);

// Get loaded transactions
router.get('/transactions', (req: Request, res: Response) => {
  const sessionId = getSessionId(req);
  const extender = getExtender(sessionId);
  const transactions = extender.getLoadedTransactions();

  res.json({
    success: true,
    data: transactions,
  });
});

// Clear loaded transactions
router.delete('/transactions', (req: Request, res: Response) => {
  const sessionId = getSessionId(req);
  const extender = getExtender(sessionId);
  extender.clearTransactions();

  res.json({
    success: true,
    message: 'Transactions cleared',
  });
});

// Find PayPal transactions in Firefly
router.post(
  '/firefly-transactions',
  validateBody(dateRangeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { startDate, endDate } = req.body as DateRangeBody;
    const sessionId = getSessionId(req);

    logger.debug('Finding Firefly transactions for PayPal match', { startDate, endDate });

    const extender = getExtender(sessionId);

    const transactions = await extender.findPayPalTransactions(startDate, endDate);

    logger.info(`Found ${transactions.length} potential PayPal transactions in Firefly`);

    res.json({
      success: true,
      data: transactions,
      message: `Found ${transactions.length} PayPal transactions`,
    } satisfies { success: true; data: FireflyTransaction[]; message: string });
  })
);

// Count PayPal transactions (for wizard step 2)
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

    const transactions = await extender.findPayPalTransactions(startDate, endDate);

    // Filter out processed transactions if needed
    const filtered = excludeProcessed
      ? transactions.filter((t) => {
          const split = t.attributes.transactions[0];
          return !split?.tags?.includes('Toolbox for FFIII: PayPal Extender');
        })
      : transactions;

    // Return preview of transactions with pagination
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

// Match transactions with PayPal data
router.post(
  '/match',
  validateBody(paypalMatchSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { startDate, endDate, excludeProcessed = true } = req.body as PayPalMatchBody;
    const sessionId = getSessionId(req);

    logger.info('Starting PayPal match (non-streaming)', { startDate, endDate, excludeProcessed });

    const extender = getExtender(sessionId);

    const matches = await extender.matchTransactionsWithPayPal(
      startDate,
      endDate,
      excludeProcessed
    );

    const matchedCount = matches.filter((m) => m.matchedPayPalTransaction).length;
    logger.info(`Matched ${matchedCount}/${matches.length} transactions with PayPal data`);

    res.json({
      success: true,
      data: matches,
      message: `Found ${matchedCount} matches out of ${matches.length} transactions`,
    } satisfies { success: true; data: PayPalMatchResult[]; message: string });
  })
);

// Stream match transactions with PayPal (SSE)
router.post(
  '/stream-match',
  validateBody(paypalMatchSchema),
  async (req: Request, res: Response) => {
    const { startDate, endDate, excludeProcessed = true } = req.body as PayPalMatchBody;
    const sessionId = getSessionId(req);

    logger.info('Starting PayPal match stream', { startDate, endDate, excludeProcessed });

    const extender = getExtender(sessionId);

    const sse = setupSSE(res, req);

    try {
      for await (const event of extender.streamMatchTransactionsWithPayPal(
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
      logger.info('PayPal match stream completed');
    } catch (error) {
      logger.error('Error in PayPal match stream', error);
      sse.error(error instanceof Error ? error : 'Unknown error');
    }
  }
);

// Apply matched descriptions and notes
// Rate limited to prevent excessive API calls to Firefly III
router.post(
  '/apply',
  bulkOperationRateLimit,
  validateBody(paypalApplySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { matches } = req.body as PayPalApplyBody;

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
