import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import type { NewTransaction } from '../_types';
import {
  amountCentsSchema,
  dateSchema,
  monthSchema,
  openingBalanceCentsSchema,
  openingBalanceSchema,
  titleSchema,
  transactionPatchSchema,
  transactionSchema,
  transactionTypeSchema,
  validate,
  validateMonthParam,
  ValidationError,
} from './index';

const transaction = { title: 'Аптека', type: 'expense', amountCents: 12345, date: '2026-11-12' };

describe('calendar values', () => {
  it.each(['2026-01', '2026-12', '0099-02'])('accepts month %s', (value) => {
    expect(validateMonthParam(value)).toBe(value);
  });

  it.each(['2026-00', '2026-13', '2026-1', '26-01', '2026-01\n', ' 2026-01', null, 202601])(
    'rejects month %s',
    (value) => {
      expect(() => validateMonthParam(value)).toThrowError(ValidationError);
      expect(() => validateMonthParam(value)).toThrowError(
        expect.objectContaining({ code: 'INVALID_MONTH' }),
      );
    },
  );

  it.each(['2024-02-29', '2000-02-29', '2026-04-30', '2026-12-31', '0096-02-29'])(
    'accepts date %s',
    (value) => {
      expect(dateSchema.safeParse(value).success).toBe(true);
    },
  );

  it.each([
    '2026-02-29',
    '1900-02-29',
    '2100-02-29',
    '2026-04-31',
    '2026-02-30',
    '2026-00-01',
    '2026-13-01',
    '2026-01-00',
    '2026-01-32',
    '2026-1-01',
    '2026-01-1',
    '2026-01-01T00:00:00Z',
    '2026-01-01\n',
    null,
  ])('rejects date %s', (value) => {
    expect(dateSchema.safeParse(value).success).toBe(false);
  });

  it('uses VALIDATION_ERROR for a month in the request body', () => {
    expect(() =>
      validate(z.strictObject({ startMonth: monthSchema }), { startMonth: '2026-13' }),
    ).toThrowError(
      expect.objectContaining({
        code: 'VALIDATION_ERROR',
        details: [{ field: 'startMonth', message: expect.any(String) }],
      }),
    );
  });
});

describe('amounts', () => {
  it.each([1, 99_999_999_999])('accepts amount boundary %s', (value) => {
    expect(amountCentsSchema.safeParse(value).success).toBe(true);
  });

  it.each([0, -1, 1.5, 100_000_000_000, NaN, Infinity, -Infinity, '100', null, undefined, true])(
    'rejects amount %s',
    (value) => {
      expect(amountCentsSchema.safeParse(value).success).toBe(false);
    },
  );

  it.each([-99_999_999_999, 0, 99_999_999_999])('accepts opening balance %s', (value) => {
    expect(openingBalanceCentsSchema.safeParse(value).success).toBe(true);
  });

  it.each([-100_000_000_000, 100_000_000_000, 0.5, '0', null, NaN, Infinity])(
    'rejects opening balance %s',
    (value) => {
      expect(openingBalanceCentsSchema.safeParse(value).success).toBe(false);
    },
  );
});

describe('type and title', () => {
  it.each(['income', 'expense'])('accepts type %s', (value) => {
    expect(transactionTypeSchema.safeParse(value).success).toBe(true);
  });

  it.each(['Income', 'transfer', '', null, 1])('rejects type %s', (value) => {
    expect(transactionTypeSchema.safeParse(value).success).toBe(false);
  });

  it('trims titles before checking their length', () => {
    expect(titleSchema.parse('  Аптека  ')).toBe('Аптека');
    expect(titleSchema.parse(` ${'я'.repeat(120)} `)).toHaveLength(120);
    expect(titleSchema.parse('я')).toBe('я');
  });

  it.each(['', ' \t\n ', 'я'.repeat(121), null, 1, {}])('rejects invalid title %#', (value) => {
    expect(titleSchema.safeParse(value).success).toBe(false);
  });
});

describe('request objects and error details', () => {
  it('validates a transaction without changing the input', () => {
    const input = { ...transaction, title: '  Аптека  ' };
    const validated: NewTransaction = validate(transactionSchema, input);
    expect(validated).toEqual(transaction);
    expect(input.title).toBe('  Аптека  ');
  });

  it.each(['title', 'type', 'amountCents', 'date'])('requires %s', (field) => {
    const input: Record<string, unknown> = { ...transaction };
    delete input[field];
    expect(transactionSchema.safeParse(input).success).toBe(false);
  });

  it('rejects unknown fields instead of stripping them', () => {
    expect(() => validate(transactionSchema, { ...transaction, extra: true })).toThrowError(
      expect.objectContaining({
        code: 'VALIDATION_ERROR',
        details: [{ field: 'extra', message: 'Неизвестное поле' }],
      }),
    );
  });

  it('reports all invalid fields using array paths from the contract', () => {
    const schema = z.strictObject({ operations: z.array(transactionSchema) });
    expect(() =>
      validate(schema, {
        operations: [transaction, { ...transaction, date: '2026-02-30', amountCents: 0 }],
      }),
    ).toThrowError(
      expect.objectContaining({
        details: expect.arrayContaining([
          { field: 'operations[1].date', message: expect.any(String) },
          { field: 'operations[1].amountCents', message: expect.any(String) },
        ]),
      }),
    );
  });

  it('accepts a partial update and rejects an empty one', () => {
    expect(validate(transactionPatchSchema, { title: '  Кредит  ' })).toEqual({ title: 'Кредит' });
    expect(transactionPatchSchema.safeParse({}).success).toBe(false);
    expect(transactionPatchSchema.safeParse({ extra: 1 }).success).toBe(false);
    expect(transactionPatchSchema.safeParse({ amountCents: 0 }).success).toBe(false);
  });

  it.each([null, [], 'text', 12])('rejects a non-object body %#', (value) => {
    expect(transactionSchema.safeParse(value).success).toBe(false);
  });

  it('requires an opening balance and rejects unknown fields', () => {
    expect(validate(openingBalanceSchema, { openingBalanceCents: 0 })).toEqual({
      openingBalanceCents: 0,
    });
    expect(openingBalanceSchema.safeParse({}).success).toBe(false);
    expect(openingBalanceSchema.safeParse({ openingBalanceCents: null }).success).toBe(false);
    expect(openingBalanceSchema.safeParse({ openingBalanceCents: 0, extra: true }).success).toBe(
      false,
    );
  });
});
