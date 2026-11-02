import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { getDaysInMonth } from './database/calendar'
import { createRecurringOperation } from './database/recurringOperations'
import { createMonthBalancesRepository } from './database/monthBalances'
import { ApiError } from './middleware/ApiError'
import { Errors } from './middleware/errors'
import {
  openingBalanceSchema,
  transactionSchema,
  transactionPatchSchema,
  recurringRuleSchema,
  recurringRulePatchSchema,
  recurringExceptionSchema,
  scenarioSchema,
  scenarioRevisionSchema,
  validate,
  validateMonthParam,
} from './validation'
import type {
  MonthPlan,
  MonthOperation,
  Transaction,
  RecurringRule,
  RecurringExceptionRow,
  RecurringException,
  NewTransaction,
} from './_types'
import type { DetailType } from './middleware/_types'

export function createStorage(db: Database.Database) {
  const balances = createMonthBalancesRepository(db)

  function getRevision(): number {
    const row = db.prepare<[], { revision: number }>(
      'SELECT revision FROM profile_state WHERE id = 1',
    ).get()
    if (!row) throw new Error('Не найдена версия профиля')
    return row.revision
  }

  function incrementRevision(): number {
    const row = db.prepare<[], { revision: number }>(
      'UPDATE profile_state SET revision = revision + 1 WHERE id = 1 RETURNING revision',
    ).get()
    if (!row) throw new Error('Не найдена версия профиля')
    return row.revision
  }

  function getTransaction(id: string): Transaction {
    const row = db.prepare<[string], Transaction>(
      'SELECT id, title, type, amountCents, date FROM transactions WHERE id = ?',
    ).get(id)
    if (!row) throw new ApiError(Errors.NOT_FOUND)
    return row
  }

  function getTransactionsByMonth(month: string, daysInMonth: number): Transaction[] {
    const firstDate = `${month}-01`
    const lastDate = `${month}-${String(daysInMonth).padStart(2, '0')}`
    return db.prepare<[string, string], Transaction>(`
      SELECT id, title, type, amountCents, date FROM transactions
      WHERE date >= ? AND date <= ?
    `).all(firstDate, lastDate)
  }

  function getRecurringRules(): RecurringRule[] {
    return db.prepare<[], RecurringRule>(`
      SELECT id, title, type, amountCents, dayOfMonth, startMonth
      FROM recurring_rules ORDER BY id
    `).all()
  }

  function getApplicableRules(month: string): RecurringRule[] {
    return db.prepare<[string], RecurringRule>(`
      SELECT id, title, type, amountCents, dayOfMonth, startMonth
      FROM recurring_rules WHERE startMonth <= ?
    `).all(month)
  }

  function getMonthPlan(inputMonth: string): MonthPlan {
    const month = validateMonthParam(inputMonth)
    return db.transaction((): MonthPlan => {
      const daysInMonth = getDaysInMonth(month)
      const rules = getApplicableRules(month)
      const exceptions = db.prepare<[string], RecurringExceptionRow>(`
        SELECT ruleId, month, action, title, type, amountCents, date
        FROM recurring_exceptions WHERE month = ?
      `).all(month)
      const exceptionsByRule = new Map(exceptions.map((exception) => [exception.ruleId, exception]))
      const operations: MonthOperation[] = getTransactionsByMonth(month, daysInMonth)
        .map((transaction) => ({ ...transaction, source: 'oneTime' }))

      for (const rule of rules) {
        const exception = exceptionsByRule.get(rule.id)
        if (exception?.action === 'skip') continue

        const operation = createRecurringOperation(rule, month)

        if (exception?.action === 'override') {
          if (exception.title === null || exception.type === null ||
            exception.amountCents === null || exception.date === null) {
            throw new Error('Неполное исключение override в БД')
          }
          operation.title = exception.title
          operation.type = exception.type
          operation.amountCents = exception.amountCents
          operation.date = exception.date
          operation.recurrence.overridden = true
        }
        operations.push(operation)
      }

      operations.sort((left, right) => {
        if (left.date !== right.date) return left.date < right.date ? -1 : 1
        if (left.id === right.id) return 0
        return left.id < right.id ? -1 : 1
      })

      return {
        month,
        revision: getRevision(),
        openingBalanceCents: balances.getOpeningBalance(month),
        operations,
      }
    })()
  }

  function setOpeningBalance(inputMonth: string, input: unknown) {
    const month = validateMonthParam(inputMonth)
    const { openingBalanceCents } = validate(openingBalanceSchema, input)
    return db.transaction(() => {
      balances.upsertOpeningBalance(month, openingBalanceCents)
      return { month, openingBalanceCents, revision: incrementRevision() }
    }).immediate()
  }

  function operationFields(operation: NewTransaction): NewTransaction {
    return {
      title: operation.title,
      type: operation.type,
      amountCents: operation.amountCents,
      date: operation.date,
    }
  }

  function insertTransaction(transaction: Transaction): void {
    db.prepare(`
      INSERT INTO transactions (id, title, type, amountCents, date)
      VALUES (@id, @title, @type, @amountCents, @date)
    `).run(transaction)
  }

  function writeTransaction(transaction: Transaction): void {
    db.prepare(`
      UPDATE transactions SET title = @title, type = @type,
        amountCents = @amountCents, date = @date WHERE id = @id
    `).run(transaction)
  }

  function createTransaction(input: unknown) {
    const data = validate(transactionSchema, input)
    return db.transaction(() => {
      const transaction: Transaction = { ...data, id: randomUUID() }
      insertTransaction(transaction)
      return { transaction, revision: incrementRevision() }
    }).immediate()
  }

  function updateTransaction(id: string, input: unknown) {
    return db.transaction(() => {
      const previous = getTransaction(id)
      const patch = validate(transactionPatchSchema, input)
      const transaction: Transaction = {
        id: previous.id,
        title: patch.title ?? previous.title,
        type: patch.type ?? previous.type,
        amountCents: patch.amountCents ?? previous.amountCents,
        date: patch.date ?? previous.date,
      }
      writeTransaction(transaction)
      return { transaction, revision: incrementRevision() }
    }).immediate()
  }

  function deleteTransaction(id: string): void {
    db.transaction(() => {
      getTransaction(id)
      db.prepare('DELETE FROM transactions WHERE id = ?').run(id)
      incrementRevision()
    }).immediate()
  }

  function getRecurringRule(id: string): RecurringRule {
    const rule = db.prepare<[string], RecurringRule>(`
      SELECT id, title, type, amountCents, dayOfMonth, startMonth
      FROM recurring_rules WHERE id = ?
    `).get(id)
    if (!rule) throw new ApiError(Errors.NOT_FOUND)
    return rule
  }

  function createRecurringRule(input: unknown) {
    const data = validate(recurringRuleSchema, input)
    return db.transaction(() => {
      const rule: RecurringRule = { ...data, id: randomUUID() }
      db.prepare(`
        INSERT INTO recurring_rules (id, title, type, amountCents, dayOfMonth, startMonth)
        VALUES (@id, @title, @type, @amountCents, @dayOfMonth, @startMonth)
      `).run(rule)
      return { rule, revision: incrementRevision() }
    }).immediate()
  }

  function updateRecurringRule(id: string, input: unknown) {
    return db.transaction(() => {
      const previous = getRecurringRule(id)
      const patch = validate(recurringRulePatchSchema, input)
      const rule: RecurringRule = {
        id: previous.id,
        title: patch.title ?? previous.title,
        type: patch.type ?? previous.type,
        amountCents: patch.amountCents ?? previous.amountCents,
        dayOfMonth: patch.dayOfMonth ?? previous.dayOfMonth,
        startMonth: patch.startMonth ?? previous.startMonth,
      }
      db.prepare(`
        UPDATE recurring_rules SET title = @title, type = @type,
          amountCents = @amountCents, dayOfMonth = @dayOfMonth, startMonth = @startMonth
        WHERE id = @id
      `).run(rule)
      return { rule, revision: incrementRevision() }
    }).immediate()
  }

  function deleteRecurringRule(id: string): void {
    db.transaction(() => {
      getRecurringRule(id)
      db.prepare('DELETE FROM recurring_rules WHERE id = ?').run(id)
      incrementRevision()
    }).immediate()
  }

  function writeRecurringException(exception: RecurringException): void {
    const values = exception.action === 'skip'
      ? { ...exception, title: null, type: null, amountCents: null, date: null }
      : exception
    db.prepare(`
      INSERT INTO recurring_exceptions (ruleId, month, action, title, type, amountCents, date)
      VALUES (@ruleId, @month, @action, @title, @type, @amountCents, @date)
      ON CONFLICT(ruleId, month) DO UPDATE SET action = excluded.action,
        title = excluded.title, type = excluded.type,
        amountCents = excluded.amountCents, date = excluded.date
    `).run(values)
  }

  function setRecurringException(id: string, inputMonth: string, input: unknown) {
    const month = validateMonthParam(inputMonth)
    return db.transaction(() => {
      const rule = getRecurringRule(id)
      const data = validate(recurringExceptionSchema, input)
      if (month < rule.startMonth) {
        throw new ApiError(Errors.VALIDATION_ERROR, [
          { field: 'month', message: 'Месяц исключения не может быть раньше startMonth' },
        ])
      }
      if (data.action === 'override' && data.date.slice(0, 7) !== month) {
        throw new ApiError(Errors.VALIDATION_ERROR, [
          { field: 'date', message: 'Дата должна относиться к выбранному месяцу' },
        ])
      }
      const exception: RecurringException = { ruleId: id, month, ...data }
      writeRecurringException(exception)
      return { exception, revision: incrementRevision() }
    }).immediate()
  }

  function deleteRecurringException(id: string, inputMonth: string): void {
    const month = validateMonthParam(inputMonth)
    db.transaction(() => {
      getRecurringRule(id)
      const deleted = db.prepare('DELETE FROM recurring_exceptions WHERE ruleId = ? AND month = ?')
        .run(id, month)
      if (deleted.changes === 0) throw new ApiError(Errors.NOT_FOUND)
      incrementRevision()
    }).immediate()
  }

  function applyScenario(inputMonth: string, input: unknown): MonthPlan {
    const month = validateMonthParam(inputMonth)
    return db.transaction(() => {
      const { revision } = validate(scenarioRevisionSchema, input)
      if (revision !== getRevision()) throw new ApiError(Errors.REVISION_CONFLICT)
      const scenario = validate(scenarioSchema, input)

      const existingTransactions = getTransactionsByMonth(month, getDaysInMonth(month))
      const transactionIds = new Set(existingTransactions.map((operation) => operation.id))
      // Идентификаторы вхождений определяет сервер по правилам, а не по recurrence клиента.
      const defaultRecurring = getApplicableRules(month).map((rule) => createRecurringOperation(rule, month))
      const recurringById = new Map(defaultRecurring.map((operation) => [operation.id, operation]))
      const identifiers = new Set<string>()
      const details: DetailType[] = []

      scenario.operations.forEach((operation, index) => {
        const identifierField = operation.source === 'new' ? 'clientId' : 'id'
        const identifier = operation.source === 'new' ? operation.clientId : operation.id
        if (identifiers.has(identifier)) {
          details.push({ field: `operations[${index}].${identifierField}`, message: 'Идентификатор дублируется в пакете' })
        }
        identifiers.add(identifier)
        if (operation.date.slice(0, 7) !== month) {
          details.push({ field: `operations[${index}].date`, message: 'Дата должна относиться к выбранному месяцу' })
        }
        if ((operation.source === 'oneTime' && !transactionIds.has(operation.id)) ||
          (operation.source === 'recurring' && !recurringById.has(operation.id))) {
          details.push({ field: `operations[${index}].id`, message: 'Неизвестный ID или операция другого месяца' })
        }
      })
      if (details.length > 0) throw new ApiError(Errors.VALIDATION_ERROR, details)

      const keptTransactions = new Set<string>()
      for (const operation of scenario.operations) {
        if (operation.source === 'new') {
          insertTransaction({ ...operationFields(operation), id: randomUUID() })
        } else if (operation.source === 'oneTime') {
          writeTransaction({ ...operationFields(operation), id: operation.id })
          keptTransactions.add(operation.id)
        }
      }
      for (const operation of existingTransactions) {
        if (!keptTransactions.has(operation.id)) {
          db.prepare('DELETE FROM transactions WHERE id = ?').run(operation.id)
        }
      }

      const keptRecurring = new Map(scenario.operations
        .filter((operation) => operation.source === 'recurring')
        .map((operation) => [operation.id, operation]))
      for (const original of defaultRecurring) {
        const operation = keptRecurring.get(original.id)
        const ruleId = original.recurrence.ruleId
        if (!operation) {
          writeRecurringException({ ruleId, month, action: 'skip' })
        } else if (operation.title === original.title && operation.type === original.type &&
          operation.amountCents === original.amountCents && operation.date === original.date) {
          db.prepare('DELETE FROM recurring_exceptions WHERE ruleId = ? AND month = ?').run(ruleId, month)
        } else {
          writeRecurringException({ ruleId, month, action: 'override', ...operationFields(operation) })
        }
      }

      balances.upsertOpeningBalance(month, scenario.openingBalanceCents)
      incrementRevision()
      return getMonthPlan(month)
    }).immediate()
  }

  return {
    getMonthPlan,
    setOpeningBalance,
    createTransaction,
    updateTransaction,
    deleteTransaction,
    getRecurringRules,
    createRecurringRule,
    updateRecurringRule,
    deleteRecurringRule,
    setRecurringException,
    deleteRecurringException,
    applyScenario,
  }
}

export type Storage = ReturnType<typeof createStorage>
