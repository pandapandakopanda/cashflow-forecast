import type { z } from 'zod'
import type { DetailType } from '../middleware/_types'
import { Errors } from '../middleware/errors'
import { monthSchema } from './schemas'

export * from './schemas'

export class ValidationError extends Error {
  constructor(
    public readonly details: DetailType[],
    public readonly code: Errors.VALIDATION_ERROR | Errors.INVALID_MONTH = Errors.VALIDATION_ERROR,
  ) {
    super(code === Errors.INVALID_MONTH ? 'Неверный месяц в URL' : 'Ошибка валидации')
    this.name = 'ValidationError'
  }
}

function fieldPath(path: PropertyKey[]): string {
  return path.reduce<string>((result, part) => {
    if (typeof part === 'number') return `${result}[${part}]`
    return result ? `${result}.${String(part)}` : String(part)
  }, '')
}

// Возвращает проверенные данные; при ошибке выбрасывает ошибку для errorHandler.
export function validate<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (result.success) return result.data

  const details = result.error.issues.flatMap((issue): DetailType[] => {
    if (issue.code === 'unrecognized_keys') {
      return issue.keys.map((key) => ({
        field: fieldPath([...issue.path, key]),
        message: 'Неизвестное поле',
      }))
    }
    return [{ field: fieldPath(issue.path), message: issue.message }]
  })
  throw new ValidationError(details)
}

// INVALID_MONTH относится только к сегменту URL; месяц в теле проверяется через validate.
export function validateMonthParam(input: unknown): string {
  const result = monthSchema.safeParse(input)
  if (result.success) return result.data
  throw new ValidationError(
    [{ field: 'month', message: 'Ожидается месяц в формате YYYY-MM' }],
    Errors.INVALID_MONTH,
  )
}
