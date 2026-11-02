import type Database from 'better-sqlite3'
import { createMonthBalancesTable } from './migrations/001-month-balances'
import { createTransactionsTable } from './migrations/002-transactions'
import { createRecurringRulesTables } from './migrations/003-recurring-rules'
import { createProfileStateTable } from './migrations/004-profile-revision'

export function initializeSchema(db: Database.Database): void {
  db.transaction(() => {
    createTransactionsTable(db)
    createMonthBalancesTable(db)
    createRecurringRulesTables(db)
    createProfileStateTable(db)
  })()
}
