type OperationFields = {
  id: string,
  title: string,
  type: 'income' | 'expense',
  amountCents: number,
  date: string,
}

export type MonthOperation = OperationFields & (
  | {
    source: 'oneTime',
  }
  | {
    source: 'recurring',
    recurrence: {
      ruleId: string,
      dayOfMonth: number,
      startMonth: string,
      overridden: boolean,
    },
  }
)

export type MonthPlan = {
  month: string,
  revision: number,
  openingBalanceCents: number | null,
  operations: MonthOperation[],
}