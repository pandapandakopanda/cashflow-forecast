import type Database from 'better-sqlite3'
import type { Server } from 'node:http'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from './app'
import { openDatabase } from './database/connection'

describe('FIN-10–FIN-15 API', () => {
  let db: Database.Database
  let server: Server
  let baseUrl: string

  beforeEach(async () => {
    db = openDatabase(':memory:')
    const app = createApp(db)
    server = app.listen(0, '127.0.0.1')
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve)
      server.once('error', reject)
    })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Expected TCP address')
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve())
      })
    }
    if (db?.open) db.close()
  })

  async function request(method: string, path: string, body?: unknown) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      ...(body === undefined ? {} : {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    })
    const text = await response.text()
    return {
      status: response.status,
      text,
      body: text ? JSON.parse(text) : undefined,
      contentType: response.headers.get('content-type'),
    }
  }

  const transaction = {
    title: 'Аптека', type: 'expense', amountCents: 12345, date: '2026-11-12',
  }

  function seedRule(id: string, startMonth = '2026-09', dayOfMonth = 31) {
    const rule = { id, title: 'Кредит', type: 'expense', amountCents: 150000, dayOfMonth, startMonth }
    db.prepare(`INSERT INTO recurring_rules (id, title, type, amountCents, dayOfMonth, startMonth)
      VALUES (@id, @title, @type, @amountCents, @dayOfMonth, @startMonth)`).run(rule)
    return rule
  }

  function seedTransaction(id: string, date: string) {
    db.prepare(`INSERT INTO transactions (id, title, type, amountCents, date)
      VALUES (@id, @title, @type, @amountCents, @date)`).run({ ...transaction, id, date })
  }

  function revision() {
    return db.prepare('SELECT revision FROM profile_state WHERE id = 1').get()
  }

  it('keeps GET health available', async () => {
    const response = await request('GET', '/api/health')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: 'ok' })
  })

  it('returns exactly the four MonthPlan fields for an empty month', async () => {
    const response = await request('GET', '/api/months/2026-11')
    expect(response.status).toBe(200)
    expect(response.contentType).toContain('application/json')
    expect(response.body).toEqual({ month: '2026-11', revision: 0, openingBalanceCents: null, operations: [] })
  })

  it.each(['2026-13', '2026-00', '2026-1', 'wrong'])('rejects invalid URL month %s', async (month) => {
    for (const method of ['GET', 'PUT']) {
      const path = method === 'GET' ? `/api/months/${month}` : `/api/months/${month}/opening-balance`
      const response = await request(method, path, method === 'PUT' ? { openingBalanceCents: 0 } : undefined)
      expect(response.status).toBe(400)
      expect(response.body).toEqual({ error: { code: 'INVALID_MONTH', message: expect.any(String), details: expect.any(Array) } })
    }
    expect(revision()).toEqual({ revision: 0 })
  })

  it('selects only one-time operations within the month and sorts by date then ID', async () => {
    for (const [id, date] of [
      ['before', '2026-10-31'], ['last', '2026-11-30'], ['b', '2026-11-01'],
      ['after', '2026-12-01'], ['a', '2026-11-01'],
    ]) seedTransaction(id!, date!)

    const response = await request('GET', '/api/months/2026-11')
    expect(response.body.operations.map((operation: { id: string }) => operation.id)).toEqual(['a', 'b', 'last'])
    for (const operation of response.body.operations) {
      expect(operation.source).toBe('oneTime')
      expect(operation).not.toHaveProperty('recurrence')
    }
    expect(revision()).toEqual({ revision: 0 })
  })

  it.each([
    ['2026-11', '2026-11-30'], ['2027-02', '2027-02-28'],
    ['2028-02', '2028-02-29'], ['2100-02', '2100-02-28'],
    ['2000-02', '2000-02-29'], ['0099-02', '0099-02-28'],
  ])('clamps day 31 to the actual last day of %s', async (month, date) => {
    seedRule('rule', '0000-01')
    const response = await request('GET', `/api/months/${month}`)
    expect(response.body.operations).toEqual([{
      id: `occ_rule_${month}`, source: 'recurring', title: 'Кредит', type: 'expense',
      amountCents: 150000, date,
      recurrence: { ruleId: 'rule', dayOfMonth: 31, startMonth: '0000-01', overridden: false },
    }])
  })

  it('includes a rule from startMonth onward and pads single digit days', async () => {
    seedRule('rule', '2026-12', 5)
    expect((await request('GET', '/api/months/2026-11')).body.operations).toEqual([])
    const first = await request('GET', '/api/months/2026-12')
    expect(first.body.operations[0].date).toBe('2026-12-05')
    expect((await request('GET', '/api/months/2027-01')).body.operations[0].date).toBe('2027-01-05')
  })

  it('applies skip only to the selected month', async () => {
    seedRule('rule')
    db.prepare("INSERT INTO recurring_exceptions (ruleId, month, action) VALUES (?, ?, 'skip')").run('rule', '2026-11')
    expect((await request('GET', '/api/months/2026-11')).body.operations).toEqual([])
    expect((await request('GET', '/api/months/2026-12')).body.operations).toHaveLength(1)
  })

  it('applies all override fields, keeps a stable ID and sorts the combined operations', async () => {
    seedRule('rule')
    const original = (await request('GET', '/api/months/2026-11')).body.operations[0]
    db.prepare(`INSERT INTO recurring_exceptions (ruleId, month, action, title, type, amountCents, date)
      VALUES (?, ?, 'override', ?, ?, ?, ?)`).run('rule', '2026-11', 'Возврат', 'income', 12345, '2026-11-02')
    seedTransaction('z', '2026-11-02')
    seedTransaction('early', '2026-11-01')
    const first = await request('GET', '/api/months/2026-11')
    const second = await request('GET', '/api/months/2026-11')
    expect(first.body).toEqual(second.body)
    expect(first.body.operations.map((operation: { id: string }) => operation.id)).toEqual(['early', original.id, 'z'])
    expect(first.body.operations[1]).toEqual({
      id: original.id, source: 'recurring', title: 'Возврат', type: 'income', amountCents: 12345,
      date: '2026-11-02',
      recurrence: { ruleId: 'rule', dayOfMonth: 31, startMonth: '2026-09', overridden: true },
    })
    const december = (await request('GET', '/api/months/2026-12')).body.operations[0]
    expect(december.title).toBe('Кредит')
    expect(december.recurrence.overridden).toBe(false)
  })

  it('stores zero, keeps monthly balances independent and uses a global revision', async () => {
    expect((await request('PUT', '/api/months/2026-11/opening-balance', { openingBalanceCents: 0 })).body)
      .toEqual({ month: '2026-11', openingBalanceCents: 0, revision: 1 })
    expect((await request('PUT', '/api/months/2026-12/opening-balance', { openingBalanceCents: -250000 })).body)
      .toEqual({ month: '2026-12', openingBalanceCents: -250000, revision: 2 })
    expect((await request('GET', '/api/months/2026-11')).body)
      .toEqual({ month: '2026-11', openingBalanceCents: 0, revision: 2, operations: [] })
    expect((await request('GET', '/api/months/2026-12')).body.openingBalanceCents).toBe(-250000)
    expect((await request('GET', '/api/months/2099-01')).body)
      .toEqual({ month: '2099-01', revision: 2, openingBalanceCents: null, operations: [] })
    expect((await request('PUT', '/api/months/2026-11/opening-balance', { openingBalanceCents: 100 })).body.revision).toBe(3)
    expect(db.prepare('SELECT COUNT(*) AS count FROM month_balances').get()).toEqual({ count: 2 })
  })

  it.each([null, 1.5, '0', 100_000_000_000, -100_000_000_000])('rejects invalid opening balance %s without changing data', async (value) => {
    await request('PUT', '/api/months/2026-11/opening-balance', { openingBalanceCents: 0 })
    const response = await request('PUT', '/api/months/2026-11/opening-balance', { openingBalanceCents: value })
    expect(response.status).toBe(422)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')
    expect(response.body.error.details).toContainEqual({ field: 'openingBalanceCents', message: expect.any(String) })
    expect((await request('GET', '/api/months/2026-11')).body).toMatchObject({ openingBalanceCents: 0, revision: 1 })
  })

  it('creates an operation with a server UUID, trims its title and exposes it in GET month', async () => {
    const created = await request('POST', '/api/transactions', { ...transaction, title: '  Аптека  ' })
    expect(created.status).toBe(201)
    expect(created.body).toEqual({ transaction: { ...transaction, id: expect.stringMatching(/^[0-9a-f-]{36}$/) }, revision: 1 })
    const second = await request('POST', '/api/transactions', transaction)
    expect(second.body.transaction.id).not.toBe(created.body.transaction.id)
    const plan = await request('GET', '/api/months/2026-11')
    expect(plan.body.revision).toBe(2)
    expect(plan.body.operations).toContainEqual({ ...created.body.transaction, source: 'oneTime' })
  })

  it.each([
    { amountCents: 0 }, { amountCents: -1 }, { amountCents: 1.5 }, { amountCents: '12345' },
    { amountCents: 100_000_000_000 }, { date: '2026-11-31' }, { date: '2026-02-29' },
    { type: 'transfer' }, { title: '   ' }, { title: 'я'.repeat(121) }, { extra: true }, { id: 'client-id' },
  ])('rejects invalid POST body %# without a write or revision increment', async (changes) => {
    const response = await request('POST', '/api/transactions', { ...transaction, ...changes })
    expect(response.status).toBe(422)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')
    expect(db.prepare('SELECT COUNT(*) AS count FROM transactions').get()).toEqual({ count: 0 })
    expect(revision()).toEqual({ revision: 0 })
  })

  it.each([{}, null, [], 42, 'text'])('rejects incomplete or non-object request body %#', async (body) => {
    const transactionResponse = await request('POST', '/api/transactions', body)
    const balanceResponse = await request('PUT', '/api/months/2026-11/opening-balance', body)
    expect(transactionResponse.status).toBe(422)
    expect(balanceResponse.status).toBe(422)
    expect(revision()).toEqual({ revision: 0 })
  })

  it('moves an updated transaction to another month without changing its ID or unspecified fields', async () => {
    const created = await request('POST', '/api/transactions', transaction)
    const id = created.body.transaction.id
    const changed = await request('PATCH', `/api/transactions/${id}`, { amountCents: 15000, date: '2026-12-02' })
    expect(changed.status).toBe(200)
    expect(changed.body).toEqual({ transaction: { ...transaction, id, amountCents: 15000, date: '2026-12-02' }, revision: 2 })
    expect((await request('GET', '/api/months/2026-11')).body.operations).toEqual([])
    expect((await request('GET', '/api/months/2026-12')).body.operations).toEqual([{ ...changed.body.transaction, source: 'oneTime' }])
    const renamed = await request('PATCH', `/api/transactions/${id}`, { title: '  Возврат  ', type: 'income' })
    expect(renamed.body.transaction).toEqual({ ...changed.body.transaction, title: 'Возврат', type: 'income' })
    expect(renamed.body.revision).toBe(3)
  })

  it.each([{}, { amountCents: 0 }, { date: '2026-11-31' }, { extra: 1 }, { id: 'new' }, null, []])(
    'rejects invalid PATCH body %# without changing the operation or revision', async (patch) => {
      const created = await request('POST', '/api/transactions', transaction)
      const id = created.body.transaction.id
      const response = await request('PATCH', `/api/transactions/${id}`, patch)
      expect(response.status).toBe(422)
      expect(response.body.error.code).toBe('VALIDATION_ERROR')
      expect(db.prepare('SELECT * FROM transactions WHERE id = ?').get(id)).toEqual(created.body.transaction)
      expect(revision()).toEqual({ revision: 1 })
    },
  )

  it('returns 404 NOT_FOUND for unknown transaction IDs', async () => {
    for (const method of ['PATCH', 'DELETE']) {
      const response = await request(method, '/api/transactions/missing', method === 'PATCH' ? { title: 'Тест' } : undefined)
      expect(response.status).toBe(404)
      expect(response.body).toEqual({ error: { code: 'NOT_FOUND', message: expect.any(String), details: [] } })
    }
    expect(revision()).toEqual({ revision: 0 })
  })

  it('deletes with an empty 204 response, updates revision and returns 404 on a second delete', async () => {
    const created = await request('POST', '/api/transactions', transaction)
    const path = `/api/transactions/${created.body.transaction.id}`
    const response = await request('DELETE', path)
    expect(response.status).toBe(204)
    expect(response.text).toBe('')
    expect(response.contentType).toBeNull()
    expect((await request('GET', '/api/months/2026-11')).body).toMatchObject({ operations: [], revision: 2 })
    expect((await request('DELETE', path)).status).toBe(404)
    expect(revision()).toEqual({ revision: 2 })
  })

  it('returns actual recurring rules, including future ones, without occurrence fields', async () => {
    expect((await request('GET', '/api/recurring-rules')).body).toEqual({ items: [] })
    const rule = seedRule('rule')
    const future = seedRule('future', '2030-01')
    const response = await request('GET', '/api/recurring-rules')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ items: [future, rule] })
    expect(revision()).toEqual({ revision: 0 })
  })

  it('returns INVALID_JSON for malformed input through the real application', async () => {
    const response = await fetch(`${baseUrl}/api/transactions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"title":',
    })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: { code: 'INVALID_JSON', message: expect.any(String), details: [] } })
    expect(revision()).toEqual({ revision: 0 })
  })

  it.each([
    ['POST', '/api/transactions', transaction],
    ['PUT', '/api/months/2026-11/opening-balance', { openingBalanceCents: 0 }],
    ['PATCH', '/api/transactions/existing', { amountCents: 999 }],
    ['DELETE', '/api/transactions/existing', undefined],
  ])('rolls back %s when the revision update fails', async (method, path, body) => {
    seedTransaction('existing', transaction.date)
    const before = db.prepare('SELECT * FROM transactions').all()
    db.exec(`CREATE TRIGGER fail_revision BEFORE UPDATE ON profile_state
      BEGIN SELECT RAISE(ABORT, 'private SQL failure'); END;`)
    const response = await request(method, path, body)
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: { code: 'INTERNAL_ERROR', message: expect.any(String), details: [] } })
    expect(response.text).not.toContain('private SQL')
    expect(db.prepare('SELECT * FROM transactions').all()).toEqual(before)
    expect(db.prepare('SELECT COUNT(*) AS count FROM month_balances').get()).toEqual({ count: 0 })
    expect(revision()).toEqual({ revision: 0 })
  })
})
