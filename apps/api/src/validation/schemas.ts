import { z } from 'zod';
import { TransactionEnum } from '../_types';

const MAX_CENTS = 99_999_999_999;

export const monthSchema = z
  .string({ error: 'Ожидается месяц в формате YYYY-MM' })
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Ожидается месяц в формате YYYY-MM');

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)) return false;

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1]!;
}

export const dateSchema = z
  .string({ error: 'Ожидается календарная дата в формате YYYY-MM-DD' })
  .refine(isCalendarDate, 'Ожидается существующая календарная дата в формате YYYY-MM-DD');

export const transactionTypeSchema = z.enum(TransactionEnum, {
  error: 'Ожидается income или expense',
});

export const amountCentsSchema = z
  .number({ error: 'Ожидается число в целых копейках' })
  .int('Ожидается целое число копеек')
  .min(1, 'Сумма должна быть больше нуля')
  .max(MAX_CENTS, 'Сумма не должна превышать 99999999999 копеек');

export const openingBalanceCentsSchema = z
  .number({ error: 'Ожидается число в целых копейках' })
  .int('Ожидается целое число копеек')
  .min(-MAX_CENTS, 'Остаток не должен быть меньше -99999999999 копеек')
  .max(MAX_CENTS, 'Остаток не должен превышать 99999999999 копеек');

export const titleSchema = z
  .string({ error: 'Ожидается строка с названием' })
  .trim()
  .min(1, 'Название не должно быть пустым')
  .max(120, 'Название не должно превышать 120 символов');

export const transactionSchema = z.strictObject({
  title: titleSchema,
  type: transactionTypeSchema,
  amountCents: amountCentsSchema,
  date: dateSchema,
});

export const transactionPatchSchema = transactionSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Передайте хотя бы одно поле операции');

export const openingBalanceSchema = z.strictObject({
  openingBalanceCents: openingBalanceCentsSchema,
});
