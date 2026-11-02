import type Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from './connection'
import { initializeSchema } from './schema'
import { createMonthBalancesRepository } from './monthBalances'

describe('monthly opening balances', () => {
  let db: Database.Database
  let balances: ReturnType<typeof createMonthBalancesRepository>

  beforeEach(() => {
    db = openDatabase(':memory:')
    initializeSchema(db)
    balances = createMonthBalancesRepository(db)
  })

  afterEach(() => db.close())

  it('distinguishes an unset November balance from zero', () => {
    expect(balances.getOpeningBalance('2026-11')).toBeNull()
    balances.upsertOpeningBalance('2026-11', 0)
    expect(balances.getOpeningBalance('2026-11')).toBe(0)
    expect(balances.getOpeningBalance('2026-12')).toBeNull()
  })

  it('keeps November and December independent and updates without duplicate rows', () => {
    balances.upsertOpeningBalance('2026-11', 0)
    balances.upsertOpeningBalance('2026-12', -250000)
    expect(balances.getOpeningBalance('2026-11')).toBe(0)
    expect(balances.getOpeningBalance('2026-12')).toBe(-250000)

    balances.upsertOpeningBalance('2026-12', 100000)
    expect(balances.getOpeningBalance('2026-12')).toBe(100000)
    expect(balances.getOpeningBalance('2026-11')).toBe(0)
    expect(db.prepare('SELECT COUNT(*) AS count FROM month_balances').get()).toEqual({ count: 2 })
  })

  it.each([-99_999_999_999, 99_999_999_999])('supports signed boundary %s', (amount) => {
    balances.upsertOpeningBalance('2026-11', amount)
    expect(balances.getOpeningBalance('2026-11')).toBe(amount)
  })

  it.each([null, 1.5, -100_000_000_000, 100_000_000_000, '100', NaN, Infinity])(
    'rejects invalid balance %s without changing saved data',
    (amount) => {
      balances.upsertOpeningBalance('2026-11', 0)
      expect(() => balances.upsertOpeningBalance('2026-11', amount as number)).toThrow()
      expect(balances.getOpeningBalance('2026-11')).toBe(0)
    },
  )

  it.each(['2026-00', '2026-13', '2026-1', '2026-11-01', 'invalid'])(
    'rejects month %s',
    (month) => {
      expect(() => balances.getOpeningBalance(month)).toThrow()
      expect(() => balances.upsertOpeningBalance(month, 0)).toThrow()
      expect(db.prepare('SELECT COUNT(*) AS count FROM month_balances').get()).toEqual({
        count: 0,
      })
    },
  )

  it('enforces month, integer and range constraints in SQLite as well', () => {
    const insert = db.prepare(
      'INSERT INTO month_balances (month, openingBalanceCents) VALUES (?, ?)',
    )
    for (const month of ['2026-00', '2026-13', '2026-1', '2026-11-01', 'abcd-11']) {
      expect(() => insert.run(month, 0)).toThrow()
    }
    for (const amount of [null, 1.5, 'invalid', 100_000_000_000, -100_000_000_000]) {
      expect(() => insert.run('2026-11', amount)).toThrow()
    }
    insert.run('2026-11', 0)
    expect(() => insert.run('2026-11', 1)).toThrow()
    expect(balances.getOpeningBalance('2026-11')).toBe(0)
  })

  it('preserves saved balances when the migration runs again', () => {
    balances.upsertOpeningBalance('2026-11', 0)
    balances.upsertOpeningBalance('2026-12', -250000)
    initializeSchema(db)
    expect(balances.getOpeningBalance('2026-11')).toBe(0)
    expect(balances.getOpeningBalance('2026-12')).toBe(-250000)
  })

  it('adds the table to an existing database without removing its transactions', () => {
    db.exec('DROP TABLE month_balances')
    db.prepare(
      'INSERT INTO transactions (id, title, type, amountCents, date) VALUES (?, ?, ?, ?, ?)',
    ).run('existing', 'Тест', 'income', 100, '2026-11-02')
    initializeSchema(db)
    expect(balances.getOpeningBalance('2026-11')).toBeNull()
    expect(db.prepare('SELECT id FROM transactions').get()).toEqual({ id: 'existing' })
  })
})
