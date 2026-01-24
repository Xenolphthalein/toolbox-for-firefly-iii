/**
 * Server-side request validation schemas using Zod
 *
 * Provides validation for import/match endpoints to ensure
 * request bodies and files are well-formed before processing.
 */
import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import type { ApiResponse } from '../../shared/types/app.js';

// =============================================================================
// Common Schemas
// =============================================================================

/**
 * ISO date string validation (YYYY-MM-DD)
 */
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

/**
 * Optional date string
 */
const optionalDateString = dateString.optional();

/**
 * Date range query parameters for transaction filtering
 */
export const dateRangeSchema = z.object({
  startDate: optionalDateString,
  endDate: optionalDateString,
});

/**
 * Count/preview transactions schema (used by Amazon/PayPal count-transactions)
 */
export const countTransactionsSchema = z.object({
  startDate: optionalDateString,
  endDate: optionalDateString,
  excludeProcessed: z.boolean().optional(),
  limit: z.number().int().positive().max(100).optional(),
  offset: z.number().int().nonnegative().optional(),
});

// =============================================================================
// Converter Import Schemas
// =============================================================================

/**
 * Single transaction for import
 */
export const importTransactionSchema = z.object({
  type: z.enum(['withdrawal', 'deposit', 'transfer']),
  date: dateString,
  amount: z.string().min(1, 'Amount is required'),
  description: z.string().min(1, 'Description is required').max(1024),
  source_name: z.string().max(255).optional(),
  destination_name: z.string().max(255).optional(),
  category_name: z.string().max(255).optional(),
  budget_name: z.string().max(255).optional(),
  tags: z.string().max(1024).optional(),
  notes: z.string().max(65535).optional(),
  currency_code: z.string().length(3).optional(),
  foreign_amount: z.string().optional(),
  foreign_currency_code: z.string().length(3).optional(),
  internal_reference: z.string().max(255).optional(),
  external_id: z.string().max(255).optional(),
  external_url: z.string().url().max(1024).optional().or(z.literal('')),
  // SEPA fields
  sepa_cc: z.string().max(255).optional(),
  sepa_ct_op: z.string().max(255).optional(),
  sepa_ct_id: z.string().max(255).optional(),
  sepa_db: z.string().max(255).optional(),
  sepa_country: z.string().max(2).optional(),
  sepa_ep: z.string().max(255).optional(),
  sepa_ci: z.string().max(255).optional(),
  sepa_batch_id: z.string().max(255).optional(),
  // Date fields
  interest_date: optionalDateString,
  book_date: optionalDateString,
  process_date: optionalDateString,
  due_date: optionalDateString,
  payment_date: optionalDateString,
  invoice_date: optionalDateString,
});

/**
 * Import options for converter
 */
export const importOptionsSchema = z.object({
  tags: z.string().max(1024).optional(),
  applyRules: z.boolean().optional(),
  errorIfDuplicate: z.boolean().optional(),
});

/**
 * Full import request body
 */
export const converterImportSchema = z.object({
  transactions: z
    .array(importTransactionSchema)
    .min(1, 'At least one transaction is required')
    .max(1000, 'Maximum 1000 transactions per import'),
  options: importOptionsSchema.optional(),
});

// =============================================================================
// Amazon Schemas
// =============================================================================

/**
 * Amazon order data - flexible schema for parsed order exports
 */
export const amazonOrderSchema = z
  .object({
    orderId: z.string().min(1, 'Order ID is required'),
    orderDate: z.string().min(1, 'Order date is required'),
    totalOwed: z.number().or(z.string()),
    items: z
      .array(
        z.object({
          title: z.string(),
          quantity: z.number().or(z.string()).optional(),
          price: z.number().or(z.string()).optional(),
        })
      )
      .optional(),
  })
  .passthrough(); // Allow additional fields from Amazon export

/**
 * Amazon upload-json request body
 */
export const amazonUploadJsonSchema = z.object({
  orders: z.unknown(), // Validated during parsing
});

/**
 * Amazon match request body
 */
export const amazonMatchSchema = z.object({
  startDate: optionalDateString,
  endDate: optionalDateString,
  excludeProcessed: z.boolean().optional(),
});

/**
 * Amazon apply request body
 */
export const amazonApplySchema = z.object({
  matches: z
    .array(
      z.object({
        transactionId: z.string().min(1),
        journalId: z.string().min(1),
        newDescription: z.string().min(1).max(1024),
        newNotes: z.string().max(65535).optional(),
      })
    )
    .min(1, 'At least one match is required'),
});

// =============================================================================
// PayPal Schemas
// =============================================================================

/**
 * PayPal upload-csv request body
 */
export const paypalUploadCsvSchema = z.object({
  csvContent: z.string().min(1, 'CSV content is required'),
});

/**
 * PayPal match request body
 */
export const paypalMatchSchema = z.object({
  startDate: optionalDateString,
  endDate: optionalDateString,
  excludeProcessed: z.boolean().optional(),
});

/**
 * PayPal apply request body
 */
export const paypalApplySchema = z.object({
  matches: z
    .array(
      z.object({
        transactionId: z.string().min(1),
        journalId: z.string().min(1),
        newDescription: z.string().min(1).max(1024),
        newNotes: z.string().max(65535).optional(),
      })
    )
    .min(1, 'At least one match is required'),
});

// =============================================================================
// FinTS Schemas
// =============================================================================

/**
 * FinTS bank URL validation - must be HTTPS
 */
const fintsUrl = z
  .string()
  .url('Invalid URL format')
  .refine((url) => url.startsWith('https://'), {
    message: 'FinTS URL must use HTTPS',
  });

/**
 * FinTS connect request body
 */
export const fintsConnectSchema = z.object({
  bankCode: z.string().min(1, 'Bank code is required').max(20),
  url: fintsUrl,
  userId: z.string().min(1, 'User ID is required').max(100),
  pin: z.string().min(1, 'PIN is required').max(100),
  productId: z.string().max(100).optional(),
});

/**
 * FinTS account schema for fetch requests
 */
export const fintsAccountSchema = z.object({
  accountNumber: z.string().min(1),
  ownerName: z.string(),
  accountType: z.string(),
  currency: z.string().length(3),
  bankCode: z.string(),
  iban: z.string().optional(),
  bic: z.string().optional(),
  balance: z.number().optional(),
  supportedSegments: z.array(z.string()).optional(),
});

/**
 * FinTS fetch request body
 */
export const fintsFetchSchema = z.object({
  account: fintsAccountSchema,
  startDate: dateString,
  endDate: dateString,
});

/**
 * FinTS TAN submission body
 */
export const fintsSubmitTanSchema = z.object({
  tan: z.string().min(1, 'TAN is required'),
  orderRef: z.string().optional(),
});

/**
 * FinTS import transaction result
 */
const fintsImportTransactionSchema = z.object({
  type: z.enum(['withdrawal', 'deposit', 'transfer']),
  date: dateString,
  amount: z.string(),
  description: z.string().max(255),
  source_name: z.string().optional(),
  source_iban: z.string().optional(),
  destination_name: z.string().optional(),
  destination_iban: z.string().optional(),
  notes: z.string().optional(),
  external_id: z.string().optional(),
});

/**
 * FinTS import result schema
 */
export const fintsImportResultSchema = z.object({
  fintsTransaction: z.object({
    reference: z.string().optional(),
    bookingDate: z.string(),
    valueDate: z.string(),
    amount: z.number(),
    currency: z.string(),
    counterpartyName: z.string().optional(),
    counterpartyIban: z.string().optional(),
    counterpartyBic: z.string().optional(),
    purpose: z.string(),
    transactionType: z.string().optional(),
    endToEndReference: z.string().optional(),
    mandateReference: z.string().optional(),
    creditorId: z.string().optional(),
    bookingText: z.string().optional(),
    primaNota: z.string().optional(),
    booked: z.boolean().optional(),
    isStorno: z.boolean().optional(),
  }),
  fireflyTransaction: fintsImportTransactionSchema,
  possibleDuplicate: z.boolean(),
  status: z.enum(['pending', 'imported', 'skipped', 'error']),
  errorMessage: z.string().optional(),
});

/**
 * FinTS import request body
 */
export const fintsImportSchema = z.object({
  transactions: z
    .array(fintsImportResultSchema)
    .min(1, 'At least one transaction is required')
    .max(1000, 'Maximum 1000 transactions per import'),
});

// =============================================================================
// Transaction Schemas
// =============================================================================

/**
 * Transaction list request body
 */
export const transactionListSchema = z.object({
  startDate: optionalDateString,
  endDate: optionalDateString,
  type: z
    .enum(['withdrawal', 'deposit', 'transfer', 'opening-balance', 'reconciliation'])
    .optional(),
  page: z.number().int().positive().optional(),
  limit: z.number().int().positive().max(100).optional(),
});

/**
 * Transaction update request body
 */
export const transactionUpdateSchema = z.object({
  journalId: z.string().min(1, 'journalId is required'),
  updates: z.object({
    category_id: z.string().optional(),
    category_name: z.string().max(255).optional(),
    tags: z.array(z.string().max(255)).optional(),
    description: z.string().min(1).max(1024).optional(),
    notes: z.string().max(65535).optional(),
  }),
});

// =============================================================================
// Duplicate Finder Schemas
// =============================================================================

/**
 * Duplicate finder options
 */
const duplicateFinderOptionsSchema = z.object({
  dateRange: z.number().int().positive().max(365).optional(),
  amountTolerance: z.number().min(0).max(100).optional(),
  includeDescriptionMatch: z.boolean().optional(),
  includeSourceMatch: z.boolean().optional(),
  includeDestinationMatch: z.boolean().optional(),
});

/**
 * Duplicate find request body (streaming and non-streaming)
 */
export const duplicateFindSchema = z.object({
  startDate: optionalDateString,
  endDate: optionalDateString,
  options: duplicateFinderOptionsSchema.optional(),
});

/**
 * Bulk delete request body
 */
export const bulkDeleteSchema = z.object({
  transactionIds: z
    .array(z.string().min(1))
    .min(1, 'At least one transaction ID is required')
    .max(100, 'Maximum 100 transactions per bulk delete'),
});

// =============================================================================
// Suggestion Schemas
// =============================================================================

/**
 * AI suggestion options
 */
const aiSuggestionOptionsSchema = z.object({
  maxSuggestions: z.number().int().positive().max(50).optional(),
  minConfidence: z.number().min(0).max(100).optional(),
});

/**
 * Suggestion request body (categories/tags streaming and non-streaming)
 */
export const suggestionRequestSchema = z.object({
  startDate: optionalDateString,
  endDate: optionalDateString,
  options: aiSuggestionOptionsSchema.optional(),
});

/**
 * Transaction update for apply operations
 */
const transactionUpdateItemSchema = z.object({
  transactionId: z.string().min(1),
  journalId: z.string().min(1),
  updates: z.object({
    category_id: z.string().optional(),
    category_name: z.string().max(255).optional(),
    tags: z.array(z.string().max(255)).optional(),
    description: z.string().min(1).max(1024).optional(),
    notes: z.string().max(65535).optional(),
  }),
});

/**
 * Apply suggestions request body
 */
export const applySuggestionsSchema = z.object({
  updates: z
    .array(transactionUpdateItemSchema)
    .min(1, 'At least one update is required')
    .max(100, 'Maximum 100 updates per request'),
});

// =============================================================================
// Subscription Schemas
// =============================================================================

/**
 * Subscription finder options
 */
const subscriptionFinderOptionsSchema = z.object({
  minOccurrences: z.number().int().positive().max(100).optional(),
  minConfidence: z.number().min(0).max(100).optional(),
  includeWeekly: z.boolean().optional(),
  includeMonthly: z.boolean().optional(),
  includeQuarterly: z.boolean().optional(),
  includeYearly: z.boolean().optional(),
});

/**
 * Subscription find request body
 */
export const subscriptionFindSchema = z.object({
  startDate: optionalDateString,
  endDate: optionalDateString,
  options: subscriptionFinderOptionsSchema.optional(),
});

/**
 * Create subscription request body
 */
export const createSubscriptionSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  amountMin: z.string().min(1, 'amountMin is required'),
  amountMax: z.string().min(1, 'amountMax is required'),
  date: dateString,
  repeatFreq: z.enum(['weekly', 'monthly', 'quarterly', 'half-year', 'yearly']),
  skip: z.number().int().nonnegative().max(31).optional(),
  currencyCode: z.string().length(3).optional(),
  currencyId: z.string().optional(),
  endDate: optionalDateString,
  extensionDate: optionalDateString,
  notes: z.string().max(65535).optional(),
  active: z.boolean().optional(),
  destinationAccountName: z.string().max(255).optional(),
  createRule: z.boolean().optional(),
});

// =============================================================================
// Validation Middleware Factory
// =============================================================================

/**
 * Validation error response with field-level details
 */
export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Create Express middleware to validate request body against a Zod schema
 */
export function validateBody<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const errors: ValidationError[] = result.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'body',
        message: issue.message,
      }));

      const response: ApiResponse<null> = {
        success: false,
        error: 'Validation failed',
        data: null,
        validationErrors: errors,
      };

      res.status(400).json(response);
      return;
    }

    // Replace body with parsed (and potentially transformed) data
    req.body = result.data;
    next();
  };
}

// =============================================================================
// Type Exports
// =============================================================================

// Common types
export type DateRangeBody = z.infer<typeof dateRangeSchema>;
export type CountTransactionsBody = z.infer<typeof countTransactionsSchema>;

export type ConverterImportBody = z.infer<typeof converterImportSchema>;
export type AmazonMatchBody = z.infer<typeof amazonMatchSchema>;
export type AmazonApplyBody = z.infer<typeof amazonApplySchema>;
export type PayPalUploadCsvBody = z.infer<typeof paypalUploadCsvSchema>;
export type PayPalMatchBody = z.infer<typeof paypalMatchSchema>;
export type PayPalApplyBody = z.infer<typeof paypalApplySchema>;
export type FinTSConnectBody = z.infer<typeof fintsConnectSchema>;
export type FinTSFetchBody = z.infer<typeof fintsFetchSchema>;
export type FinTSSubmitTanBody = z.infer<typeof fintsSubmitTanSchema>;
export type FinTSImportBody = z.infer<typeof fintsImportSchema>;
// Transaction types
export type TransactionListBody = z.infer<typeof transactionListSchema>;
export type TransactionUpdateBody = z.infer<typeof transactionUpdateSchema>;
// Duplicate types
export type DuplicateFindBody = z.infer<typeof duplicateFindSchema>;
export type BulkDeleteBody = z.infer<typeof bulkDeleteSchema>;
// Suggestion types
export type SuggestionRequestBody = z.infer<typeof suggestionRequestSchema>;
export type ApplySuggestionsBody = z.infer<typeof applySuggestionsSchema>;
// Subscription types
export type SubscriptionFindBody = z.infer<typeof subscriptionFindSchema>;
export type CreateSubscriptionBody = z.infer<typeof createSubscriptionSchema>;
