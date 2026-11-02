import { db } from '../db'
import { initializeSchema } from './schema'

try {
  initializeSchema(db)
  console.log(`Схема БД готова: ${db.name}`)
} finally {
  db.close()
}
