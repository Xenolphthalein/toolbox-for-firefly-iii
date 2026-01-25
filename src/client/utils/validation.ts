/**
 * Runtime validation schemas for API responses
 *
 * Uses Zod to validate critical financial data from the backend,
 * preventing UI crashes when API responses are malformed.
 *
 * NOTE: Schemas use .nullish() (nullable + optional) for most fields because
 * the Firefly API may omit fields entirely rather than returning null.
 */
import { z } from 'zod';

// =============================================================================
// Firefly Transaction Schemas
// =============================================================================

/**
 * FireflyTransactionSplit - The core transaction record
 * Uses lenient validation - only critical fields are required
 */
export const FireflyTransactionSplitSchema = z
  .object({
    // Required core fields
    transaction_journal_id: z.string(),
    type: z.enum(['withdrawal', 'deposit', 'transfer', 'reconciliation', 'opening balance']),
    date: z.string(),
    amount: z.string(),
    description: z.string(),
    currency_code: z.string(),

    // Fields that should be present but we'll be lenient about
    user: z.string().optional(),
    order: z.number().optional(),
    currency_id: z.string().optional(),
    currency_symbol: z.string().optional(),
    currency_decimal_places: z.number().optional(),

    // Nullable/optional fields - use nullish() to handle both null and undefined
    foreign_currency_id: z.string().nullish(),
    foreign_currency_code: z.string().nullish(),
    foreign_currency_symbol: z.string().nullish(),
    foreign_currency_decimal_places: z.number().nullish(),
    foreign_amount: z.string().nullish(),

    // Account fields
    source_id: z.string().optional(),
    source_name: z.string().optional(),
    source_iban: z.string().nullish(),
    source_type: z.string().optional(),
    destination_id: z.string().optional(),
    destination_name: z.string().optional(),
    destination_iban: z.string().nullish(),
    destination_type: z.string().optional(),

    // Optional categorization
    budget_id: z.string().nullish(),
    budget_name: z.string().nullish(),
    category_id: z.string().nullish(),
    category_name: z.string().nullish(),
    bill_id: z.string().nullish(),
    bill_name: z.string().nullish(),

    // Metadata
    reconciled: z.boolean().optional(),
    notes: z.string().nullish(),
    tags: z.array(z.string()).optional(),
    internal_reference: z.string().nullish(),
    external_id: z.string().nullish(),
    external_url: z.string().nullish(),
    original_source: z.string().nullish(),

    // Recurrence
    recurrence_id: z.string().nullish(),
    recurrence_total: z.number().nullish(),
    recurrence_count: z.number().nullish(),

    // External integrations - often missing
    bunq_payment_id: z.string().nullish(),
    import_hash_v2: z.string().nullish(),

    // SEPA fields - often missing
    sepa_cc: z.string().nullish(),
    sepa_ct_op: z.string().nullish(),
    sepa_ct_id: z.string().nullish(),
    sepa_db: z.string().nullish(),
    sepa_country: z.string().nullish(),
    sepa_ep: z.string().nullish(),
    sepa_ci: z.string().nullish(),
    sepa_batch_id: z.string().nullish(),

    // Date fields
    interest_date: z.string().nullish(),
    book_date: z.string().nullish(),
    process_date: z.string().nullish(),
    due_date: z.string().nullish(),
    payment_date: z.string().nullish(),
    invoice_date: z.string().nullish(),

    // Location
    latitude: z.number().nullish(),
    longitude: z.number().nullish(),
    zoom_level: z.number().nullish(),

    // Attachments
    has_attachments: z.boolean().optional(),
  })
  .passthrough(); // Allow additional unknown fields

export type ValidatedFireflyTransactionSplit = z.infer<typeof FireflyTransactionSplitSchema>;

/**
 * FireflyTransaction - Transaction group containing splits
 */
export const FireflyTransactionSchema = z
  .object({
    id: z.string(),
    type: z.string(),
    attributes: z.object({
      created_at: z.string().optional(),
      updated_at: z.string().optional(),
      user: z.string().optional(),
      group_title: z.string().nullish(),
      transactions: z.array(FireflyTransactionSplitSchema),
    }),
  })
  .passthrough();

export type ValidatedFireflyTransaction = z.infer<typeof FireflyTransactionSchema>;

// =============================================================================
// Category & Tag Schemas
// =============================================================================

const CurrencySumSchema = z.object({
  currency_id: z.string(),
  currency_code: z.string(),
  currency_symbol: z.string(),
  currency_decimal_places: z.number(),
  sum: z.string(),
});

export const FireflyCategorySchema = z.object({
  id: z.string(),
  type: z.string(),
  attributes: z.object({
    created_at: z.string(),
    updated_at: z.string(),
    name: z.string(),
    notes: z.string().nullable(),
    spent: z.array(CurrencySumSchema),
    earned: z.array(CurrencySumSchema),
  }),
});

export type ValidatedFireflyCategory = z.infer<typeof FireflyCategorySchema>;

export const FireflyTagSchema = z.object({
  id: z.string(),
  type: z.string(),
  attributes: z.object({
    created_at: z.string(),
    updated_at: z.string(),
    tag: z.string(),
    date: z.string().nullable(),
    description: z.string().nullable(),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
    zoom_level: z.number().nullable(),
  }),
});

export type ValidatedFireflyTag = z.infer<typeof FireflyTagSchema>;

// =============================================================================
// API Response Schemas
// =============================================================================

/**
 * Generic API response wrapper
 */
export const ApiResponseSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: z.string().optional(),
    message: z.string().optional(),
  });

/**
 * Paginated response wrapper
 */
export const PaginatedResponseSchema = <T extends z.ZodType>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    total: z.number(),
    page: z.number(),
    pageSize: z.number(),
    totalPages: z.number(),
  });

/**
 * Transaction preview response (from /transactions/preview endpoint)
 */
export const TransactionPreviewResponseSchema = z.object({
  count: z.number(),
  transactions: z.array(FireflyTransactionSplitSchema),
});

export type ValidatedTransactionPreviewResponse = z.infer<typeof TransactionPreviewResponseSchema>;

// =============================================================================
// Stream Event Schemas
// =============================================================================

export const ProgressDataSchema = z.object({
  current: z.number(),
  total: z.number(),
  message: z.string().optional(),
});

export type ValidatedProgressData = z.infer<typeof ProgressDataSchema>;

/**
 * Confidence breakdown for duplicate detection
 */
export const DuplicateConfidenceBreakdownSchema = z.object({
  dateMatch: z.number(),
  amountMatch: z.number(),
  descriptionMatch: z.number(),
  sourceAccountMatch: z.number(),
  destinationAccountMatch: z.number(),
  externalIdMatch: z.number(),
  importHashMatch: z.number(),
});

/**
 * Duplicate group from stream
 */
export const DuplicateGroupSchema = z.object({
  id: z.string(),
  transactions: z.array(FireflyTransactionSchema),
  matchScore: z.number(),
  matchReasons: z.array(z.string()),
  confidenceBreakdown: DuplicateConfidenceBreakdownSchema.optional(),
});

export type ValidatedDuplicateGroup = z.infer<typeof DuplicateGroupSchema>;

/**
 * Subscription pattern confidence breakdown
 */
export const SubscriptionConfidenceBreakdownSchema = z.object({
  intervalConsistency: z.number(),
  descriptionSimilarity: z.number(),
  occurrenceCount: z.number(),
  amountConsistency: z.number(),
  paymentServicePenalty: z.number(),
});

/**
 * Subscription pattern from stream
 */
export const SubscriptionPatternSchema = z.object({
  id: z.string(),
  transactions: z.array(FireflyTransactionSchema),
  pattern: z.object({
    type: z.enum(['weekly', 'monthly', 'quarterly', 'half-year', 'yearly']),
    interval: z.number(),
    dayOfWeek: z.number().optional(),
    dayOfMonth: z.number().optional(),
    confidence: z.number(),
  }),
  minAmount: z.number(),
  maxAmount: z.number(),
  averageAmount: z.number(),
  description: z.string(),
  sourceAccount: z.string(),
  destinationAccount: z.string(),
  reasons: z.array(z.string()),
  confidenceBreakdown: SubscriptionConfidenceBreakdownSchema.optional(),
});

export type ValidatedSubscriptionPattern = z.infer<typeof SubscriptionPatternSchema>;

/**
 * Category suggestion from AI
 */
export const CategorySuggestionSchema = z.object({
  transactionId: z.string(),
  transaction: FireflyTransactionSplitSchema,
  suggestedCategoryId: z.string(),
  suggestedCategoryName: z.string(),
  confidence: z.number(),
  reasoning: z.string(),
});

export type ValidatedCategorySuggestion = z.infer<typeof CategorySuggestionSchema>;

/**
 * Tag suggestion from AI
 */
export const TagSuggestionSchema = z.object({
  transactionId: z.string(),
  transaction: FireflyTransactionSplitSchema,
  suggestedTags: z.array(
    z.object({
      tagId: z.string(),
      tagName: z.string(),
      confidence: z.number(),
      reasoning: z.string(),
    })
  ),
});

export type ValidatedTagSuggestion = z.infer<typeof TagSuggestionSchema>;

/**
 * Amazon confidence breakdown
 */
export const AmazonConfidenceBreakdownSchema = z.object({
  orderIdMatch: z.number(),
  amountMatch: z.number(),
  exactAmountBonus: z.number(),
  dateProximity: z.number(),
  itemTitleMatch: z.number(),
});

/**
 * Amazon order item
 */
export const AmazonOrderItemSchema = z.object({
  title: z.string(),
  asin: z.string(),
  quantity: z.number(),
  price: z.number(),
  discount: z.number(),
  itemUrl: z.string(),
});

/**
 * Amazon order
 */
export const AmazonOrderSchema = z.object({
  orderId: z.string(),
  orderDate: z.string(),
  totalAmount: z.number(),
  currency: z.string(),
  items: z.array(AmazonOrderItemSchema),
  orderStatus: z.string(),
  detailsUrl: z.string(),
  promotions: z.array(
    z.object({
      description: z.string(),
      amount: z.number(),
    })
  ),
  totalSavings: z.number(),
});

/**
 * Amazon match result from stream
 */
export const AmazonMatchResultSchema = z.object({
  transactionId: z.string(),
  transaction: FireflyTransactionSplitSchema,
  matchedOrder: AmazonOrderSchema.nullable(),
  matchConfidence: z.number(),
  confidenceBreakdown: AmazonConfidenceBreakdownSchema.optional(),
  suggestedDescription: z.string(),
  suggestedNotes: z.string(),
});

export type ValidatedAmazonMatchResult = z.infer<typeof AmazonMatchResultSchema>;

/**
 * PayPal confidence breakdown
 */
export const PayPalConfidenceBreakdownSchema = z.object({
  transactionCodeMatch: z.number(),
  bankReferenceMatch: z.number(),
  amountMatch: z.number(),
  exactAmountBonus: z.number(),
  dateProximity: z.number(),
  nameMatch: z.number(),
});

/**
 * PayPal transaction (simplified schema for validation)
 * Full type has many fields, we validate the critical ones
 */
export const PayPalTransactionSchema = z
  .object({
    date: z.string(),
    time: z.string(),
    timezone: z.string(),
    name: z.string(),
    type: z.string(),
    status: z.string(),
    currency: z.string(),
    gross: z.number(),
    fee: z.number(),
    net: z.number(),
    transactionCode: z.string(),
    // Allow additional fields without validation
  })
  .passthrough();

/**
 * PayPal match result from stream
 */
export const PayPalMatchResultSchema = z.object({
  transactionId: z.string(),
  transaction: FireflyTransactionSplitSchema,
  matchedPayPalTransaction: PayPalTransactionSchema.nullable(),
  matchConfidence: z.number(),
  confidenceBreakdown: PayPalConfidenceBreakdownSchema.optional(),
  suggestedDescription: z.string(),
  suggestedNotes: z.string(),
});

export type ValidatedPayPalMatchResult = z.infer<typeof PayPalMatchResultSchema>;

// =============================================================================
// Tool Status Schema
// =============================================================================

export const ToolStatusSchema = z.object({
  name: z.string(),
  available: z.boolean(),
  requiresConfig: z.array(z.string()),
  description: z.string(),
});

export type ValidatedToolStatus = z.infer<typeof ToolStatusSchema>;

// =============================================================================
// Validation Helper Functions
// =============================================================================

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Safely parse and validate data against a schema
 */
export function validateData<T>(
  schema: z.ZodType<T>,
  data: unknown,
  context?: string
): ValidationResult<T> {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errorMessage = result.error.issues
    .map((e) => `${e.path.join('.')}: ${e.message}`)
    .join(', ');

  console.warn(`[Validation${context ? ` - ${context}` : ''}] ${errorMessage}`, {
    data,
    errors: result.error.issues,
  });

  return {
    success: false,
    error: `Validation failed: ${errorMessage}`,
  };
}

/**
 * Validate data and throw on failure (for critical paths)
 */
export function validateOrThrow<T>(schema: z.ZodType<T>, data: unknown, context?: string): T {
  const result = validateData(schema, data, context);

  if (!result.success) {
    throw new Error(result.error);
  }

  return result.data!;
}

/**
 * Validate an array of items, filtering out invalid ones
 * Returns both valid items and error count
 */
export function validateArray<T>(
  schema: z.ZodType<T>,
  data: unknown[],
  context?: string
): { valid: T[]; invalidCount: number } {
  const valid: T[] = [];
  let invalidCount = 0;

  for (const item of data) {
    const result = schema.safeParse(item);
    if (result.success) {
      valid.push(result.data);
    } else {
      invalidCount++;
      console.warn(`[Validation${context ? ` - ${context}` : ''}] Invalid item:`, {
        item,
        errors: result.error.issues,
      });
    }
  }

  return { valid, invalidCount };
}

/**
 * Create a validated API request function for a specific schema
 */
export function createValidatedRequest<T>(schema: z.ZodType<T>) {
  return (data: unknown, context?: string): T => {
    return validateOrThrow(schema, data, context);
  };
}

// =============================================================================
// File Validation Utilities
// =============================================================================

/** Maximum file size in bytes (50 MB) */
export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

/** Maximum file size in megabytes */
export const MAX_FILE_SIZE_MB = 50;

/**
 * Format bytes to a human-readable string
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Validation result for file size check
 */
export interface FileSizeValidationResult {
  valid: boolean;
  error?: string;
  fileSize: number;
  fileSizeFormatted: string;
  maxSizeFormatted: string;
}

/**
 * Validate file size before processing
 *
 * @param file - The file to validate
 * @param maxSizeBytes - Maximum allowed size in bytes (default: 50MB)
 * @returns Validation result with error message if invalid
 *
 * @example
 * ```ts
 * const result = validateFileSize(file);
 * if (!result.valid) {
 *   showSnackbar(result.error!, 'error');
 *   return;
 * }
 * // Safe to process file
 * const content = await file.text();
 * ```
 */
export function validateFileSize(
  file: File,
  maxSizeBytes: number = MAX_FILE_SIZE_BYTES
): FileSizeValidationResult {
  const fileSize = file.size;
  const fileSizeFormatted = formatFileSize(fileSize);
  const maxSizeFormatted = formatFileSize(maxSizeBytes);

  if (fileSize > maxSizeBytes) {
    return {
      valid: false,
      error: `File too large (${fileSizeFormatted}). Maximum allowed size is ${maxSizeFormatted}.`,
      fileSize,
      fileSizeFormatted,
      maxSizeFormatted,
    };
  }

  return {
    valid: true,
    fileSize,
    fileSizeFormatted,
    maxSizeFormatted,
  };
}
