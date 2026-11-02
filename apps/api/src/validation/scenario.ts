import { z } from 'zod'
import { openingBalanceCentsSchema, transactionSchema } from './schemas'

export const revisionSchema = z.number({ error: 'Ожидается целая неотрицательная версия профиля' })
  .int().min(0)

// Сначала проверяем только revision; полный снимок проверяется после сравнения версий.
export const scenarioRevisionSchema = z.object({ revision: revisionSchema })

const identifierSchema = z.string().min(1, 'Идентификатор не должен быть пустым')

export const scenarioSchema = z.strictObject({
  revision: revisionSchema,
  openingBalanceCents: openingBalanceCentsSchema,
  operations: z.array(z.discriminatedUnion('source', [
    transactionSchema.extend({ source: z.literal('oneTime'), id: identifierSchema }),
    transactionSchema.extend({ source: z.literal('recurring'), id: identifierSchema }),
    transactionSchema.extend({ source: z.literal('new'), clientId: identifierSchema }),
  ])),
})
