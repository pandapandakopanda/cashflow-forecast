import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { snapshotDatabase, startTestApi } from './testUtils/api'
import type { TestApi } from './testUtils/api'

describe('FIN-16–FIN-20 recurring API', () => {
  let api: TestApi
  const ruleData = { title: 'Зарплата', type: 'income', amountCents: 6000000, dayOfMonth: 10, startMonth: '2026-11' }
  const override = { action: 'override', title: 'Досрочный платёж', type: 'expense', amountCents: 150000, date: '2026-11-20' }

  beforeEach(async () => { api = await startTestApi() })
  afterEach(async () => { await api?.close() })

  async function createRule() {
    const response = await api.request('POST', '/recurring-rules', ruleData)
    expect(response.status).toBe(201)
    return response.body.rule
  }

  async function monthOperations(month: string) {
    return (await api.request('GET', `/months/${month}`)).body.operations
  }

  it('creates a server UUID, trims title and starts occurrences in the requested month', async () => {
    const response = await api.request('POST', '/recurring-rules', { ...ruleData, title: '  Зарплата  ' })
    expect(response.status).toBe(201)
    expect(response.body).toEqual({ rule: { ...ruleData, id: expect.stringMatching(/^[0-9a-f-]{36}$/) }, revision: 1 })
    expect(await monthOperations('2026-10')).toEqual([])
    expect((await monthOperations('2026-11'))[0]).toMatchObject({ date: '2026-11-10', recurrence: { ruleId: response.body.rule.id } })
    expect((await monthOperations('2026-12'))[0].date).toBe('2026-12-10')
    expect((await api.request('GET', '/recurring-rules')).body).toEqual({ items: [response.body.rule] })
  })

  it.each([
    { dayOfMonth: 0 }, { dayOfMonth: 32 }, { dayOfMonth: 1.5 }, { dayOfMonth: '10' },
    { amountCents: 0 }, { amountCents: -1 }, { amountCents: 1.5 }, { amountCents: 100_000_000_000 },
    { startMonth: '2026-13' }, { startMonth: '2026-1' }, { title: ' ' }, { type: 'other' },
    { extra: 1 }, { id: 'client-id' },
  ])('rejects invalid rule creation %# without changing the database', async (changes) => {
    const before = snapshotDatabase(api.db)
    const response = await api.request('POST', '/recurring-rules', { ...ruleData, ...changes })
    expect(response.status).toBe(422)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')
    expect(snapshotDatabase(api.db)).toEqual(before)
  })

  it.each(['title', 'type', 'amountCents', 'dayOfMonth', 'startMonth'])('requires rule field %s', async (field) => {
    const body: Record<string, unknown> = { ...ruleData }
    delete body[field]
    expect((await api.request('POST', '/recurring-rules', body)).status).toBe(422)
  })

  it('updates rule settings across all its months and preserves ID and unspecified fields', async () => {
    const rule = await createRule()
    const originalId = (await monthOperations('2026-11'))[0].id
    const response = await api.request('PATCH', `/recurring-rules/${rule.id}`, { dayOfMonth: 15 })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ rule: { ...rule, dayOfMonth: 15 }, revision: 2 })
    expect((await monthOperations('2026-11'))[0]).toMatchObject({ id: originalId, date: '2026-11-15' })
    expect((await monthOperations('2026-12'))[0].date).toBe('2026-12-15')
    const changed = await api.request('PATCH', `/recurring-rules/${rule.id}`, {
      title: '  Кредит  ', type: 'expense', amountCents: 12345, dayOfMonth: 31, startMonth: '2026-12',
    })
    expect(changed.body).toEqual({ rule: { id: rule.id, title: 'Кредит', type: 'expense', amountCents: 12345, dayOfMonth: 31, startMonth: '2026-12' }, revision: 3 })
    expect(await monthOperations('2026-11')).toEqual([])
    expect((await monthOperations('2027-02'))[0].date).toBe('2027-02-28')
  })

  it.each([{}, { dayOfMonth: 0 }, { dayOfMonth: 32 }, { startMonth: '2026-13' }, { amountCents: 0 }, { id: 'replace' }, { extra: true }, null, []])(
    'rejects invalid rule PATCH %#', async (body) => {
      const rule = await createRule()
      const before = snapshotDatabase(api.db)
      const response = await api.request('PATCH', `/recurring-rules/${rule.id}`, body)
      expect(response.status).toBe(422)
      expect(snapshotDatabase(api.db)).toEqual(before)
    },
  )

  it('returns 404 for unknown rules or exceptions without changing revision', async () => {
    const before = snapshotDatabase(api.db)
    for (const [method, path, body] of [
      ['PATCH', '/recurring-rules/missing', { dayOfMonth: 15 }],
      ['DELETE', '/recurring-rules/missing', undefined],
      ['PUT', '/recurring-rules/missing/exceptions/2026-11', { action: 'skip' }],
      ['DELETE', '/recurring-rules/missing/exceptions/2026-11', undefined],
    ] as const) {
      const response = await api.request(method, path, body)
      expect(response.status).toBe(404)
      expect(response.body).toEqual({ error: { code: 'NOT_FOUND', message: expect.any(String), details: [] } })
    }
    expect(snapshotDatabase(api.db)).toEqual(before)
    const rule = await createRule()
    expect((await api.request('DELETE', `/recurring-rules/${rule.id}/exceptions/2026-11`)).status).toBe(404)
  })

  it('upserts skip and override, returns only contract fields and leaves December unchanged', async () => {
    const rule = await createRule()
    const path = `/recurring-rules/${rule.id}/exceptions/2026-11`
    const originalId = (await monthOperations('2026-11'))[0].id
    const december = await monthOperations('2026-12')
    const skipped = await api.request('PUT', path, { action: 'skip' })
    expect(skipped.status).toBe(200)
    expect(skipped.body).toEqual({ exception: { ruleId: rule.id, month: '2026-11', action: 'skip' }, revision: 2 })
    expect(await monthOperations('2026-11')).toEqual([])
    const overridden = await api.request('PUT', path, { ...override, title: '  Досрочный платёж  ' })
    expect(overridden.body).toEqual({ exception: { ruleId: rule.id, month: '2026-11', ...override }, revision: 3 })
    expect((await monthOperations('2026-11'))[0]).toMatchObject({
      id: originalId, title: override.title, type: override.type, amountCents: override.amountCents, date: override.date,
      recurrence: { overridden: true, dayOfMonth: 10, startMonth: '2026-11' },
    })
    expect(await monthOperations('2026-12')).toEqual(december)
    expect((await api.request('GET', '/recurring-rules')).body.items).toEqual([rule])
    await api.request('PUT', path, { action: 'skip' })
    expect(api.db.prepare('SELECT * FROM recurring_exceptions').all()).toEqual([
      { ruleId: rule.id, month: '2026-11', action: 'skip', title: null, type: null, amountCents: null, date: null },
    ])
  })

  it.each([
    { action: 'unknown' }, { action: 'skip', title: 'extra' }, {}, null,
    { action: 'override' }, { ...override, title: null }, { ...override, amountCents: 0 },
    { ...override, date: '2026-12-20' }, { ...override, date: '2026-11-31' }, { ...override, extra: true },
  ])('rejects invalid exception %# without replacing its previous value', async (body) => {
    const rule = await createRule()
    const path = `/recurring-rules/${rule.id}/exceptions/2026-11`
    await api.request('PUT', path, { action: 'skip' })
    const before = snapshotDatabase(api.db)
    const response = await api.request('PUT', path, body)
    expect(response.status).toBe(422)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')
    expect(snapshotDatabase(api.db)).toEqual(before)
  })

  it('rejects an exception before startMonth and malformed month segments', async () => {
    const rule = await createRule()
    const before = snapshotDatabase(api.db)
    const early = await api.request('PUT', `/recurring-rules/${rule.id}/exceptions/2026-10`, { action: 'skip' })
    expect(early.status).toBe(422)
    expect(early.body.error.details).toContainEqual({ field: 'month', message: expect.any(String) })
    for (const method of ['PUT', 'DELETE']) {
      const response = await api.request(method, `/recurring-rules/${rule.id}/exceptions/2026-13`, method === 'PUT' ? { action: 'skip' } : undefined)
      expect(response.status).toBe(400)
      expect(response.body.error.code).toBe('INVALID_MONTH')
    }
    expect(snapshotDatabase(api.db)).toEqual(before)
  })

  it.each(['skip', 'override'])('deleting %s restores the default occurrence with the same ID', async (action) => {
    const rule = await createRule()
    const original = await monthOperations('2026-11')
    const december = await monthOperations('2026-12')
    const path = `/recurring-rules/${rule.id}/exceptions/2026-11`
    await api.request('PUT', path, action === 'skip' ? { action } : override)
    const deleted = await api.request('DELETE', path)
    expect(deleted.status).toBe(204)
    expect(deleted.text).toBe('')
    expect(deleted.contentType).toBeNull()
    expect(await monthOperations('2026-11')).toEqual(original)
    expect(await monthOperations('2026-12')).toEqual(december)
    expect((await api.request('DELETE', path)).status).toBe(404)
    expect(api.db.prepare('SELECT revision FROM profile_state').get()).toEqual({ revision: 3 })
  })

  it('deletes a rule and its exceptions in multiple months without affecting another rule', async () => {
    const rule = await createRule()
    const other = await createRule()
    await api.request('PUT', `/recurring-rules/${rule.id}/exceptions/2026-11`, override)
    await api.request('PUT', `/recurring-rules/${rule.id}/exceptions/2026-12`, { action: 'skip' })
    const response = await api.request('DELETE', `/recurring-rules/${rule.id}`)
    expect(response.status).toBe(204)
    expect(response.text).toBe('')
    expect(api.db.prepare('SELECT * FROM recurring_exceptions WHERE ruleId = ?').all(rule.id)).toEqual([])
    expect((await api.request('GET', '/recurring-rules')).body.items).toEqual([other])
    for (const month of ['2026-11', '2026-12']) {
      const operations = await monthOperations(month)
      expect(operations).toHaveLength(1)
      expect(operations[0].recurrence.ruleId).toBe(other.id)
    }
    expect((await api.request('DELETE', `/recurring-rules/${rule.id}`)).status).toBe(404)
    expect(api.db.prepare('SELECT revision FROM profile_state').get()).toEqual({ revision: 5 })
  })

  it('keeps a monthly override while changing the rule used in other months', async () => {
    const rule = await createRule()
    await api.request('PUT', `/recurring-rules/${rule.id}/exceptions/2026-11`, override)
    await api.request('PATCH', `/recurring-rules/${rule.id}`, { dayOfMonth: 15, amountCents: 999 })
    expect((await monthOperations('2026-11'))[0]).toMatchObject({ amountCents: 150000, date: '2026-11-20', recurrence: { dayOfMonth: 15 } })
    expect((await monthOperations('2026-12'))[0]).toMatchObject({ amountCents: 999, date: '2026-12-15' })
  })

  it.each(['create', 'update', 'delete', 'put-exception', 'delete-exception'])('rolls back %s if revision cannot be updated', async (action) => {
    const rule = await createRule()
    const path = `/recurring-rules/${rule.id}`
    await api.request('PUT', `${path}/exceptions/2026-11`, override)
    const before = snapshotDatabase(api.db)
    api.db.exec("CREATE TRIGGER fail_revision BEFORE UPDATE ON profile_state BEGIN SELECT RAISE(ABORT, 'private error'); END;")
    const requests = {
      create: () => api.request('POST', '/recurring-rules', ruleData),
      update: () => api.request('PATCH', path, { dayOfMonth: 15 }),
      delete: () => api.request('DELETE', path),
      'put-exception': () => api.request('PUT', `${path}/exceptions/2026-11`, { action: 'skip' }),
      'delete-exception': () => api.request('DELETE', `${path}/exceptions/2026-11`),
    }
    const response = await requests[action as keyof typeof requests]()
    expect(response.status).toBe(500)
    expect(response.body.error.code).toBe('INTERNAL_ERROR')
    expect(response.text).not.toContain('private error')
    expect(snapshotDatabase(api.db)).toEqual(before)
  })
})
