import type Database from 'better-sqlite3'

export function createMonthBalancesTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS month_balances (
      month TEXT PRIMARY KEY NOT NULL
        CHECK (
          length(month) = 7
          AND month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'
          AND substr(month, 6, 2) BETWEEN '01' AND '12'
        ),
      openingBalanceCents INTEGER NOT NULL
        CHECK (openingBalanceCents BETWEEN -99999999999 AND 99999999999)
    ) STRICT
  `)
}
