import type Database from "better-sqlite3";

type TerminalSnippetPreference = { favorite: boolean; lastUsedAt: string | null };

export interface TerminalSnippetRepository {
  list(userId: string): Map<string, TerminalSnippetPreference>;
  setFavorite(userId: string, snippetId: string, favorite: boolean, now: string): void;
  markUsed(userId: string, snippetId: string, now: string): void;
}

export class SqliteTerminalSnippetRepository implements TerminalSnippetRepository {
  constructor(private readonly database: Database.Database) {}

  list(userId: string) {
    const rows = this.database.prepare("SELECT snippet_id, favorite, last_used_at FROM terminal_snippet_preferences WHERE user_id=?").all(userId) as Array<{ snippet_id: string; favorite: number; last_used_at: string | null }>;
    return new Map(rows.map((row) => [row.snippet_id, { favorite: Boolean(row.favorite), lastUsedAt: row.last_used_at }]));
  }

  setFavorite(userId: string, snippetId: string, favorite: boolean, now: string) {
    this.database.prepare(`INSERT INTO terminal_snippet_preferences(user_id,snippet_id,favorite,last_used_at,updated_at)
      VALUES(?,?,?,NULL,?) ON CONFLICT(user_id,snippet_id) DO UPDATE SET favorite=excluded.favorite,updated_at=excluded.updated_at`).run(userId, snippetId, favorite ? 1 : 0, now);
  }

  markUsed(userId: string, snippetId: string, now: string) {
    this.database.prepare(`INSERT INTO terminal_snippet_preferences(user_id,snippet_id,favorite,last_used_at,updated_at)
      VALUES(?,?,0,?,?) ON CONFLICT(user_id,snippet_id) DO UPDATE SET last_used_at=excluded.last_used_at,updated_at=excluded.updated_at`).run(userId, snippetId, now, now);
  }
}

export class MemoryTerminalSnippetRepository implements TerminalSnippetRepository {
  private readonly preferences = new Map<string, Map<string, TerminalSnippetPreference>>();
  list(userId: string) { return new Map(this.preferences.get(userId) ?? []); }
  setFavorite(userId: string, snippetId: string, favorite: boolean) {
    const user = this.preferences.get(userId) ?? new Map<string, TerminalSnippetPreference>();
    const current = user.get(snippetId) ?? { favorite: false, lastUsedAt: null };
    user.set(snippetId, { ...current, favorite }); this.preferences.set(userId, user);
  }
  markUsed(userId: string, snippetId: string, now: string) {
    const user = this.preferences.get(userId) ?? new Map<string, TerminalSnippetPreference>();
    const current = user.get(snippetId) ?? { favorite: false, lastUsedAt: null };
    user.set(snippetId, { ...current, lastUsedAt: now }); this.preferences.set(userId, user);
  }
}
