import { Router, Request, Response } from 'express';
import { getFireflyApi } from '../clients/firefly.js';
import { isFireflyConfigured } from '../config/index.js';
import { asyncHandler, badRequest } from '../middleware/index.js';
import { createLogger } from '../utils/logger.js';
import {
  validateBody,
  transactionListSchema,
  transactionUpdateSchema,
  dateRangeSchema,
  type TransactionListBody,
  type TransactionUpdateBody,
  type DateRangeBody,
} from '../utils/index.js';

const router = Router();
const logger = createLogger('Transactions');

// Middleware to check FireflyIII configuration
router.use((_req: Request, _res: Response, next) => {
  if (!isFireflyConfigured()) {
    throw badRequest(
      'FireflyIII is not configured. Please set FIREFLY_API_URL and FIREFLY_API_TOKEN.'
    );
  }
  next();
});

// Get transactions with optional filters
router.post(
  '/list',
  validateBody(transactionListSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { startDate, endDate, type, page, limit } = req.body as TransactionListBody;

    logger.debug(`Fetching transactions: ${startDate} to ${endDate} (${type})`);

    const fireflyApi = getFireflyApi();
    const response_data = await fireflyApi.getTransactions(
      startDate,
      endDate,
      type,
      page || 1,
      limit || 50
    );

    const currentPage = response_data.meta?.pagination?.current_page || 1;
    logger.debug(`Fetched ${response_data.data.length} transactions (page ${currentPage})`);

    res.json({ success: true, data: response_data });
  })
);

// Get all transactions (paginated internally)
router.post(
  '/all',
  validateBody(dateRangeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { startDate, endDate } = req.body as DateRangeBody;

    logger.info(
      `Fetching all transactions from ${startDate} to ${endDate} (this may take a while)`
    );

    const fireflyApi = getFireflyApi();
    const transactions = await fireflyApi.getAllTransactions(startDate, endDate);

    logger.info(`Successfully fetched ${transactions.length} total transactions`);

    res.json({
      success: true,
      data: transactions,
      message: `Fetched ${transactions.length} transactions`,
    });
  })
);

// Get a single transaction
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;

    const fireflyApi = getFireflyApi();
    const transaction = await fireflyApi.getTransaction(id);

    if (!transaction) {
      logger.warn(`Transaction not found: ${id}`);
    }

    res.json({ success: true, data: transaction });
  })
);

// Update a transaction
router.put(
  '/:id',
  validateBody(transactionUpdateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const { journalId, updates } = req.body as TransactionUpdateBody;

    logger.info(`Updating transaction ${id} (journal ${journalId})`, { updates });

    const fireflyApi = getFireflyApi();
    const transaction = await fireflyApi.updateTransaction(id, journalId, updates);

    res.json({
      success: true,
      data: transaction,
      message: 'Transaction updated successfully',
    });
  })
);

// Delete a transaction
router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;

    logger.info(`Deleting transaction ${id}`);

    const fireflyApi = getFireflyApi();
    await fireflyApi.deleteTransaction(id);

    res.json({
      success: true,
      message: 'Transaction deleted successfully',
    });
  })
);

// Get accounts
router.get(
  '/accounts/list',
  asyncHandler(async (req: Request, res: Response) => {
    const { type } = req.query as { type?: string };

    const fireflyApi = getFireflyApi();
    const accounts = await fireflyApi.getAllAccounts(type);

    res.json({ success: true, data: accounts });
  })
);

export default router;
