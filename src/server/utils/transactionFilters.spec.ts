import { describe, expect, it } from 'vitest';
import type { FireflyTransaction, FireflyTransactionSplit } from '../../shared/types/firefly.js';
import {
  filterTransactionsBySplit,
  matchesTransactionFilters,
  normalizeTransactionFilters,
  serializeTransactionFilters,
} from './transactionFilters.js';

function createSplit(overrides: Partial<FireflyTransactionSplit> = {}): FireflyTransactionSplit {
  return {
    user: '1',
    transaction_journal_id: 'journal-1',
    type: 'withdrawal',
    date: '2026-01-01',
    order: 0,
    currency_id: '1',
    currency_code: 'EUR',
    currency_symbol: 'EUR',
    currency_decimal_places: 2,
    foreign_currency_id: null,
    foreign_currency_code: null,
    foreign_currency_symbol: null,
    foreign_currency_decimal_places: null,
    amount: '-25.00',
    foreign_amount: null,
    description: 'Coffee shop',
    source_id: 'src1',
    source_name: 'Checking Account',
    source_iban: null,
    source_type: 'asset',
    destination_id: 'dst1',
    destination_name: 'Cafe',
    destination_iban: null,
    destination_type: 'expense',
    budget_id: null,
    budget_name: null,
    category_id: 'cat-1',
    category_name: 'Food',
    bill_id: null,
    bill_name: null,
    reconciled: false,
    notes: null,
    tags: ['coffee', 'breakfast'],
    internal_reference: null,
    external_id: null,
    external_url: null,
    original_source: null,
    recurrence_id: null,
    recurrence_total: null,
    recurrence_count: null,
    bunq_payment_id: null,
    import_hash_v2: null,
    sepa_cc: null,
    sepa_ct_op: null,
    sepa_ct_id: null,
    sepa_db: null,
    sepa_country: null,
    sepa_ep: null,
    sepa_ci: null,
    sepa_batch_id: null,
    interest_date: null,
    book_date: null,
    process_date: null,
    due_date: null,
    payment_date: null,
    invoice_date: null,
    latitude: null,
    longitude: null,
    zoom_level: null,
    has_attachments: false,
    ...overrides,
  };
}

function createTransaction(id: string, split: FireflyTransactionSplit): FireflyTransaction {
  return {
    id,
    type: 'transactions',
    attributes: {
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
      user: '1',
      group_title: split.description,
      transactions: [split],
    },
  };
}

describe('transactionFilters', () => {
  it('normalizes invalid and empty values', () => {
    const normalized = normalizeTransactionFilters({
      types: ['withdrawal', 'withdrawal'],
      minAmount: 10,
      maxAmount: 5,
      tagTerms: [' ', ' coffee '],
      descriptionContains: '   ',
    });

    expect(normalized.types).toEqual(['withdrawal']);
    expect(normalized.minAmount).toBe(5);
    expect(normalized.maxAmount).toBe(10);
    expect(normalized.tagTerms).toEqual(['coffee']);
    expect(normalized.descriptionContains).toBeUndefined();
  });

  it('matches split by type, amount, tags, category and text fields', () => {
    const split = createSplit();

    const matches = matchesTransactionFilters(split, {
      types: ['withdrawal'],
      minAmount: 20,
      maxAmount: 30,
      tagTerms: ['cof'],
      categoryIds: ['cat-1'],
      descriptionContains: 'coffee',
      accountNameContains: 'checking',
    });

    expect(matches).toBe(true);
  });

  it('filters transactions with active filters', () => {
    const first = createTransaction('1', createSplit({ description: 'Coffee shop' }));
    const second = createTransaction(
      '2',
      createSplit({ description: 'Book store', amount: '-100' })
    );

    const filtered = filterTransactionsBySplit([first, second], {
      maxAmount: 30,
      descriptionContains: 'coffee',
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('1');
  });

  it('serializes filters deterministically', () => {
    const first = serializeTransactionFilters({
      types: ['transfer', 'withdrawal'],
      tagTerms: ['z', 'a'],
    });

    const second = serializeTransactionFilters({
      types: ['withdrawal', 'transfer'],
      tagTerms: ['a', 'z'],
    });

    expect(first).toBe(second);
  });
});
