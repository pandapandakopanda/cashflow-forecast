import type { TransactionTypeType } from '../../_types'


export type RecurrenceType = {
  ruleId: string,
  dayOfMonth: number,
  startMonth: string,
  overridden: boolean,
}

export type OperationType = {
  id: string,
  source: 'oneTime' | 'recurring',
  title: string,
  type: TransactionTypeType,
  amountCents: number,
  date: string,
  recurrence?: RecurrenceType,
}


export type MonthDataType = {
  month: string,
  revision: number,
  openingBalanceCents: number | null,
  operations: Array<OperationType>,
}
