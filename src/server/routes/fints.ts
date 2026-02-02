import { Router, Request, Response } from 'express';
import { FinTSClient, FinTSAuthError, KNOWN_BANKS } from '../clients/fints/index.js';
import { getFireflyApi } from '../clients/firefly.js';
import { getFinTSClientStore, getFinTSDialogStateStore } from '../services/index.js';
import { isFireflyConfigured, isFinTSConfigured, config } from '../config/index.js';
import { createLogger } from '../utils/logger.js';
import { asyncHandler, badRequest, getSessionId, setupSSE } from '../middleware/index.js';
import {
  validateBody,
  fintsConnectSchema,
  fintsFetchSchema,
  fintsSubmitTanSchema,
  fintsImportSchema,
  type FinTSConnectBody,
  type FinTSFetchBody,
  type FinTSSubmitTanBody,
  type FinTSImportBody,
} from '../utils/index.js';
import type {
  FinTSTransaction,
  FinTSDialogState,
  FinTSImportResult,
} from '../../shared/types/app.js';

const router = Router();
const logger = createLogger('FinTS:Routes');

// Use session stores with TTL-based lifecycle management
const clientStore = getFinTSClientStore<FinTSClient>();
const dialogStateStore = getFinTSDialogStateStore<FinTSDialogState>();

function getClient(sessionId: string): FinTSClient | undefined {
  return clientStore.get(sessionId);
}

function setClient(sessionId: string, client: FinTSClient): void {
  // Register cleanup callback to end dialog when entry is evicted
  clientStore.set(sessionId, client, () => {
    logger.debug(`Ending dialog for evicted session ${sessionId}`);
    client.endDialog().catch(() => {});
  });
  logger.debug(`Client stored for session ${sessionId}`);
}

async function clearClient(sessionId: string): Promise<void> {
  const client = clientStore.get(sessionId);
  if (client) {
    logger.debug(`Clearing client for session ${sessionId}`);
    try {
      await client.endDialog();
    } catch {
      // Ignore errors ending dialog
    }
  }
  await clientStore.delete(sessionId);
  await dialogStateStore.delete(sessionId);
}

// Middleware to check Firefly III and FinTS configuration
router.use((_req: Request, _res: Response, next) => {
  if (!isFireflyConfigured()) {
    throw badRequest(
      'Firefly III is not configured. Please set FIREFLY_API_URL and FIREFLY_API_TOKEN.'
    );
  }
  if (!isFinTSConfigured()) {
    throw badRequest(
      'FinTS is not configured. Please set FINTS_PRODUCT_ID with your registered product ID. ' +
        'Register at https://www.hbci-zka.de/register/hersteller.htm'
    );
  }
  next();
});

// Get list of known banks
router.get(
  '/banks',
  asyncHandler(async (_req: Request, res: Response) => {
    const banks = Object.entries(KNOWN_BANKS).map(([blz, info]) => ({
      blz,
      name: info.name,
      url: info.url,
    }));

    res.json({ success: true, data: banks });
  })
);

// Initialize connection and get accounts
router.post(
  '/connect',
  validateBody(fintsConnectSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const sessionId = getSessionId(req);
    const clientConfig = req.body as FinTSConnectBody;

    logger.info(`Connection request for bank ${clientConfig.bankCode} (session: ${sessionId})`);

    // Clear any existing client
    await clearClient(sessionId);

    // Use configured product ID from environment
    const fintsConfig = {
      ...clientConfig,
      productId: config.fints.productId,
    };

    // Create new client and initialize dialog
    const client = new FinTSClient(fintsConfig);
    setClient(sessionId, client);

    try {
      const state = await client.initDialog();
      dialogStateStore.set(sessionId, state);

      logger.info(`Connection successful, found ${state.accounts?.length || 0} accounts`);

      res.json({
        success: true,
        data: state,
        message: state.statusMessage,
      });
    } catch (error) {
      // Clear client on connection failure
      await clearClient(sessionId);

      // Handle authentication errors with user-friendly messages
      if (error instanceof FinTSAuthError) {
        logger.warn(`Authentication error (${error.code}): ${error.message}`);
        return res.status(401).json({
          success: false,
          error: error.message,
          code: error.code,
          message: getAuthErrorMessage(error.code, error.message),
        });
      }

      throw error;
    }
  })
);

/**
 * Get user-friendly error message for FinTS auth error codes
 */
function getAuthErrorMessage(code: number, originalMessage: string): string {
  switch (code) {
    // Warning codes (3xxx)
    case 3938:
      return 'Your access is temporarily locked. Please unlock your PIN in your banking app or contact your bank.';
    case 3939:
      return 'Your access has been locked. Please contact your bank.';
    case 3916:
    case 3910:
      return 'Invalid PIN. Please check your credentials and try again.';
    case 3931:
      return 'Invalid TAN. Please try again with a new TAN.';
    case 3933:
      return 'TAN has been locked. Please contact your bank.';
    case 3920:
      return 'Authentication failed. No TAN methods available for your account.';
    // Error codes (9xxx)
    case 9010:
      return 'PIN/TAN verification failed. Please check your credentials and try again.';
    case 9931:
      return 'Username or PIN is incorrect. Please check your credentials and try again.';
    case 9930:
      return 'Username not found. Please verify your login ID.';
    case 9942:
      return 'Your access has been blocked. Please contact your bank.';
    default:
      return originalMessage || 'Authentication failed. Please check your credentials.';
  }
}

// Submit TAN (for manual TAN entry)
router.post(
  '/submit-tan',
  validateBody(fintsSubmitTanSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const sessionId = getSessionId(req);
    const { tan, orderRef } = req.body as FinTSSubmitTanBody;

    logger.info(`TAN submission for session ${sessionId}`);

    const client = getClient(sessionId);
    const currentState = dialogStateStore.get(sessionId);

    if (!client || !currentState) {
      logger.warn('TAN submission without active session');
      throw badRequest('No active session. Please connect first.');
    }

    const state = await client.submitTan(tan, orderRef || currentState.tanRequest?.orderRef || '');
    dialogStateStore.set(sessionId, state);

    logger.info('TAN verified successfully');

    res.json({
      success: true,
      data: state,
      message: state.statusMessage,
    });
  })
);

// Poll for decoupled TAN completion (for app-based TAN)
router.post(
  '/poll-tan',
  asyncHandler(async (req: Request, res: Response) => {
    const sessionId = getSessionId(req);
    const { orderRef } = req.body;

    logger.info(`Polling TAN status for session ${sessionId}`);

    const client = getClient(sessionId);
    const currentState = dialogStateStore.get(sessionId);

    if (!client || !currentState) {
      logger.warn('Poll without active session');
      throw badRequest('No active session. Please connect first.');
    }

    const state = await client.pollDecoupledTan(
      orderRef || currentState.tanRequest?.orderRef || ''
    );
    dialogStateStore.set(sessionId, state);

    res.json({
      success: true,
      data: state,
      message: state.statusMessage,
    });
  })
);

// Fetch transactions (simple - returns raw transactions for converter flow)
router.post(
  '/fetch',
  validateBody(fintsFetchSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const sessionId = getSessionId(req);
    const { account, startDate, endDate } = req.body as FinTSFetchBody;

    logger.info(`Fetch request for session ${sessionId}: ${startDate} to ${endDate}`);

    const client = getClient(sessionId);

    if (!client) {
      logger.warn('Fetch request without active session');
      throw badRequest('No active session. Please connect first.');
    }

    // Fetch transactions from bank
    logger.debug('Starting transaction fetch from bank...');
    const transactions = await client.fetchTransactions({
      account,
      startDate,
      endDate,
    });

    logger.info(`Fetched ${transactions.length} transactions from bank`);

    res.json({
      success: true,
      data: { transactions },
      message: `Fetched ${transactions.length} transactions`,
    });
  })
);

// Fetch transactions (streaming)
router.post(
  '/stream-fetch',
  validateBody(fintsFetchSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const sessionId = getSessionId(req);
    const { account, startDate, endDate } = req.body as FinTSFetchBody;

    logger.info(`Fetch request for session ${sessionId}: ${startDate} to ${endDate}`);

    const client = getClient(sessionId);

    if (!client) {
      logger.warn('Fetch request without active session');
      throw badRequest('No active session. Please connect first.');
    }

    const sse = setupSSE(res, req);

    try {
      sse.send('progress', {
        current: 0,
        total: 0,
        message: 'Connecting to bank server...',
      });

      // Check for early disconnect
      if (!sse.isConnected()) {
        logger.debug('Client disconnected before fetch');
        return;
      }

      // Fetch transactions
      logger.debug('Starting transaction fetch from bank...');
      const transactions = await client.fetchTransactions({
        account,
        startDate,
        endDate,
      });

      logger.info(`Fetched ${transactions.length} transactions from bank`);

      // Check for early disconnect
      if (!sse.isConnected()) {
        logger.debug('Client disconnected after fetch');
        return;
      }

      sse.send('progress', {
        current: 0,
        total: transactions.length,
        message: `Found ${transactions.length} transactions. Processing...`,
      });

      // Convert to import results
      const fireflyApi = getFireflyApi();

      // Check for potential duplicates by fetching existing transactions
      logger.debug('Fetching existing Firefly transactions for duplicate check...');
      const existingTransactions = await fireflyApi.getAllTransactions(startDate, endDate);
      logger.debug(`Found ${existingTransactions.length} existing transactions`);

      for (let i = 0; i < transactions.length; i++) {
        // Stop processing if client disconnected
        if (!sse.isConnected()) {
          logger.debug('Client disconnected during processing');
          break;
        }

        const tx = transactions[i];

        sse.send('progress', {
          current: i + 1,
          total: transactions.length,
          message: `Processing transaction ${i + 1} of ${transactions.length}...`,
        });

        // Convert FinTS transaction to Firefly format
        const importResult = convertToFirefly(tx, existingTransactions);

        sse.send('result', importResult);
      }

      logger.info('Transaction fetch and processing complete');
      sse.end();
    } catch (error) {
      sse.error(error instanceof Error ? error.message : 'Failed to fetch transactions');
    }
  })
);

// Import transactions to Firefly
router.post(
  '/import',
  validateBody(fintsImportSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { transactions } = req.body as FinTSImportBody;

    logger.info(`Import request for ${transactions.length} transactions`);

    const fireflyApi = getFireflyApi();
    const results: { successful: string[]; failed: Array<{ id: string; error: string }> } = {
      successful: [],
      failed: [],
    };

    for (const result of transactions) {
      if (result.status !== 'pending') continue;

      try {
        const tx = result.fireflyTransaction;

        logger.debug(`Importing transaction: ${tx.description}`);

        await fireflyApi.createTransaction({
          error_if_duplicate_hash: true,
          apply_rules: true,
          fire_webhooks: true,
          transactions: [
            {
              type: tx.type,
              date: tx.date,
              amount: tx.amount,
              description: tx.description,
              source_name: tx.source_name,
              destination_name: tx.destination_name,
              notes: tx.notes,
              external_id: tx.external_id,
              tags: ['Toolbox for FFIII: FinTS Importer'],
            },
          ],
        });

        results.successful.push(result.fintsTransaction.reference || tx.description);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.debug(`Failed to import: ${errorMessage}`);
        results.failed.push({
          id: result.fintsTransaction.reference || result.fireflyTransaction.description,
          error: errorMessage,
        });
      }
    }

    logger.info(
      `Import complete: ${results.successful.length} success, ${results.failed.length} failed`
    );

    res.json({
      success: true,
      data: results,
      message: `Imported ${results.successful.length} transactions. ${results.failed.length} failed.`,
    });
  })
);

// Disconnect session
router.post(
  '/disconnect',
  asyncHandler(async (req: Request, res: Response) => {
    const sessionId = getSessionId(req);
    logger.info(`Disconnect request for session ${sessionId}`);
    await clearClient(sessionId);

    res.json({
      success: true,
      message: 'Disconnected successfully.',
    });
  })
);

/**
 * Convert FinTS transaction to Firefly import result
 */
function convertToFirefly(
  tx: FinTSTransaction,
  existingTransactions: Array<{
    attributes: { transactions: Array<{ amount: string; date: string; description: string }> };
  }>
): FinTSImportResult {
  const isWithdrawal = tx.amount < 0;
  const absAmount = Math.abs(tx.amount).toFixed(2);

  // Build description from purpose
  let description = tx.purpose || tx.bookingText || 'FinTS Transaction';
  if (tx.counterpartyName) {
    description = `${tx.counterpartyName}: ${description}`.slice(0, 255);
  }

  // Build notes with additional details
  const notes: string[] = [];
  if (tx.endToEndReference) notes.push(`End-to-End: ${tx.endToEndReference}`);
  if (tx.mandateReference) notes.push(`Mandate: ${tx.mandateReference}`);
  if (tx.creditorId) notes.push(`Creditor ID: ${tx.creditorId}`);
  if (tx.counterpartyIban) notes.push(`IBAN: ${tx.counterpartyIban}`);
  if (tx.counterpartyBic) notes.push(`BIC: ${tx.counterpartyBic}`);

  // Generate external ID from available data
  const externalId =
    tx.reference ||
    `fints-${tx.bookingDate}-${absAmount}-${tx.counterpartyName?.slice(0, 20) || 'unknown'}`.replace(
      /[^a-zA-Z0-9-]/g,
      '_'
    );

  // Check for potential duplicates
  const possibleDuplicate = existingTransactions.some((existing) => {
    const existingTx = existing.attributes.transactions[0];
    if (!existingTx) return false;

    // Check date and amount match
    const dateMatch = existingTx.date.slice(0, 10) === tx.bookingDate;
    const amountMatch = Math.abs(parseFloat(existingTx.amount)) === Math.abs(tx.amount);

    return dateMatch && amountMatch;
  });

  return {
    fintsTransaction: tx,
    fireflyTransaction: {
      type: isWithdrawal ? 'withdrawal' : 'deposit',
      date: tx.bookingDate,
      amount: absAmount,
      description: description.slice(0, 255),
      source_name: isWithdrawal ? undefined : tx.counterpartyName,
      source_iban: isWithdrawal ? undefined : tx.counterpartyIban,
      destination_name: isWithdrawal ? tx.counterpartyName : undefined,
      destination_iban: isWithdrawal ? tx.counterpartyIban : undefined,
      notes: notes.join('\n'),
      external_id: externalId,
    },
    possibleDuplicate,
    status: 'pending',
  };
}

export default router;
