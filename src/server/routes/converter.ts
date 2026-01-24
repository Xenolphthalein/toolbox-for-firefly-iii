import { Router, Request, Response } from 'express';
import { getFireflyApi } from '../clients/firefly.js';
import { isFireflyConfigured } from '../config/index.js';
import { asyncHandler, badRequest, setupSSE, importRateLimit } from '../middleware/index.js';
import { createLogger } from '../utils/logger.js';
import { validateBody, converterImportSchema, type ConverterImportBody } from '../utils/index.js';

const router = Router();
const logger = createLogger('Converter');

// Type for incoming transaction from client
interface ImportTransaction {
  type: string;
  date: string;
  amount: string;
  description: string;
  source_name?: string;
  destination_name?: string;
  category_name?: string;
  budget_name?: string;
  tags?: string;
  notes?: string;
  currency_code?: string;
  foreign_amount?: string;
  foreign_currency_code?: string;
  internal_reference?: string;
  external_id?: string;
  external_url?: string;
  sepa_cc?: string;
  sepa_ct_op?: string;
  sepa_ct_id?: string;
  sepa_db?: string;
  sepa_country?: string;
  sepa_ep?: string;
  sepa_ci?: string;
  sepa_batch_id?: string;
  interest_date?: string;
  book_date?: string;
  process_date?: string;
  due_date?: string;
  payment_date?: string;
  invoice_date?: string;
}

/**
 * Build transaction data object with only defined fields.
 * This ensures consistent hashing by not including undefined/null fields.
 */
function buildTransactionData(tx: ImportTransaction, tags?: string[]): Record<string, unknown> {
  const data: Record<string, unknown> = {
    type: tx.type,
    date: tx.date,
    amount: tx.amount,
    description: tx.description,
  };

  // Only add optional fields if they have actual values
  if (tx.source_name) data.source_name = tx.source_name;
  if (tx.destination_name) data.destination_name = tx.destination_name;
  if (tx.category_name) data.category_name = tx.category_name;
  if (tx.budget_name) data.budget_name = tx.budget_name;
  if (tags && tags.length > 0) data.tags = tags;
  if (tx.notes) data.notes = tx.notes;
  if (tx.currency_code) data.currency_code = tx.currency_code;
  if (tx.foreign_amount) data.foreign_amount = tx.foreign_amount;
  if (tx.foreign_currency_code) data.foreign_currency_code = tx.foreign_currency_code;
  if (tx.internal_reference) data.internal_reference = tx.internal_reference;
  if (tx.external_id) data.external_id = tx.external_id;
  if (tx.external_url) data.external_url = tx.external_url;
  if (tx.sepa_cc) data.sepa_cc = tx.sepa_cc;
  if (tx.sepa_ct_op) data.sepa_ct_op = tx.sepa_ct_op;
  if (tx.sepa_ct_id) data.sepa_ct_id = tx.sepa_ct_id;
  if (tx.sepa_db) data.sepa_db = tx.sepa_db;
  if (tx.sepa_country) data.sepa_country = tx.sepa_country;
  if (tx.sepa_ep) data.sepa_ep = tx.sepa_ep;
  if (tx.sepa_ci) data.sepa_ci = tx.sepa_ci;
  if (tx.sepa_batch_id) data.sepa_batch_id = tx.sepa_batch_id;
  if (tx.interest_date) data.interest_date = tx.interest_date;
  if (tx.book_date) data.book_date = tx.book_date;
  if (tx.process_date) data.process_date = tx.process_date;
  if (tx.due_date) data.due_date = tx.due_date;
  if (tx.payment_date) data.payment_date = tx.payment_date;
  if (tx.invoice_date) data.invoice_date = tx.invoice_date;

  return data;
}

// Middleware to check FireflyIII configuration (optional for converter)
const requireFirefly = (_req: Request, _res: Response, next: () => void) => {
  if (!isFireflyConfigured()) {
    throw badRequest(
      'FireflyIII is not configured. Please set FIREFLY_API_URL and FIREFLY_API_TOKEN.'
    );
  }
  next();
};

/**
 * POST /api/converter/import
 * Import converted transactions directly into FireflyIII
 * Body: { transactions: FireflyTransactionSplit[], options?: ImportOptions }
 * Rate limited to prevent excessive API calls to FireflyIII
 */
router.post(
  '/import',
  requireFirefly,
  importRateLimit,
  validateBody(converterImportSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { transactions, options } = req.body as ConverterImportBody;

    // Parse import options
    const applyRules = options?.applyRules ?? true;
    const errorIfDuplicate = options?.errorIfDuplicate ?? true;
    // Import tags are added AFTER transaction creation to avoid affecting duplicate hash
    const importTags = options?.tags
      ? options.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

    const fireflyApi = getFireflyApi();
    const results = {
      successful: [] as string[],
      failed: [] as Array<{ index: number; error: string }>,
    };

    // Import transactions one by one to handle errors gracefully
    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];
      try {
        // Convert tags from comma-separated string to array (CSV tags only, NOT import tags)
        // Import tags are added AFTER creation to avoid affecting duplicate hash calculation
        const txTags = tx.tags
          ? tx.tags
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean)
          : [];
        const tags = txTags.length > 0 ? txTags : undefined;

        const txData = buildTransactionData(tx, tags);
        const createdTx = await fireflyApi.createTransaction({
          error_if_duplicate_hash: errorIfDuplicate,
          apply_rules: applyRules,
          fire_webhooks: true,
          transactions: [
            txData as Parameters<typeof fireflyApi.createTransaction>[0]['transactions'][0],
          ],
        });

        // Add import tags AFTER creation so they don't affect duplicate hash
        if (importTags.length > 0) {
          try {
            await fireflyApi.addTagsToTransaction(createdTx.id, importTags);
          } catch {
            // Tag addition failed, but transaction was created - don't count as failure
            logger.warn(`Failed to add import tags to transaction ${createdTx.id}`);
          }
        }

        results.successful.push(`Row ${i + 1}`);
      } catch (error) {
        results.failed.push({
          index: i,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    res.json({
      success: true,
      data: results,
      message: `Imported ${results.successful.length} of ${transactions.length} transactions`,
    });
  })
);

/**
 * POST /api/converter/stream-import
 * Import converted transactions with SSE progress streaming
 * Body: { transactions: FireflyTransactionSplit[], options?: ImportOptions }
 * Rate limited to prevent excessive API calls to FireflyIII
 */
router.post(
  '/stream-import',
  requireFirefly,
  importRateLimit,
  validateBody(converterImportSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const sse = setupSSE(res);

    try {
      const { transactions, options } = req.body as ConverterImportBody;

      // Parse import options
      const applyRules = options?.applyRules ?? true;
      const errorIfDuplicate = options?.errorIfDuplicate ?? true;
      // Import tags are added AFTER transaction creation to avoid affecting duplicate hash
      const importTags = options?.tags
        ? options.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        : [];

      const fireflyApi = getFireflyApi();
      const results = {
        successful: 0,
        failed: 0,
        errors: [] as string[],
      };

      // Send initial progress
      sse.send('progress', { current: 0, total: transactions.length });

      // Import transactions one by one with progress updates
      for (let i = 0; i < transactions.length; i++) {
        const tx = transactions[i];
        try {
          // Convert tags from comma-separated string to array (CSV tags only, NOT import tags)
          // Import tags are added AFTER creation to avoid affecting duplicate hash calculation
          const txTags = tx.tags
            ? tx.tags
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean)
            : [];
          const tags = txTags.length > 0 ? txTags : undefined;

          const txData = buildTransactionData(tx, tags);
          const createdTx = await fireflyApi.createTransaction({
            error_if_duplicate_hash: errorIfDuplicate,
            apply_rules: applyRules,
            fire_webhooks: true,
            transactions: [
              txData as Parameters<typeof fireflyApi.createTransaction>[0]['transactions'][0],
            ],
          });

          // Add import tags AFTER creation so they don't affect duplicate hash
          if (importTags.length > 0) {
            try {
              await fireflyApi.addTagsToTransaction(createdTx.id, importTags);
            } catch {
              // Tag addition failed, but transaction was created - don't count as failure
              logger.warn(`Failed to add import tags to transaction ${createdTx.id}`);
            }
          }

          results.successful++;
        } catch (error) {
          results.failed++;
          results.errors.push(
            `Row ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }

        // Send progress update after each transaction
        sse.send('progress', { current: i + 1, total: transactions.length });
      }

      // Send final result
      sse.send('result', results);
      sse.end();
    } catch (error) {
      sse.error(error instanceof Error ? error.message : 'Failed to import transactions');
    }
  })
);

/**
 * GET /api/converter/accounts
 * Get list of accounts for mapping validation
 */
router.get(
  '/accounts',
  requireFirefly,
  asyncHandler(async (_req: Request, res: Response) => {
    const fireflyApi = getFireflyApi();
    const accounts = await fireflyApi.getAccounts();

    res.json({ success: true, data: accounts });
  })
);

/**
 * GET /api/converter/categories
 * Get list of categories for mapping validation
 */
router.get(
  '/categories',
  requireFirefly,
  asyncHandler(async (_req: Request, res: Response) => {
    const fireflyApi = getFireflyApi();
    const categories = await fireflyApi.getCategories();

    res.json({ success: true, data: categories });
  })
);

export default router;
