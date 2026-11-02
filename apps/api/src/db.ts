import { openDatabase } from './database/connection'

export const db = openDatabase(process.env.DATABASE_PATH ?? './data/cashflow.sqlite')
