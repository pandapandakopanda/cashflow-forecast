import type Database from 'better-sqlite3'

export function createTransactionsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
      amountCents INTEGER NOT NULL
        CHECK (typeof(amountCents) = 'integer' AND amountCents BETWEEN 1 AND 99999999999),
      date TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS transactions_date_idx ON transactions (date);

    -- Also enforce integer amounts and non-null IDs on tables created by earlier versions.
    CREATE TRIGGER IF NOT EXISTS transactions_validate_insert
    BEFORE INSERT ON transactions
    WHEN NEW.id IS NULL OR typeof(NEW.amountCents) <> 'integer'
    BEGIN
      SELECT RAISE(ABORT, 'Transaction ID is required and amountCents must be an integer');
    END;

    CREATE TRIGGER IF NOT EXISTS transactions_validate_update
    BEFORE UPDATE ON transactions
    WHEN NEW.id IS NULL OR typeof(NEW.amountCents) <> 'integer'
    BEGIN
      SELECT RAISE(ABORT, 'Transaction ID is required and amountCents must be an integer');
    END;
  `)
}
