import express from 'express'
import type Database from 'better-sqlite3'
import { initializeSchema } from './database/schema'
import { createStorage } from './storage'
import errorHandler from './middleware/errorHandler'
import { createMonthRouter } from './routes/month'
import { createTransactionsRouter } from './routes/transactions'
import { createRecurringRulesRouter } from './routes/recurringRules'

export function createApp(db: Database.Database) {
  initializeSchema(db)
  const storage = createStorage(db)
  const app = express()

  app.use(express.json({ strict: false }))
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' })
  })
  app.use('/api/months', createMonthRouter(storage))
  app.use('/api/transactions', createTransactionsRouter(storage))
  app.use('/api/recurring-rules', createRecurringRulesRouter(storage))
  app.use(errorHandler)

  return app
}
