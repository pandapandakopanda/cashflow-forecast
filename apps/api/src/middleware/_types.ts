export type DetailType = {
  field: string
  message: string
}

export type ErrorBodyType = {
  code: import('./errors').ErrorsKeyType
  message: string
  details: Array<DetailType>
}

export type ErrorDefinitionType = {
  status: number
  message: string
}
