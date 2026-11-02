import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { MonthOperation } from './_types'
import { snapshotDatabase, startTestApi } from './testUtils/api'
import type { TestApi } from './testUtils/api'

describe('FIN-21 apply scenario API', () => {
  let api: TestApi
  const month = '2026-11'
  const path = `/months/${month}/apply-scenario`
  const fields = { title: 'Аптека', type: 'expense', amountCents: 12345, date: '2026-11-12' }
  const ruleFields = { title: 'Кредит', type: 'expense', amountCents: 150000, dayOfMonth: 31, startMonth: '2026-09' }

  beforeEach(async () => { api = await startTestApi() })
  afterEach(async () => { await api?.close() })

  async function plan(selectedMonth = month) {
    return (await api.request('GET', `/months/${selectedMonth}`)).body
  }

  async function createTransaction(changes: Record<string, unknown> = {}) {
    const response = await api.request('POST', '/transactions', { ...fields, ...changes })
    expect(response.status).toBe(201)
    return response.body.transaction
  }

  async function createRule(changes: Record<string, unknown> = {}) {
    const response = await api.request('POST', '/recurring-rules', { ...ruleFields, ...changes })
    expect(response.status).toBe(201)
    return response.body.rule
  }

  function snapshotOperation(operation: MonthOperation) {
    return {
      id: operation.id, source: operation.source, title: operation.title,
      type: operation.type, amountCents: operation.amountCents, date: operation.date,
    }
  }

  it('applies a complete mixed snapshot once, keeps December unchanged and returns the GET representation', async () => {
    const kept = await createTransaction({ title: 'Оставить', date: '2026-11-05' })
    const removed = await createTransaction({ title: 'Удалить', date: '2026-11-06' })
    const outside = await createTransaction({ title: 'Декабрь', date: '2026-12-10' })
    const changedRule = await createRule()
    const skippedRule = await createRule({ title: 'Пропустить', dayOfMonth: 10 })
    const resetRule = await createRule({ title: 'Вернуть исходное' })
    const futureRule = await createRule({ title: 'Будущее', startMonth: '2026-12' })
    await api.request('PUT', `/recurring-rules/${changedRule.id}/exceptions/2026-12`, {
      action: 'override', title: 'Декабрьское исключение', type: 'income', amountCents: 999, date: '2026-12-20',
    })
    await api.request('PUT', `/recurring-rules/${resetRule.id}/exceptions/2026-11`, {
      action: 'override', title: 'Старое исключение', type: 'income', amountCents: 888, date: '2026-11-15',
    })
    const current = await plan()
    const december = await plan('2026-12')
    const rulesBefore = snapshotDatabase(api.db).rules
    const changedOccurrence = current.operations.find((operation: MonthOperation) => operation.source === 'recurring' && operation.recurrence.ruleId === changedRule.id)
    const resetOccurrence = current.operations.find((operation: MonthOperation) => operation.source === 'recurring' && operation.recurrence.ruleId === resetRule.id)
    const payload = {
      revision: current.revision,
      openingBalanceCents: -250000,
      operations: [
        { ...snapshotOperation({ ...kept, source: 'oneTime' }), title: 'Изменённая', amountCents: 500, date: '2026-11-07' },
        { ...snapshotOperation(changedOccurrence), title: 'Разовая замена', amountCents: 200000, date: '2026-11-20' },
        { ...snapshotOperation(resetOccurrence), title: resetRule.title, type: resetRule.type, amountCents: resetRule.amountCents, date: '2026-11-30' },
        { source: 'new', clientId: 'draft-1', title: '  Новая  ', type: 'income', amountCents: 12345, date: '2026-11-02' },
      ],
    }
    const response = await api.request('POST', path, payload)
    expect(response.status).toBe(200)
    expect(response.body).toEqual(await plan())
    expect(Object.keys(response.body).sort()).toEqual(['month', 'openingBalanceCents', 'operations', 'revision'])
    expect(response.body.revision).toBe(current.revision + 1)
    expect(response.body.openingBalanceCents).toBe(-250000)
    expect(response.body.operations).toHaveLength(4)
    expect(response.body.operations.map((operation: MonthOperation) => operation.date)).toEqual(['2026-11-02', '2026-11-07', '2026-11-20', '2026-11-30'])
    expect(response.body.operations[0]).toEqual({ id: expect.stringMatching(/^[0-9a-f-]{36}$/), source: 'oneTime', title: 'Новая', type: 'income', amountCents: 12345, date: '2026-11-02' })
    expect(response.body.operations[0].id).not.toBe('draft-1')
    expect(response.body.operations[1].id).toBe(kept.id)
    expect(response.body.operations[2]).toMatchObject({ id: changedOccurrence.id, recurrence: { ruleId: changedRule.id, overridden: true } })
    expect(response.body.operations[3]).toMatchObject({ id: resetOccurrence.id, recurrence: { overridden: false } })
    expect(api.db.prepare('SELECT * FROM transactions WHERE id = ?').get(removed.id)).toBeUndefined()
    expect(api.db.prepare('SELECT * FROM transactions WHERE id = ?').get(outside.id)).toEqual(outside)
    expect(api.db.prepare('SELECT action FROM recurring_exceptions WHERE ruleId = ? AND month = ?').get(skippedRule.id, month)).toEqual({ action: 'skip' })
    expect(api.db.prepare('SELECT * FROM recurring_exceptions WHERE ruleId = ? AND month = ?').get(resetRule.id, month)).toBeUndefined()
    expect(api.db.prepare('SELECT * FROM recurring_exceptions WHERE ruleId = ? AND month = ?').get(futureRule.id, month)).toBeUndefined()
    expect((await plan('2026-12')).operations).toEqual(december.operations)
    expect(snapshotDatabase(api.db).rules).toEqual(rulesBefore)
    const after = snapshotDatabase(api.db)
    const replay = await api.request('POST', path, payload)
    expect(replay.status).toBe(409)
    expect(replay.body).toEqual({ error: { code: 'REVISION_CONFLICT', message: expect.any(String), details: [] } })
    expect(snapshotDatabase(api.db)).toEqual(after)
  })

  it('accepts an empty snapshot, deletes only this month and skips its applicable rules', async () => {
    await createTransaction()
    const other = await createTransaction({ date: '2026-12-01' })
    const rule = await createRule()
    const current = await plan()
    const response = await api.request('POST', path, { revision: current.revision, openingBalanceCents: 0, operations: [] })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ month, revision: current.revision + 1, openingBalanceCents: 0, operations: [] })
    expect(api.db.prepare('SELECT * FROM transactions').all()).toEqual([other])
    expect(api.db.prepare('SELECT ruleId, month, action FROM recurring_exceptions').all()).toEqual([{ ruleId: rule.id, month, action: 'skip' }])
    expect((await plan('2026-12')).operations).toHaveLength(2)
    const again = await api.request('POST', path, { revision: response.body.revision, openingBalanceCents: 0, operations: [] })
    expect(again.status).toBe(200)
    expect(api.db.prepare('SELECT COUNT(*) AS count FROM recurring_exceptions').get()).toEqual({ count: 1 })
  })

  it('can initialize an entirely empty month with zero balance', async () => {
    const response = await api.request('POST', path, { revision: 0, openingBalanceCents: 0, operations: [] })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ month, revision: 1, openingBalanceCents: 0, operations: [] })
  })

  it('retains an existing override if the snapshot still differs from the original rule', async () => {
    const rule = await createRule()
    await api.request('PUT', `/recurring-rules/${rule.id}/exceptions/${month}`, {
      action: 'override', ...fields, title: 'Исключение', date: '2026-11-20',
    })
    const current = await plan()
    const response = await api.request('POST', path, {
      revision: current.revision, openingBalanceCents: 1, operations: current.operations.map(snapshotOperation),
    })
    expect(response.status).toBe(200)
    expect(response.body.operations).toEqual(current.operations)
    expect(response.body.operations[0].recurrence.overridden).toBe(true)
    expect(api.db.prepare('SELECT action FROM recurring_exceptions').get()).toEqual({ action: 'override' })
  })

  it('does not create exceptions for unchanged default occurrences and uses the clamped date', async () => {
    await createRule()
    const current = await plan()
    expect(current.operations[0].date).toBe('2026-11-30')
    const response = await api.request('POST', path, {
      revision: current.revision, openingBalanceCents: 0, operations: current.operations.map(snapshotOperation),
    })
    expect(response.status).toBe(200)
    expect(response.body.operations).toEqual(current.operations)
    expect(api.db.prepare('SELECT * FROM recurring_exceptions').all()).toEqual([])
  })

  it('can restore a skipped occurrence using its server-derived ID', async () => {
    const rule = await createRule()
    const original = (await plan()).operations[0]
    await api.request('PUT', `/recurring-rules/${rule.id}/exceptions/${month}`, { action: 'skip' })
    const current = await plan()
    const response = await api.request('POST', path, { revision: current.revision, openingBalanceCents: 0, operations: [snapshotOperation(original)] })
    expect(response.status).toBe(200)
    expect(response.body.operations).toEqual([original])
    expect(api.db.prepare('SELECT * FROM recurring_exceptions').all()).toEqual([])
  })

  it('checks global revision before the remaining fields and rejects changes made in another month', async () => {
    await createTransaction({ date: '2026-12-01' })
    const before = snapshotDatabase(api.db)
    const response = await api.request('POST', path, { revision: 0, openingBalanceCents: null, operations: [{}] })
    expect(response.status).toBe(409)
    expect(response.body.error.code).toBe('REVISION_CONFLICT')
    expect(snapshotDatabase(api.db)).toEqual(before)
  })

  it.each([undefined, null, -1, 0.5, '0'])('rejects invalid revision %s', async (revision) => {
    const before = snapshotDatabase(api.db)
    const response = await api.request('POST', path, { revision, openingBalanceCents: 0, operations: [] })
    expect(response.status).toBe(422)
    expect(response.body.error.details).toContainEqual({ field: 'revision', message: expect.any(String) })
    expect(snapshotDatabase(api.db)).toEqual(before)
  })

  it.each([
    { openingBalanceCents: null }, { openingBalanceCents: undefined }, { openingBalanceCents: 1.5 },
    { openingBalanceCents: '0' }, { openingBalanceCents: 100_000_000_000 },
    { operations: null }, { operations: {} }, { operations: undefined }, { extra: 1 },
  ])('rejects an invalid top-level snapshot %#', async (changes) => {
    const before = snapshotDatabase(api.db)
    const response = await api.request('POST', path, { revision: 0, openingBalanceCents: 0, operations: [], ...changes })
    expect(response.status).toBe(422)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')
    expect(snapshotDatabase(api.db)).toEqual(before)
  })

  it.each([
    { source: 'wrong' }, { clientId: '' }, { clientId: undefined }, { title: ' ' },
    { type: 'wrong' }, { amountCents: 0 }, { amountCents: 1.5 }, { date: '2026-11-31' },
    { date: '2026-12-01' }, { extra: 1 }, { id: 'not-allowed' }, { recurrence: { ruleId: 'forged' } },
  ])('rejects an invalid operation late in the snapshot %# before any writes', async (changes) => {
    const existing = await createTransaction()
    const current = await plan()
    const before = snapshotDatabase(api.db)
    const response = await api.request('POST', path, {
      revision: current.revision, openingBalanceCents: 42,
      operations: [
        { ...fields, source: 'oneTime', id: existing.id, title: 'Не сохранять' },
        { ...fields, source: 'new', clientId: 'first' },
        { ...fields, source: 'new', clientId: 'last', ...changes },
      ],
    })
    expect(response.status).toBe(422)
    expect(snapshotDatabase(api.db)).toEqual(before)
  })

  it.each(['unknown', 'outside-month', 'wrong-source', 'foreign-occurrence', 'raw-rule-id', 'future-rule', 'missing-id'])('rejects %s IDs with 422', async (kind) => {
    const oneTime = await createTransaction()
    const outside = await createTransaction({ date: '2026-12-01' })
    const rule = await createRule()
    const future = await createRule({ startMonth: '2026-12' })
    const current = await plan()
    const operations = {
      unknown: { ...fields, source: 'oneTime', id: 'missing' },
      'outside-month': { ...fields, source: 'oneTime', id: outside.id },
      'wrong-source': { ...fields, source: 'recurring', id: oneTime.id },
      'foreign-occurrence': { ...fields, source: 'recurring', id: `occ_${rule.id}_2026-12` },
      'raw-rule-id': { ...fields, source: 'recurring', id: rule.id },
      'future-rule': { ...fields, source: 'recurring', id: `occ_${future.id}_2026-11` },
      'missing-id': { ...fields, source: 'oneTime' },
    }
    const before = snapshotDatabase(api.db)
    const response = await api.request('POST', path, {
      revision: current.revision, openingBalanceCents: 0, operations: [operations[kind as keyof typeof operations]],
    })
    expect(response.status).toBe(422)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')
    expect(snapshotDatabase(api.db)).toEqual(before)
  })

  it.each(['existing', 'new', 'cross-source'])('rejects duplicate %s identifiers', async (kind) => {
    const existing = await createTransaction()
    const current = await plan()
    const oldOperation = { ...fields, id: existing.id, source: 'oneTime' }
    const newOperation = { ...fields, source: 'new', clientId: 'draft' }
    const operations = kind === 'existing' ? [oldOperation, oldOperation]
      : kind === 'new' ? [newOperation, newOperation]
        : [oldOperation, { ...newOperation, clientId: existing.id }]
    const before = snapshotDatabase(api.db)
    const response = await api.request('POST', path, { revision: current.revision, openingBalanceCents: 0, operations })
    expect(response.status).toBe(422)
    expect(response.body.error.details).toContainEqual({ field: `operations[1].${kind === 'existing' ? 'id' : 'clientId'}`, message: expect.any(String) })
    expect(snapshotDatabase(api.db)).toEqual(before)
  })

  it('reports both unknown IDs and out-of-month dates with array field paths', async () => {
    const response = await api.request('POST', path, {
      revision: 0, openingBalanceCents: 0,
      operations: [{ ...fields, source: 'oneTime', id: 'unknown', date: '2026-12-01' }],
    })
    expect(response.status).toBe(422)
    expect(response.body.error.details).toEqual(expect.arrayContaining([
      { field: 'operations[0].id', message: expect.any(String) },
      { field: 'operations[0].date', message: expect.any(String) },
    ]))
  })

  it.each(['exception-write', 'revision-update'])('rolls back all preceding mutations after a %s failure', async (failure) => {
    const kept = await createTransaction()
    await createTransaction({ title: 'Будет удалена', date: '2026-11-15' })
    await createRule()
    const current = await plan()
    const before = snapshotDatabase(api.db)
    const target = failure === 'exception-write' ? 'INSERT ON recurring_exceptions' : 'UPDATE ON profile_state'
    api.db.exec(`CREATE TRIGGER fail_scenario BEFORE ${target} BEGIN SELECT RAISE(ABORT, 'private SQL failure'); END;`)
    const response = await api.request('POST', path, {
      revision: current.revision, openingBalanceCents: -250000,
      operations: [
        { ...fields, source: 'new', clientId: 'draft' },
        { ...fields, source: 'oneTime', id: kept.id, amountCents: 777 },
      ],
    })
    expect(response.status).toBe(500)
    expect(response.body.error.code).toBe('INTERNAL_ERROR')
    expect(response.text).not.toContain('private SQL')
    expect(snapshotDatabase(api.db)).toEqual(before)
  })

  it('accepts only one of two requests using the same revision', async () => {
    const payload = { revision: 0, openingBalanceCents: 0, operations: [{ ...fields, source: 'new', clientId: 'draft' }] }
    const responses = await Promise.all([api.request('POST', path, payload), api.request('POST', path, payload)])
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409])
    expect(api.db.prepare('SELECT COUNT(*) AS count FROM transactions').get()).toEqual({ count: 1 })
    expect(api.db.prepare('SELECT revision FROM profile_state').get()).toEqual({ revision: 1 })
  })

  it('returns 400 for an invalid month before applying a snapshot', async () => {
    const before = snapshotDatabase(api.db)
    const response = await api.request('POST', '/months/2026-13/apply-scenario', { revision: 0, openingBalanceCents: 0, operations: [] })
    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('INVALID_MONTH')
    expect(snapshotDatabase(api.db)).toEqual(before)
  })
})
