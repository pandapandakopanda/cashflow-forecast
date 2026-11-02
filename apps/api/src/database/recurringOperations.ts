import type { RecurringRule, Recurrence, Transaction } from '../_types'
import { getDaysInMonth } from './calendar'

export function createRecurringOperation(rule: RecurringRule, month: string): Transaction & {
  source: 'recurring',
  recurrence: Recurrence,
} {
  const day = Math.min(rule.dayOfMonth, getDaysInMonth(month))
  return {
    id: `occ_${rule.id}_${month}`,
    source: 'recurring',
    title: rule.title,
    type: rule.type,
    amountCents: rule.amountCents,
    date: `${month}-${String(day).padStart(2, '0')}`,
    recurrence: {
      ruleId: rule.id,
      dayOfMonth: rule.dayOfMonth,
      startMonth: rule.startMonth,
      overridden: false,
    },
  }
}
