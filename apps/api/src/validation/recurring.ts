import { z } from 'zod'
import { amountCentsSchema, dateSchema, monthSchema, titleSchema, transactionTypeSchema } from './schemas'

export const recurringRuleSchema = z.strictObject({
  title: titleSchema,
  type: transactionTypeSchema,
  amountCents: amountCentsSchema,
  dayOfMonth: z.number({ error: 'Ожидается целый день месяца от 1 до 31' })
    .int().min(1).max(31),
  startMonth: monthSchema,
})

export const recurringRulePatchSchema = recurringRuleSchema.partial()
  .refine((value) => Object.keys(value).length > 0, 'Передайте хотя бы одно поле правила')

export const recurringExceptionSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('skip') }),
  z.strictObject({
    action: z.literal('override'),
    title: titleSchema,
    type: transactionTypeSchema,
    amountCents: amountCentsSchema,
    date: dateSchema,
  }),
])
