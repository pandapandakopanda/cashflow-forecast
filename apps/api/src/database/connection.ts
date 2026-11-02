import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export function openDatabase(databasePath: string): Database.Database {
  if (databasePath.trim().length === 0) {
    throw new Error('DATABASE_PATH не должен быть пустым');
  }

  const filename = databasePath === ':memory:' ? databasePath : resolve(databasePath);
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });

  const connection = new Database(filename);
  try {
    connection.pragma('foreign_keys = ON');
    return connection;
  } catch (error) {
    connection.close();
    throw error;
  }
}
