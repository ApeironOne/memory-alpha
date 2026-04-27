import sqlite3 from "sqlite3";
import { join, resolve, dirname, homedir } from "path";
import { mkdirSync, existsSync, promises as fs } from "fs";
import { randomUUID } from "crypto";

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
    private db: sqlite3.Database | null = null;
    private _path: string;
    private initialized = false;

    constructor(path: string) {
        this._path = path;
    }

    get path() {
        return this._path;
    }

    /**
     * Initialize the database — call this once after construction.
     * Creates parent directories and the database file if needed.
     */
    async init() {
        if (this.initialized && this.db) return;

        const dir = dirname(this._path);
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }

        this.db = await new Promise<sqlite3.Database>((resolve, reject) => {
            const db = new sqlite3.Database(this._path, (err) => {
                if (err) reject(err);
                else resolve(db);
            });
        });

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

            CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(memory_type);
            CREATE INDEX IF NOT EXISTS idx_memories_agent ON memories(agent_id);
        `;
        await this.exec(sql);

        // FTS5 virtual table for full-text search
        await this.exec(`
            CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
                text,
                tokenize='porter unicode61'
            );
        `);

        // Triggers to keep FTS in sync with the memories table
        await this.exec(`
            CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
                INSERT INTO memories_fts(rowid, text) VALUES (new.rowid, new.text);
            END;
        `);
        await this.exec(`
            CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
                DELETE FROM memories_fts WHERE rowid = old.rowid;
                INSERT INTO memories_fts(rowid, text) VALUES (new.rowid, new.text);
            END;
        `);
        await this.exec(`
            CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
                DELETE FROM memories_fts WHERE rowid = old.rowid;
            END;
        `);

        this.initialized = true;
    }

    // ── Promise wrappers ──

    private ensure(): sqlite3.Database {
        if (!this.db) throw new Error("SqliteStore not initialized — call init() first");
        return this.db;
    }

    private run(sql: string, params: any[] = []): Promise<void> {
        return new Promise((resolve, reject) => {
            this.ensure().run(sql, params, (err) => (err ? reject(err) : resolve()));
        });
    }

    private exec(sql: string): Promise<void> {
        return new Promise((resolve, reject) => {
            this.ensure().exec(sql, (err) => (err ? reject(err) : resolve()));
        });
    }

    private all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
        return new Promise((resolve, reject) => {
            this.ensure().all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows as T[])));
        });
    }

    private get<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
        return new Promise((resolve, reject) => {
            this.ensure().get(sql, params, (err, row) => (err ? reject(err) : resolve(row as T | undefined)));
        });
    }

    // ── Memory CRUD ──

    async insertMemory(mem: {
        id?: string;
        text: string;
        memory_type: string;
        session_id?: string;
        agent_id?: string;
        user_id?: string;
        source?: string;
        tags?: string[];
    }): Promise<string> {
        const id = mem.id ?? randomUUID();
        const now = Date.now();
        await this.run(
            `INSERT OR REPLACE INTO memories
                (id, text, created_at, updated_at, memory_type, session_id, agent_id, user_id, source, tags)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                id,
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
        return id;
    }

    async searchFts(query: string, limit = 10): Promise<MemoryRow[]> {
        return this.all<MemoryRow>(
            `SELECT m.* FROM memories m
             JOIN memories_fts f ON m.rowid = f.rowid
             WHERE f MATCH ?
             ORDER BY rank ASC
             LIMIT ?`,
            [query, limit]
        );
    }

    async getRecentMemories(limit = 5, sinceMs?: number): Promise<MemoryRow[]> {
        const since = sinceMs ?? Date.now() - 24 * 60 * 60 * 1_000;
        return this.all<MemoryRow>(
            `SELECT * FROM memories WHERE created_at >= ? ORDER BY created_at DESC LIMIT ?`,
            [since, limit]
        );
    }

    async getMemory(id: string): Promise<MemoryRow | null> {
        return this.get<MemoryRow>(`SELECT * FROM memories WHERE id = ?`, [id]);
    }

    async countMemories(): Promise<number> {
        const row = await this.get<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM memories`);
        return row?.cnt ?? 0;
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

    async deleteMemory(id: string): Promise<boolean> {
        await this.run(`DELETE FROM memories WHERE id = ?`, [id]);
        // db.changes returns sync only in sqlite3, so just return true
        return true;
    }

    /**
     * Close the database. Safe to call multiple times.
     */
    close(): Promise<void> {
        if (!this.db) return Promise.resolve();
        return new Promise((resolve) => {
            this.db!.close((err) => {
                this.db = null;
                this.initialized = false;
                if (err) console.error("SqliteStore close error:", err.message);
                resolve();
            });
        });
    }
}
