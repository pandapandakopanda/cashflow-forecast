import type Database from 'better-sqlite3'
import { createMonthBalancesTable } from './migrations/001-month-balances'
import { createTransactionsTable } from './migrations/002-transactions'

export function initializeSchema(db: Database.Database): void {
  db.transaction(() => {
    createTransactionsTable(db)
    createMonthBalancesTable(db)
  })()
}
