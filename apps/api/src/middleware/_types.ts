import type { ErrorsKeyType } from './errors'


export type DetailType = {
  field: string
  message: string
}

export type ErrorBodyType = {
  code: ErrorsKeyType
  message: string
  details: Array<DetailType>
}

export type ErrorDefinitionType = {
  status: number
  message: string
}
