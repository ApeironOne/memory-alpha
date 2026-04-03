import sqlite3 from "sqlite3";

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
  }

  close() {
    this.db.close();
  }
}
