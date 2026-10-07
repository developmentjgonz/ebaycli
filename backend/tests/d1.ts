import { DatabaseSync, type SQLInputValue } from "node:sqlite";

/** In-memory SQLite runs the real migration and SQL used by the D1 binding. */
export function createTestDatabase(migration: string) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(migration);

  class Statement {
    constructor(readonly sql: string, readonly values: SQLInputValue[] = []) {}

    bind(...values: unknown[]) {
      return new Statement(this.sql, values as SQLInputValue[]);
    }

    async first<T>(column?: string): Promise<T | null> {
      const row = sqlite.prepare(this.sql).get(...this.values);
      return (column ? row?.[column] : row) as T ?? null;
    }

    async all<T>() {
      return { success: true, results: sqlite.prepare(this.sql).all(...this.values) as T[], meta: {} };
    }

    async run() {
      const result = sqlite.prepare(this.sql).run(...this.values);
      return {
        success: true,
        results: [],
        meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) }
      };
    }
  }

  const binding = {
    prepare: (sql: string) => new Statement(sql),
    exec: async (sql: string) => {
      sqlite.exec(sql);
      return { count: 1, duration: 0 };
    },
    batch: async (statements: Statement[]) => {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.all());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    }
  } as unknown as D1Database;

  return { binding, sqlite, close: () => sqlite.close() };
}
