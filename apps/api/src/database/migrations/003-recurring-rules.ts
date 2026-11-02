import type Database from 'better-sqlite3'

export function createRecurringRulesTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS recurring_rules (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
      amountCents INTEGER NOT NULL CHECK (amountCents BETWEEN 1 AND 99999999999),
      dayOfMonth INTEGER NOT NULL CHECK (dayOfMonth BETWEEN 1 AND 31),
      startMonth TEXT NOT NULL CHECK (
        length(startMonth) = 7
        AND startMonth GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'
        AND substr(startMonth, 6, 2) BETWEEN '01' AND '12'
      )
    ) STRICT;

    CREATE TABLE IF NOT EXISTS recurring_exceptions (
      ruleId TEXT NOT NULL REFERENCES recurring_rules(id) ON DELETE CASCADE,
      month TEXT NOT NULL CHECK (
        length(month) = 7
        AND month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'
        AND substr(month, 6, 2) BETWEEN '01' AND '12'
      ),
      action TEXT NOT NULL CHECK (action IN ('skip', 'override')),
      title TEXT,
      type TEXT CHECK (type IN ('income', 'expense')),
      amountCents INTEGER CHECK (amountCents BETWEEN 1 AND 99999999999),
      date TEXT,
      PRIMARY KEY (ruleId, month),
      CHECK (
        (action = 'skip' AND title IS NULL AND type IS NULL AND amountCents IS NULL AND date IS NULL)
        OR
        (action = 'override' AND title IS NOT NULL AND type IS NOT NULL
          AND amountCents IS NOT NULL AND date IS NOT NULL)
      ),
      CHECK (date IS NULL OR (
        length(date) = 10
        AND date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
        AND substr(date, 1, 7) = month
        AND CAST(substr(date, 9, 2) AS INTEGER) BETWEEN 1 AND
          CASE substr(date, 6, 2)
            WHEN '02' THEN
              CASE WHEN CAST(substr(date, 1, 4) AS INTEGER) % 4 = 0
                AND (CAST(substr(date, 1, 4) AS INTEGER) % 100 <> 0
                  OR CAST(substr(date, 1, 4) AS INTEGER) % 400 = 0)
                THEN 29 ELSE 28 END
            WHEN '04' THEN 30
            WHEN '06' THEN 30
            WHEN '09' THEN 30
            WHEN '11' THEN 30
            ELSE 31
          END
      ))
    ) STRICT;

    CREATE TRIGGER IF NOT EXISTS recurring_exceptions_validate_month_insert
    BEFORE INSERT ON recurring_exceptions
    WHEN NEW.month < (SELECT startMonth FROM recurring_rules WHERE id = NEW.ruleId)
    BEGIN
      SELECT RAISE(ABORT, 'Exception month cannot precede startMonth');
    END;

    CREATE TRIGGER IF NOT EXISTS recurring_exceptions_validate_month_update
    BEFORE UPDATE ON recurring_exceptions
    WHEN NEW.month < (SELECT startMonth FROM recurring_rules WHERE id = NEW.ruleId)
    BEGIN
      SELECT RAISE(ABORT, 'Exception month cannot precede startMonth');
    END;
  `)
}
