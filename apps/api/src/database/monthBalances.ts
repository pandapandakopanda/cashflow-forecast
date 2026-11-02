import type Database from 'better-sqlite3'
import { monthSchema, openingBalanceSchema, validate } from '../validation'

type BalanceRow = { openingBalanceCents: number }

export function createMonthBalancesRepository(db: Database.Database) {
  return {
    getOpeningBalance(month: string): number | null {
      const checkedMonth = validate(monthSchema, month)
      const row = db
        .prepare<[string], BalanceRow>(
          'SELECT openingBalanceCents FROM month_balances WHERE month = ?',
        )
        .get(checkedMonth)

      // Ноль — сохранённое значение; только отсутствие строки означает null.
      return row?.openingBalanceCents ?? null
    },

    upsertOpeningBalance(month: string, openingBalanceCents: number): void {
      const checkedMonth = validate(monthSchema, month)
      const balance = validate(openingBalanceSchema, { openingBalanceCents })
      db.prepare(
        `
        INSERT INTO month_balances (month, openingBalanceCents)
        VALUES (@month, @openingBalanceCents)
        ON CONFLICT(month) DO UPDATE
          SET openingBalanceCents = excluded.openingBalanceCents
      `,
      ).run({ month: checkedMonth, ...balance })
    },
  }
}
