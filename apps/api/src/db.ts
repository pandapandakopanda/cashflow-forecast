import Database from "better-sqlite3";


const databasePath = process.env.DATABASE_PATH ??  "./data/cashflow.sqlite"


export const db = new Database(databasePath)



db.exec(`
  CREATE TABLE IF NOT EXISTS transactions(
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    amountCents INTEGER NOT NULL
      CHECK (amountCents BETWEEN 1 AND 99999999999),
    date TEXT NOT NULL
  )
`)