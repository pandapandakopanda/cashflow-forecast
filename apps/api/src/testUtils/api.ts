import type Database from 'better-sqlite3'
import { createApp } from '../app'
import { openDatabase } from '../database/connection'

export async function startTestApi(databasePath = ':memory:') {
  const db = openDatabase(databasePath)
  const server = createApp(db).listen(0, '127.0.0.1')
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected TCP address')
  const baseUrl = `http://127.0.0.1:${address.port}`

  return {
    db,
    async request(method: string, path: string, body?: unknown) {
      const response = await fetch(`${baseUrl}/api${path}`, {
        method,
        ...(body === undefined ? {} : {
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        }),
      })
      const text = await response.text()
      return {
        status: response.status,
        text,
        body: text ? JSON.parse(text) : undefined,
        contentType: response.headers.get('content-type'),
      }
    },
    async close() {
      if (server.listening) {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => error ? reject(error) : resolve())
        })
      }
      if (db.open) db.close()
    },
  }
}

export type TestApi = Awaited<ReturnType<typeof startTestApi>>

export function snapshotDatabase(db: Database.Database) {
  return {
    transactions: db.prepare('SELECT * FROM transactions ORDER BY id').all(),
    rules: db.prepare('SELECT * FROM recurring_rules ORDER BY id').all(),
    exceptions: db.prepare('SELECT * FROM recurring_exceptions ORDER BY ruleId, month').all(),
    balances: db.prepare('SELECT * FROM month_balances ORDER BY month').all(),
    profile: db.prepare('SELECT * FROM profile_state ORDER BY id').all(),
  }
}
