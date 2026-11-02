import type Database from 'better-sqlite3'

export function createProfileStateTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS profile_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      revision INTEGER NOT NULL CHECK (revision >= 0)
    ) STRICT;

    INSERT INTO profile_state (id, revision) VALUES (1, 0)
      ON CONFLICT(id) DO NOTHING;
  `)
}
