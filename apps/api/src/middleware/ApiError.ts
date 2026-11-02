import { ErrorsMap } from './errors'
import type { ErrorsKeyType } from './errors'
import type { DetailType } from './_types'

export class ApiError extends Error {
  constructor(
    public readonly code: ErrorsKeyType,
    public readonly details: DetailType[] = [],
  ) {
    super(ErrorsMap[code].message)
    this.name = 'ApiError'
  }
}
