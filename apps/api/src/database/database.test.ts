import { mkdtempSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import type Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from './connection'
import { initializeSchema } from './schema'
import { createMonthBalancesRepository } from './monthBalances'

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
      .run('test', 'Тест', 'income', 100, '2026-11-02')
    initializeSchema(first)
    first.close()

    const second = connect(filename)
    initializeSchema(second)
    expect(second.prepare('SELECT * FROM transactions').all()).toEqual([
      { id: 'test', title: 'Тест', type: 'income', amountCents: 100, date: '2026-11-02' },
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
