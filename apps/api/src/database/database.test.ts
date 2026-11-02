import { mkdtempSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import type Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from './connection'
import { initializeSchema } from './schema'
import { createMonthBalancesRepository } from './monthBalances'
import { createStorage } from '../storage'

describe('SQLite initialization', () => {
  let directory: string
  const connections: Database.Database[] = []

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'cashflow-db-test-'))
  })

  afterEach(() => {
    for (const connection of connections.splice(0)) {
      if (connection.open) connection.close()
    }
    if (
      dirname(resolve(directory)) !== resolve(tmpdir()) ||
      !basename(directory).startsWith('cashflow-db-test-')
    ) {
      throw new Error('Unexpected temporary database directory')
    }
    rmSync(directory, { recursive: true, force: true })
  })

  function connect(filename: string): Database.Database {
    const connection = openDatabase(filename)
    connections.push(connection)
    return connection
  }

  it('creates the configured file and missing parent directories', () => {
    const filename = join(directory, 'nested', 'data', 'cashflow.sqlite')
    const db = connect(filename)
    initializeSchema(db)

    expect(existsSync(filename)).toBe(true)
    expect(db.name).toBe(filename)
    expect(
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'transactions'")
        .get(),
    ).toEqual({ name: 'transactions' })
  })

  it('preserves records after reopening and repeated schema initialization', () => {
    const filename = join(directory, 'cashflow.sqlite')
    const first = connect(filename)
    initializeSchema(first)
    first
      .prepare(
        'INSERT INTO transactions (id, title, type, amountCents, date) VALUES (?, ?, ?, ?, ?)',
      )
      .run('test', 'Тест', 'income', 12345, '2026-11-02')
    initializeSchema(first)
    first.close()

    const second = connect(filename)
    initializeSchema(second)
    expect(second.prepare('SELECT * FROM transactions').all()).toEqual([
      { id: 'test', title: 'Тест', type: 'income', amountCents: 12345, date: '2026-11-02' },
    ])
  })

  it('preserves November zero and December balance after reopening the file', () => {
    const filename = join(directory, 'balances.sqlite')
    const first = connect(filename)
    initializeSchema(first)
    const balances = createMonthBalancesRepository(first)
    balances.upsertOpeningBalance('2026-11', 0)
    balances.upsertOpeningBalance('2026-12', -250000)
    first.close()

    const second = connect(filename)
    initializeSchema(second)
    const reopened = createMonthBalancesRepository(second)
    expect(reopened.getOpeningBalance('2026-11')).toBe(0)
    expect(reopened.getOpeningBalance('2026-12')).toBe(-250000)
    expect(reopened.getOpeningBalance('2027-01')).toBeNull()
  })

  it('preserves a recurring rule, its exception and profile revision after reopening', () => {
    const filename = join(directory, 'recurring.sqlite')
    const first = connect(filename)
    initializeSchema(first)
    first
      .prepare(
        `INSERT INTO recurring_rules (id, title, type, amountCents, dayOfMonth, startMonth)
      VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run('rule', 'Кредит', 'expense', 12345, 31, '2026-09')
    first
      .prepare(`INSERT INTO recurring_exceptions (ruleId, month, action) VALUES (?, ?, ?)`)
      .run('rule', '2026-11', 'skip')
    first.prepare('UPDATE profile_state SET revision = 7 WHERE id = 1').run()
    first.close()

    const second = connect(filename)
    initializeSchema(second)
    expect(second.prepare('SELECT id, amountCents FROM recurring_rules').get()).toEqual({
      id: 'rule',
      amountCents: 12345,
    })
    expect(second.prepare('SELECT month, action FROM recurring_exceptions').all()).toEqual([
      { month: '2026-11', action: 'skip' },
    ])
    expect(second.prepare('SELECT revision FROM profile_state WHERE id = 1').get()).toEqual({
      revision: 7,
    })
  })

  it('preserves API mutations and their global revision after reopening', () => {
    const filename = join(directory, 'api.sqlite')
    const first = connect(filename)
    initializeSchema(first)
    const storage = createStorage(first)
    const created = storage.createTransaction({
      title: 'Аптека', type: 'expense', amountCents: 12345, date: '2026-11-12',
    })
    const deleted = storage.createTransaction({
      title: 'Удалить', type: 'income', amountCents: 1, date: '2026-11-13',
    })
    storage.updateTransaction(created.transaction.id, { date: '2026-12-02' })
    storage.deleteTransaction(deleted.transaction.id)
    storage.setOpeningBalance('2026-11', { openingBalanceCents: 0 })
    storage.setOpeningBalance('2026-12', { openingBalanceCents: -250000 })
    first.close()

    const second = connect(filename)
    initializeSchema(second)
    const reopened = createStorage(second)
    expect(reopened.getMonthPlan('2026-11')).toEqual({
      month: '2026-11', revision: 6, openingBalanceCents: 0, operations: [],
    })
    expect(reopened.getMonthPlan('2026-12')).toEqual({
      month: '2026-12', revision: 6, openingBalanceCents: -250000,
      operations: [{ ...created.transaction, date: '2026-12-02', source: 'oneTime' }],
    })
  }, 30_000) // Several durable SQLite commits can exceed 5 seconds on Windows.

  it('preserves rule mutations, monthly exceptions and an applied scenario after reopening', () => {
    const filename = join(directory, 'scenario.sqlite')
    const first = connect(filename)
    initializeSchema(first)
    const storage = createStorage(first)
    const created = storage.createRecurringRule({
      title: 'Кредит', type: 'expense', amountCents: 150000, dayOfMonth: 10, startMonth: '2026-11',
    })
    const ruleId = created.rule.id
    storage.updateRecurringRule(ruleId, { dayOfMonth: 31 })
    storage.setRecurringException(ruleId, '2026-11', { action: 'skip' })
    storage.deleteRecurringException(ruleId, '2026-11')
    storage.setRecurringException(ruleId, '2026-12', { action: 'skip' })

    const removed = storage.createRecurringRule({
      title: 'Удалить', type: 'income', amountCents: 1, dayOfMonth: 1, startMonth: '2026-11',
    })
    storage.setRecurringException(removed.rule.id, '2026-11', { action: 'skip' })
    storage.deleteRecurringRule(removed.rule.id)

    const current = storage.getMonthPlan('2026-11')
    const saved = storage.applyScenario('2026-11', {
      revision: current.revision,
      openingBalanceCents: 0,
      operations: [
        { source: 'recurring', id: `occ_${ruleId}_2026-11`, title: 'Разовая замена', type: 'expense', amountCents: 12345, date: '2026-11-20' },
        { source: 'new', clientId: 'draft', title: 'Новая', type: 'income', amountCents: 100, date: '2026-11-02' },
      ],
    })
    expect(saved.revision).toBe(current.revision + 1)
    first.close()

    const second = connect(filename)
    initializeSchema(second)
    const reopened = createStorage(second)
    expect(reopened.getMonthPlan('2026-11')).toEqual(saved)
    expect(reopened.getMonthPlan('2026-12').operations).toEqual([])
    expect(reopened.getRecurringRules()).toEqual([{ ...created.rule, dayOfMonth: 31 }])
    expect(second.prepare('SELECT * FROM recurring_exceptions WHERE ruleId = ?').all(removed.rule.id)).toEqual([])
  }, 30_000)

  it('enforces foreign keys on every connection', () => {
    for (const filename of [join(directory, 'cashflow.sqlite'), ':memory:']) {
      const db = connect(filename)
      expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
      db.exec(
        'CREATE TABLE parents (id INTEGER PRIMARY KEY); CREATE TABLE children (parent_id INTEGER REFERENCES parents(id));',
      )
      expect(() => db.prepare('INSERT INTO children (parent_id) VALUES (?)').run(123)).toThrow(
        /FOREIGN KEY/,
      )
    }
  })

  it.each(['', '   '])('rejects an empty database path %j', (filename) => {
    expect(() => openDatabase(filename)).toThrow('DATABASE_PATH не должен быть пустым')
  })
})
