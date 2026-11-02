import { randomUUID } from 'node:crypto'
import { db } from './db'
import { createMonthBalancesRepository } from './database/monthBalances'

import type {
  NewTransaction,
  Transaction,
  RecurringRule,
  RecurringExceptionRow,
} from './_types'

export const { getOpeningBalance, upsertOpeningBalance } = createMonthBalancesRepository(db)

export function createTransaction(data: NewTransaction): Transaction {
  const transaction = {
    ...data,
    id: randomUUID(),
  }

  const statment = db.prepare(`
    INSERT INTO transactions (id, title, type, amountCents, date)
    VALUES (@id, @title, @type, @amountCents, @date)
  `)

  statment.run(transaction)

  return transaction
}


export function getTransactionByMonth(month: string, daysInMonth: number) {

}
