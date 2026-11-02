export enum TransactionEnum {
  INCOME = 'income',
  EXPENSE = 'expense',
}

export type TransactionTypeType = TransactionEnum

export type Transaction = {
  id: string,
  title: string,
  type: TransactionTypeType,
  amountCents: number,
  date: string,
}

export type NewTransaction = Omit<Transaction, 'id'>


export type RecurringRule = {
  id: string,
  title: string,
  type: TransactionTypeType,
  amountCents: number,
  dayOfMonth: number,
  startMonth: string,
}

export type RecurringExceptionRow = {
  ruleId: string,
  month: string,
  action: 'skip' | 'override',
  title: string | null,
  type: TransactionTypeType | null,
  amountCents: number | null,
  date: string | null,
}