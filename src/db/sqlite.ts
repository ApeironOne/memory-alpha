import sqlite3 from "sqlite3";

export interface MemoryRow {
  id: string;
  text: string;
  created_at: number;
  updated_at: number;
  memory_type: string;
  session_id: string | null;
  agent_id: string | null;
  user_id: string | null;
  source: string | null;
  tags: string | null;
  recall_count: number;
  used_count: number;
}

export class SqliteStore {
  private db: sqlite3.Database;

  constructor(public path: string) {
    this.db = new sqlite3.Database(path);
  }

  init() {
    const sql = `
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        text TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        memory_type TEXT DEFAULT 'fact',
        session_id TEXT,
        agent_id TEXT,
        user_id TEXT,
        source TEXT,
        tags TEXT,
        recall_count INTEGER DEFAULT 0,
        used_count INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS entities (
        id TEXT PRIMARY KEY,
        canonical_name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS entity_aliases (
        id TEXT PRIMARY KEY,
        entity_id TEXT NOT NULL,
        surface_text TEXT NOT NULL,
        normalized_text TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS relationships (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        relation_type TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS profile_cache (
        profile_type TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `;
    this.db.exec(sql);

    // FTS5 virtual table for full-text search over memories
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
        text,
        content=memories,
        content_rowid=rowid
      );
    `);

    // Triggers to keep FTS in sync
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
        INSERT INTO memories_fts(rowid, text) VALUES (new.rowid, new.text);
      END;
    `);
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, text) VALUES('delete', old.rowid, old.text);
      END;
    `);
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, text) VALUES('delete', old.rowid, old.text);
        INSERT INTO memories_fts(rowid, text) VALUES (new.rowid, new.text);
      END;
    `);
  }

  // Promise wrappers
  private run(sql: string, params: any[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, (err) => (err ? reject(err) : resolve()));
    });
  }

  private all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows as T[])));
    });
  }

  private get<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row as T | undefined)));
    });
  }

  // --- Memory CRUD ---

  async insertMemory(mem: {
    id: string;
    text: string;
    memory_type: string;
    session_id?: string;
    agent_id?: string;
    user_id?: string;
    source?: string;
    tags?: string[];
  }): Promise<void> {
    const now = Date.now();
    await this.run(
      `INSERT OR REPLACE INTO memories (id, text, created_at, updated_at, memory_type, session_id, agent_id, user_id, source, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        mem.id,
        mem.text,
        now,
        now,
        mem.memory_type,
        mem.session_id ?? null,
        mem.agent_id ?? null,
        mem.user_id ?? null,
        mem.source ?? null,
        mem.tags ? JSON.stringify(mem.tags) : null,
      ]
    );
  }

  async searchFts(query: string, limit = 10): Promise<MemoryRow[]> {
    return this.all<MemoryRow>(
      `SELECT m.* FROM memories m
       JOIN memories_fts f ON m.rowid = f.rowid
       WHERE memories_fts MATCH ?
       ORDER BY rank
       LIMIT ?`,
      [query, limit]
    );
  }

  async getRecentMemories(limit = 5, sinceMs?: number): Promise<MemoryRow[]> {
    const since = sinceMs ?? Date.now() - 24 * 60 * 60 * 1000; // default 24h
    return this.all<MemoryRow>(
      `SELECT * FROM memories WHERE created_at >= ? ORDER BY created_at DESC LIMIT ?`,
      [since, limit]
    );
  }

  async getProfile(profileType = "agent"): Promise<string | null> {
    const row = await this.get<{ content: string }>(
      `SELECT content FROM profile_cache WHERE profile_type = ?`,
      [profileType]
    );
    return row?.content ?? null;
  }

  async incrementRecallCount(id: string): Promise<void> {
    await this.run(
      `UPDATE memories SET recall_count = recall_count + 1, updated_at = ? WHERE id = ?`,
      [Date.now(), id]
    );
  }

  async incrementUsedCount(id: string): Promise<void> {
    await this.run(
      `UPDATE memories SET used_count = used_count + 1, updated_at = ? WHERE id = ?`,
      [Date.now(), id]
    );
  }

  close() {
    this.db.close();
  }
}
