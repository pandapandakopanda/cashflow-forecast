import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from './connection'
import { initializeSchema } from './schema'

const insertSql =
  'INSERT INTO transactions (id, title, type, amountCents, date) VALUES (?, ?, ?, ?, ?)'

describe('transactions table', () => {
  let db: Database.Database

  beforeEach(() => {
    db = openDatabase(':memory:')
    initializeSchema(db)
  })

  afterEach(() => db.close())

  it.each(['income', 'expense'])(
    'inserts, reads and deletes an %s record without rounding',
    (type) => {
      const id = randomUUID()
      const record = { id, title: 'Тест', type, amountCents: 12345, date: '2026-11-12' }
      db.prepare(insertSql).run(id, record.title, type, record.amountCents, record.date)
      expect(db.prepare('SELECT * FROM transactions WHERE id = ?').get(id)).toEqual(record)
      expect(
        db
          .prepare('SELECT typeof(amountCents) AS storageType FROM transactions WHERE id = ?')
          .get(id),
      ).toEqual({ storageType: 'integer' })

      expect(db.prepare('DELETE FROM transactions WHERE id = ?').run(id).changes).toBe(1)
      expect(db.prepare('SELECT * FROM transactions WHERE id = ?').get(id)).toBeUndefined()
    },
  )

  it.each(['transfer', 'INCOME', '', null])('rejects invalid type %s', (type) => {
    expect(() =>
      db.prepare(insertSql).run(randomUUID(), 'Тест', type, 12345, '2026-11-12'),
    ).toThrow()
    expect(db.prepare('SELECT COUNT(*) AS count FROM transactions').get()).toEqual({ count: 0 })
  })

  it.each([0, -1, 1.5, 100_000_000_000, null, 'invalid'])('rejects invalid amount %s', (amount) => {
    expect(() =>
      db.prepare(insertSql).run(randomUUID(), 'Тест', 'income', amount, '2026-11-12'),
    ).toThrow()
  })

  it.each([1, 99_999_999_999])('accepts amount boundary %s', (amount) => {
    const id = randomUUID()
    db.prepare(insertSql).run(id, 'Тест', 'income', amount, '2026-11-12')
    expect(db.prepare('SELECT amountCents FROM transactions WHERE id = ?').get(id)).toEqual({
      amountCents: amount,
    })
  })

  it('rejects missing and duplicate IDs', () => {
    const insert = db.prepare(insertSql)
    expect(() => insert.run(null, 'Тест', 'income', 12345, '2026-11-12')).toThrow()
    const id = randomUUID()
    insert.run(id, 'Тест', 'income', 12345, '2026-11-12')
    expect(() => insert.run(id, 'Дубликат', 'expense', 100, '2026-11-13')).toThrow()
  })

  it('rejects invalid updates without changing the saved record', () => {
    const id = randomUUID()
    db.prepare(insertSql).run(id, 'Тест', 'income', 12345, '2026-11-12')
    expect(() =>
      db.prepare('UPDATE transactions SET amountCents = ? WHERE id = ?').run(1.5, id),
    ).toThrow()
    expect(() =>
      db.prepare('UPDATE transactions SET type = ? WHERE id = ?').run('transfer', id),
    ).toThrow()
    expect(db.prepare('SELECT amountCents, type FROM transactions WHERE id = ?').get(id)).toEqual({
      amountCents: 12345,
      type: 'income',
    })
  })

  it('creates an index usable for a calendar-month date range', () => {
    expect(db.prepare("PRAGMA index_info('transactions_date_idx')").all()).toEqual([
      { seqno: 0, cid: 4, name: 'date' },
    ])
    const plan = db
      .prepare('EXPLAIN QUERY PLAN SELECT * FROM transactions WHERE date >= ? AND date < ?')
      .all('2026-11-01', '2026-12-01') as { detail: string }[]
    expect(plan.some((step) => step.detail.includes('transactions_date_idx'))).toBe(true)
  })
})

it('upgrades the earlier transactions table without losing records', () => {
  const db = openDatabase(':memory:')
  try {
    db.exec(`
      CREATE TABLE transactions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
        amountCents INTEGER NOT NULL CHECK (amountCents BETWEEN 1 AND 99999999999),
        date TEXT NOT NULL
      )
    `)
    const id = randomUUID()
    db.prepare(insertSql).run(id, 'Тест', 'income', 12345, '2026-11-12')
    initializeSchema(db)
    initializeSchema(db)

    expect(db.prepare('SELECT id, amountCents FROM transactions').all()).toEqual([
      { id, amountCents: 12345 },
    ])
    expect(() =>
      db.prepare(insertSql).run(randomUUID(), 'Тест', 'income', 1.5, '2026-11-12'),
    ).toThrow()
    expect(() => db.prepare(insertSql).run(null, 'Тест', 'income', 1, '2026-11-12')).toThrow()
    expect(() =>
      db.prepare('UPDATE transactions SET amountCents = 1.5 WHERE id = ?').run(id),
    ).toThrow()
    expect(db.prepare("PRAGMA index_info('transactions_date_idx')").all()).toHaveLength(1)
  } finally {
    db.close()
  }
})
