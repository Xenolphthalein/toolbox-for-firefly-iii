import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import {
  dateRangeSchema,
  countTransactionsSchema,
  converterImportSchema,
  amazonMatchSchema,
  amazonApplySchema,
  paypalUploadCsvSchema,
  paypalMatchSchema,
  paypalApplySchema,
  fintsConnectSchema,
  fintsFetchSchema,
  fintsSubmitTanSchema,
  duplicateFindSchema,
  bulkDeleteSchema,
  suggestionRequestSchema,
  applySuggestionsSchema,
  subscriptionFindSchema,
  createSubscriptionSchema,
  transactionListSchema,
  transactionUpdateSchema,
  validateBody,
} from './validation.js';

describe('validation schemas', () => {
  describe('dateRangeSchema', () => {
    it('should accept valid date range', () => {
      const result = dateRangeSchema.safeParse({
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      });
      expect(result.success).toBe(true);
    });

    it('should accept empty object', () => {
      const result = dateRangeSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should reject invalid date format', () => {
      const result = dateRangeSchema.safeParse({
        startDate: '01/01/2024',
      });
      expect(result.success).toBe(false);
    });

    it('should accept YYYY-MM-DD format (regex validation only)', () => {
      // Note: The regex only validates format, not semantic validity
      // '2024-13-01' matches YYYY-MM-DD pattern even though 13 is not a valid month
      const result = dateRangeSchema.safeParse({
        startDate: '2024-13-01', // Matches format, semantic validation done elsewhere
      });
      // Regex validates format only, not semantic correctness
      expect(result.success).toBe(true);
    });
  });

  describe('countTransactionsSchema', () => {
    it('should accept valid count params', () => {
      const result = countTransactionsSchema.safeParse({
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        excludeProcessed: true,
        limit: 50,
        offset: 10,
      });
      expect(result.success).toBe(true);
    });

    it('should reject limit over 100', () => {
      const result = countTransactionsSchema.safeParse({
        limit: 150,
      });
      expect(result.success).toBe(false);
    });

    it('should reject negative offset', () => {
      const result = countTransactionsSchema.safeParse({
        offset: -1,
      });
      expect(result.success).toBe(false);
    });

    it('should accept transaction filters', () => {
      const result = countTransactionsSchema.safeParse({
        filters: {
          types: ['withdrawal'],
          minAmount: 10,
          maxAmount: 100,
          tagTerms: ['amazon'],
          categoryIds: ['cat-1'],
          descriptionContains: 'market',
          accountNameContains: 'checking',
        },
      });
      expect(result.success).toBe(true);
    });

    it('should reject maxAmount lower than minAmount', () => {
      const result = countTransactionsSchema.safeParse({
        filters: {
          minAmount: 100,
          maxAmount: 10,
        },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('converterImportSchema', () => {
    it('should accept valid import with single transaction', () => {
      const result = converterImportSchema.safeParse({
        transactions: [
          {
            type: 'withdrawal',
            date: '2024-01-15',
            amount: '100.00',
            description: 'Test transaction',
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid import with multiple transactions', () => {
      const result = converterImportSchema.safeParse({
        transactions: [
          {
            type: 'withdrawal',
            date: '2024-01-15',
            amount: '100.00',
            description: 'Transaction 1',
          },
          {
            type: 'deposit',
            date: '2024-01-16',
            amount: '50.00',
            description: 'Transaction 2',
          },
        ],
        options: {
          tags: 'imported',
          applyRules: true,
        },
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty transactions array', () => {
      const result = converterImportSchema.safeParse({
        transactions: [],
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid transaction type', () => {
      const result = converterImportSchema.safeParse({
        transactions: [
          {
            type: 'invalid',
            date: '2024-01-15',
            amount: '100.00',
            description: 'Test',
          },
        ],
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing required fields', () => {
      const result = converterImportSchema.safeParse({
        transactions: [
          {
            type: 'withdrawal',
            date: '2024-01-15',
            // missing amount and description
          },
        ],
      });
      expect(result.success).toBe(false);
    });

    it('should accept all optional fields', () => {
      const result = converterImportSchema.safeParse({
        transactions: [
          {
            type: 'withdrawal',
            date: '2024-01-15',
            amount: '100.00',
            description: 'Test transaction',
            source_name: 'Checking Account',
            destination_name: 'Shop',
            category_name: 'Groceries',
            budget_name: 'Food',
            tags: 'shopping,groceries',
            notes: 'Weekly groceries',
            currency_code: 'EUR',
            internal_reference: 'REF-001',
            external_id: 'EXT-001',
            external_url: 'https://example.com',
            sepa_cc: 'DE',
            sepa_ct_id: 'CRED123',
          },
        ],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('amazonMatchSchema', () => {
    it('should accept valid match params', () => {
      const result = amazonMatchSchema.safeParse({
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        excludeProcessed: true,
      });
      expect(result.success).toBe(true);
    });

    it('should accept empty object', () => {
      const result = amazonMatchSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  describe('amazonApplySchema', () => {
    it('should accept valid apply request', () => {
      const result = amazonApplySchema.safeParse({
        matches: [
          {
            transactionId: '123',
            journalId: '456',
            newDescription: 'Amazon Order: Widget',
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('should accept optional notes', () => {
      const result = amazonApplySchema.safeParse({
        matches: [
          {
            transactionId: '123',
            journalId: '456',
            newDescription: 'Amazon Order',
            newNotes: 'Order details here',
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty matches array', () => {
      const result = amazonApplySchema.safeParse({
        matches: [],
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing required fields', () => {
      const result = amazonApplySchema.safeParse({
        matches: [
          {
            transactionId: '123',
            // missing journalId and newDescription
          },
        ],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('paypalUploadCsvSchema', () => {
    it('should accept valid CSV content', () => {
      const result = paypalUploadCsvSchema.safeParse({
        csvContent: 'header1,header2\nvalue1,value2',
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty CSV content', () => {
      const result = paypalUploadCsvSchema.safeParse({
        csvContent: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('paypalMatchSchema', () => {
    it('should accept valid match params', () => {
      const result = paypalMatchSchema.safeParse({
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        excludeProcessed: false,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('paypalApplySchema', () => {
    it('should accept valid apply request', () => {
      const result = paypalApplySchema.safeParse({
        matches: [
          {
            transactionId: '123',
            journalId: '456',
            newDescription: 'PayPal: Shop purchase',
          },
        ],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('fintsConnectSchema', () => {
    it('should accept valid connection params', () => {
      const result = fintsConnectSchema.safeParse({
        bankCode: '12345678',
        url: 'https://fints.example.com',
        userId: 'user123',
        pin: 'secretpin',
      });
      expect(result.success).toBe(true);
    });

    it('should reject non-HTTPS URL', () => {
      const result = fintsConnectSchema.safeParse({
        bankCode: '12345678',
        url: 'http://fints.example.com',
        userId: 'user123',
        pin: 'secretpin',
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing required fields', () => {
      const result = fintsConnectSchema.safeParse({
        bankCode: '12345678',
        // missing url, userId, pin
      });
      expect(result.success).toBe(false);
    });
  });

  describe('fintsFetchSchema', () => {
    it('should accept valid fetch params', () => {
      const result = fintsFetchSchema.safeParse({
        account: {
          accountNumber: '1234567890',
          ownerName: 'John Doe',
          accountType: 'checking',
          currency: 'EUR',
          bankCode: '12345678',
        },
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid currency length', () => {
      const result = fintsFetchSchema.safeParse({
        account: {
          accountNumber: '1234567890',
          ownerName: 'John Doe',
          accountType: 'checking',
          currency: 'EURO', // Should be 3 characters
          bankCode: '12345678',
        },
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('fintsSubmitTanSchema', () => {
    it('should accept valid TAN submission', () => {
      const result = fintsSubmitTanSchema.safeParse({
        tan: '123456',
        orderRef: 'ORDER-123',
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty TAN', () => {
      const result = fintsSubmitTanSchema.safeParse({
        tan: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('duplicateFindSchema', () => {
    it('should accept valid find params', () => {
      const result = duplicateFindSchema.safeParse({
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        options: {
          dateRange: 3,
          amountTolerance: 0.01,
          includeDescriptionMatch: true,
        },
      });
      expect(result.success).toBe(true);
    });

    it('should reject dateRange over 365', () => {
      const result = duplicateFindSchema.safeParse({
        options: {
          dateRange: 400,
        },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('bulkDeleteSchema', () => {
    it('should accept valid delete request', () => {
      const result = bulkDeleteSchema.safeParse({
        transactionIds: ['1', '2', '3'],
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty array', () => {
      const result = bulkDeleteSchema.safeParse({
        transactionIds: [],
      });
      expect(result.success).toBe(false);
    });

    it('should reject more than 100 IDs', () => {
      const result = bulkDeleteSchema.safeParse({
        transactionIds: Array.from({ length: 101 }, (_, i) => String(i)),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('suggestionRequestSchema', () => {
    it('should accept valid suggestion request', () => {
      const result = suggestionRequestSchema.safeParse({
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        options: {
          maxSuggestions: 10,
          minConfidence: 0.8,
        },
      });
      expect(result.success).toBe(true);
    });

    it('should reject maxSuggestions over 50', () => {
      const result = suggestionRequestSchema.safeParse({
        options: {
          maxSuggestions: 100,
        },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('applySuggestionsSchema', () => {
    it('should accept valid apply request', () => {
      const result = applySuggestionsSchema.safeParse({
        updates: [
          {
            transactionId: '123',
            journalId: '456',
            updates: {
              category_name: 'Groceries',
              tags: ['food', 'weekly'],
            },
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty updates array', () => {
      const result = applySuggestionsSchema.safeParse({
        updates: [],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('subscriptionFindSchema', () => {
    it('should accept valid find params', () => {
      const result = subscriptionFindSchema.safeParse({
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        options: {
          minOccurrences: 3,
          minConfidence: 0.7,
        },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('createSubscriptionSchema', () => {
    it('should accept valid subscription', () => {
      const result = createSubscriptionSchema.safeParse({
        name: 'Netflix',
        amountMin: '12.99',
        amountMax: '15.99',
        date: '2024-01-15',
        repeatFreq: 'monthly',
      });
      expect(result.success).toBe(true);
    });

    it('should accept all optional fields', () => {
      const result = createSubscriptionSchema.safeParse({
        name: 'Netflix',
        amountMin: '12.99',
        amountMax: '15.99',
        date: '2024-01-15',
        repeatFreq: 'monthly',
        skip: 0,
        currencyCode: 'EUR',
        endDate: '2025-01-15',
        notes: 'Streaming subscription',
        active: true,
        createRule: true,
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid repeatFreq', () => {
      const result = createSubscriptionSchema.safeParse({
        name: 'Netflix',
        amountMin: '12.99',
        amountMax: '15.99',
        date: '2024-01-15',
        repeatFreq: 'daily', // Invalid
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing required fields', () => {
      const result = createSubscriptionSchema.safeParse({
        name: 'Netflix',
        // Missing amountMin, amountMax, date, repeatFreq
      });
      expect(result.success).toBe(false);
    });
  });

  describe('transactionListSchema', () => {
    it('should accept valid list params', () => {
      const result = transactionListSchema.safeParse({
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        type: 'withdrawal',
        page: 1,
        limit: 50,
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid type', () => {
      const result = transactionListSchema.safeParse({
        type: 'invalid-type',
      });
      expect(result.success).toBe(false);
    });

    it('should reject limit over 100', () => {
      const result = transactionListSchema.safeParse({
        limit: 200,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('transactionUpdateSchema', () => {
    it('should accept valid update request', () => {
      const result = transactionUpdateSchema.safeParse({
        journalId: '123',
        updates: {
          category_name: 'Groceries',
          tags: ['food'],
          description: 'Updated description',
          notes: 'Some notes',
        },
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing journalId', () => {
      const result = transactionUpdateSchema.safeParse({
        updates: {
          category_name: 'Groceries',
        },
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty description', () => {
      const result = transactionUpdateSchema.safeParse({
        journalId: '123',
        updates: {
          description: '', // Must be min 1 character
        },
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('validateBody middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let jsonSpy: ReturnType<typeof vi.fn>;
  let statusSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    jsonSpy = vi.fn();
    statusSpy = vi.fn().mockReturnThis();

    mockReq = {
      body: {},
    };

    mockRes = {
      status: statusSpy,
      json: jsonSpy,
    };

    mockNext = vi.fn();
  });

  it('should call next() for valid body', () => {
    mockReq.body = {
      startDate: '2024-01-01',
      endDate: '2024-01-31',
    };

    const middleware = validateBody(dateRangeSchema);
    middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(statusSpy).not.toHaveBeenCalled();
  });

  it('should return 400 for invalid body', () => {
    mockReq.body = {
      startDate: 'invalid-date',
    };

    const middleware = validateBody(dateRangeSchema);
    middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(statusSpy).toHaveBeenCalledWith(400);
    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Validation failed',
        validationErrors: expect.any(Array),
      })
    );
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should include field-level errors', () => {
    mockReq.body = {
      startDate: 'bad-date',
      endDate: 'also-bad',
    };

    const middleware = validateBody(dateRangeSchema);
    middleware(mockReq as Request, mockRes as Response, mockNext);

    const response = jsonSpy.mock.calls[0][0];
    expect(response.validationErrors.length).toBeGreaterThan(0);
    expect(response.validationErrors[0]).toHaveProperty('field');
    expect(response.validationErrors[0]).toHaveProperty('message');
  });

  it('should replace req.body with parsed data', () => {
    mockReq.body = {
      startDate: '2024-01-01',
    };

    const middleware = validateBody(dateRangeSchema);
    middleware(mockReq as Request, mockRes as Response, mockNext);

    // Body should be the parsed result
    expect(mockReq.body).toHaveProperty('startDate', '2024-01-01');
  });
});
