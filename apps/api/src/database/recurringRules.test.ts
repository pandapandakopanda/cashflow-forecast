import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from './connection'
import { initializeSchema } from './schema'

const insertRuleSql = `INSERT INTO recurring_rules
  (id, title, type, amountCents, dayOfMonth, startMonth)
  VALUES (@id, @title, @type, @amountCents, @dayOfMonth, @startMonth)`
const insertExceptionSql = `INSERT INTO recurring_exceptions
  (ruleId, month, action, title, type, amountCents, date)
  VALUES (@ruleId, @month, @action, @title, @type, @amountCents, @date)`

describe('recurring rules, monthly exceptions and profile revision', () => {
  let db: Database.Database
  let ruleId: string

  beforeEach(() => {
    db = openDatabase(':memory:')
    initializeSchema(db)
    ruleId = randomUUID()
    db.prepare(insertRuleSql).run({
      id: ruleId,
      title: 'Кредит',
      type: 'expense',
      amountCents: 12345,
      dayOfMonth: 31,
      startMonth: '2026-09',
    })
  })

  afterEach(() => db.close())

  function skip(month = '2026-11') {
    db.prepare('INSERT INTO recurring_exceptions (ruleId, month, action) VALUES (?, ?, ?)').run(
      ruleId,
      month,
      'skip',
    )
  }

  function override(changes: Record<string, unknown> = {}) {
    return {
      ruleId,
      month: '2026-11',
      action: 'override',
      title: 'Досрочный платёж',
      type: 'expense',
      amountCents: 150000,
      date: '2026-11-20',
      ...changes,
    }
  }

  it('stores a November skip independently of December and other rules', () => {
    skip()
    expect(
      db
        .prepare('SELECT action FROM recurring_exceptions WHERE ruleId = ? AND month = ?')
        .get(ruleId, '2026-11'),
    ).toEqual({ action: 'skip' })
    expect(
      db
        .prepare('SELECT * FROM recurring_exceptions WHERE ruleId = ? AND month = ?')
        .get(ruleId, '2026-12'),
    ).toBeUndefined()
    skip('2026-12')
    const otherId = randomUUID()
    db.prepare(insertRuleSql).run({
      id: otherId,
      title: 'Зарплата',
      type: 'income',
      amountCents: 9500000,
      dayOfMonth: 10,
      startMonth: '2026-11',
    })
    db.prepare('INSERT INTO recurring_exceptions (ruleId, month, action) VALUES (?, ?, ?)').run(
      otherId,
      '2026-11',
      'skip',
    )
    expect(db.prepare('SELECT COUNT(*) AS count FROM recurring_exceptions').get()).toEqual({
      count: 3,
    })
  })

  it('stores all override fields and rejects duplicates for the same rule and month', () => {
    const exception = override()
    db.prepare(insertExceptionSql).run(exception)
    expect(db.prepare('SELECT * FROM recurring_exceptions').get()).toEqual(exception)
    expect(() => skip()).toThrow()
    expect(db.prepare('SELECT COUNT(*) AS count FROM recurring_exceptions').get()).toEqual({
      count: 1,
    })
  })

  it('cascades deletion only to exceptions belonging to the deleted rule', () => {
    skip()
    skip('2026-12')
    const otherId = randomUUID()
    db.prepare(insertRuleSql).run({
      id: otherId,
      title: 'Зарплата',
      type: 'income',
      amountCents: 1,
      dayOfMonth: 1,
      startMonth: '2026-11',
    })
    db.prepare('INSERT INTO recurring_exceptions (ruleId, month, action) VALUES (?, ?, ?)').run(
      otherId,
      '2026-11',
      'skip',
    )
    db.prepare('DELETE FROM recurring_rules WHERE id = ?').run(ruleId)
    expect(db.prepare('SELECT ruleId FROM recurring_exceptions').all()).toEqual([
      { ruleId: otherId },
    ])
  })

  it('rejects an exception without an existing rule', () => {
    expect(() => db.prepare(insertExceptionSql).run(override({ ruleId: randomUUID() }))).toThrow(
      /FOREIGN KEY/,
    )
  })

  it.each([0, 32, 1.5, null])('rejects dayOfMonth %s', (day) => {
    expect(() =>
      db.prepare('UPDATE recurring_rules SET dayOfMonth = ? WHERE id = ?').run(day, ruleId),
    ).toThrow()
  })

  it.each([1, 31])('accepts dayOfMonth boundary %s', (day) => {
    db.prepare('UPDATE recurring_rules SET dayOfMonth = ? WHERE id = ?').run(day, ruleId)
    expect(db.prepare('SELECT dayOfMonth FROM recurring_rules WHERE id = ?').get(ruleId)).toEqual({
      dayOfMonth: day,
    })
  })

  it.each([
    ['type', 'transfer'],
    ['amountCents', 0],
    ['amountCents', -1],
    ['amountCents', 1.5],
    ['amountCents', 100_000_000_000],
    ['startMonth', '2026-00'],
    ['startMonth', '2026-13'],
    ['startMonth', '2026-1'],
  ])('rejects invalid rule %s=%s', (field, value) => {
    const values = {
      id: randomUUID(),
      title: 'Тест',
      type: 'income',
      amountCents: 12345,
      dayOfMonth: 10,
      startMonth: '2026-11',
      [field as string]: value,
    }
    expect(() => db.prepare(insertRuleSql).run(values)).toThrow()
  })

  it.each(['title', 'type', 'amountCents', 'date'])('requires override field %s', (field) => {
    expect(() => db.prepare(insertExceptionSql).run(override({ [field]: null }))).toThrow()
  })

  it.each([
    { action: 'unknown' },
    { action: 'skip' },
    { type: 'transfer' },
    { amountCents: 0 },
    { amountCents: 1.5 },
    { month: '2026-13' },
    { date: '2026-12-20' },
    { date: '2026-11-31' },
    { date: '2026-11-00' },
    { date: '2026-11-2' },
    { month: '2026-02', date: '2026-02-29' },
    { month: '1900-02', date: '1900-02-29' },
  ])('rejects invalid exception %#', (changes) => {
    db.prepare('UPDATE recurring_rules SET startMonth = ? WHERE id = ?').run('0000-01', ruleId)
    expect(() => db.prepare(insertExceptionSql).run(override(changes))).toThrow()
  })

  it.each(['2024-02', '2000-02'])('accepts leap day in %s', (month) => {
    db.prepare('UPDATE recurring_rules SET startMonth = ? WHERE id = ?').run(month, ruleId)
    db.prepare(insertExceptionSql).run(override({ month, date: `${month}-29` }))
    expect(db.prepare('SELECT date FROM recurring_exceptions').get()).toEqual({
      date: `${month}-29`,
    })
  })

  it('rejects exception months before the rule starts, including updates', () => {
    expect(() => skip('2026-08')).toThrow(/startMonth/)
    skip('2026-09')
    expect(() =>
      db
        .prepare('UPDATE recurring_exceptions SET month = ? WHERE ruleId = ?')
        .run('2026-08', ruleId),
    ).toThrow(/startMonth/)
  })

  it('rejects an invalid update to a stored exception', () => {
    skip()
    expect(() =>
      db
        .prepare("UPDATE recurring_exceptions SET action = 'override' WHERE ruleId = ?")
        .run(ruleId),
    ).toThrow()
    expect(db.prepare('SELECT action FROM recurring_exceptions').get()).toEqual({ action: 'skip' })
  })

  it('initializes a single nonnegative integer revision without resetting it', () => {
    expect(db.prepare('SELECT * FROM profile_state').all()).toEqual([{ id: 1, revision: 0 }])
    db.prepare('UPDATE profile_state SET revision = revision + 1 WHERE id = 1').run()
    initializeSchema(db)
    expect(db.prepare('SELECT * FROM profile_state').all()).toEqual([{ id: 1, revision: 1 }])
    expect(() =>
      db.prepare('INSERT INTO profile_state (id, revision) VALUES (2, 0)').run(),
    ).toThrow()
    for (const value of [-1, 1.5, null]) {
      expect(() =>
        db.prepare('UPDATE profile_state SET revision = ? WHERE id = 1').run(value),
      ).toThrow()
    }
  })

  it('can update data and revision in one transaction and roll both back on failure', () => {
    expect(() =>
      db.transaction(() => {
        skip()
        db.prepare('UPDATE profile_state SET revision = revision + 1 WHERE id = 1').run()
        throw new Error('rollback')
      })(),
    ).toThrow('rollback')
    expect(db.prepare('SELECT COUNT(*) AS count FROM recurring_exceptions').get()).toEqual({
      count: 0,
    })
    expect(db.prepare('SELECT revision FROM profile_state').get()).toEqual({ revision: 0 })
  })
})
