import { Type, type Static } from "@sinclair/typebox";
import type {
    OpenClawPluginApi,
    AnyAgentTool,
} from "../types.js";
import type { MemoryAlphaConfig } from "../config/index.js";
import type { SqliteStore } from "../db/sqlite.js";
import { QdrantClient } from "../ingest/qdrant.js";
import { embedText } from "../ingest/embeddings.js";

// Parameter schemas (TypeBox)
const MemorySaveParams = Type.Object({
    text: Type.String({ description: "The memory text to store" }),
    tags: Type.Optional(Type.Array(Type.String())),
    memory_type: Type.Optional(Type.String({ description: "Category: fact, preference, decision, episode" })),
});

const MemorySearchParams = Type.Object({
    query: Type.String({ description: "Search query text" }),
    limit: Type.Optional(Type.Number({ description: "Max results (default 10)" })),
});

const MemoryRecallParams = Type.Object({
    query: Type.String({ description: "Query for auto-recall" }),
    limit: Type.Optional(Type.Number()),
});

// ---- Tool builders ----

function buildMemorySaveTool(
    qdrant: QdrantClient,
    embed: (text: string) => Promise<number[] | null>,
    sqlite: SqliteStore,
    getCtxSession: () => { sessionId?: string; agentId?: string } | null
): AnyAgentTool {
    return {
        name: "memory_save",
        description: "Save a memory to the shared pool with optional tags.",
        parameters: MemorySaveParams,
        async execute(params: Static<typeof MemorySaveParams>, ctx) {
            try {
                const id = crypto.randomUUID();
                const now = Date.now();

                // Embed
                const vector = await embed(params.text);

                // Write to Qdrant
                if (vector) {
                    const sessionInfo = getCtxSession();
                    await qdrant.upsert([{
                        id,
                        vector,
                        payload: {
                            text: params.text,
                            tags: params.tags ?? [],
                            memory_type: params.memory_type ?? "fact",
                            session_id: sessionInfo?.sessionId,
                            agent_id: sessionInfo?.agentId,
                            source: "tool",
                            created_at: now,
                        },
                    }]);
                }

                // Write to SQLite
                const sessionInfo = getCtxSession();
                await sqlite.insertMemory({
                    id,
                    text: params.text,
                    memory_type: params.memory_type ?? "fact",
                    session_id: sessionInfo?.sessionId,
                    agent_id: sessionInfo?.agentId,
                    source: "tool",
                    tags: params.tags,
                });

                return {
                    content: [{ type: "text" as const, text: `Memory saved with id ${id}` }],
                    details: { ok: true, id },
                };
            } catch (err: any) {
                return {
                    content: [{ type: "text" as const, text: `Failed to save memory: ${err.message}` }],
                    details: { ok: false, error: err.message },
                };
            }
        },
    };
}

function buildMemorySearchTool(
    qdrant: QdrantClient,
    embed: (text: string) => Promise<number[] | null>,
    sqlite: SqliteStore,
    config: MemoryAlphaConfig,
    getCtxSession: () => { sessionId?: string; agentId?: string } | null
): AnyAgentTool {
    return {
        name: "memory_search",
        description: "Search memories using hybrid vector + FTS search.",
        parameters: MemorySearchParams,
        async execute(params: Static<typeof MemorySearchParams>) {
            try {
                const limit = params.limit ?? config.recallLimit;
                const vector = await embed(params.query);

                // Vector search
                let vectorResults: any[] = [];
                if (vector) {
                    vectorResults = await qdrant.search(vector, limit);
                }

                // FTS fallback / supplement
                let ftsResults: any[] = [];
                try {
                    ftsResults = await sqlite.searchFts(params.query, limit);
                } catch {
                    // FTS may fail on special chars — degrade gracefully
                }

                // Merge: vector results first, then FTS not already present
                const seenIds = new Set(vectorResults.map((r: any) => r.id));
                const supplemental = ftsResults
                    .filter((r) => !seenIds.has(r.id))
                    .map((r) => ({
                        payload: { text: r.text, memory_type: r.memory_type },
                        score: 0,
                        source: "fts",
                    }));

                const merged = [...vectorResults, ...supplemental].slice(0, limit);

                const text = merged
                    .map((r: any, i: number) =>
                        `${i + 1}. [${r.payload?.memory_type ?? "unknown"}] ${r.payload?.text ?? ""}`
                    )
                    .join("\n");

                return {
                    content: [{ type: "text" as const, text: text || "No results found." }],
                    details: { results: merged },
                };
            } catch (err: any) {
                return {
                    content: [{ type: "text" as const, text: `Memory search failed: ${err.message}` }],
                    details: { error: err.message },
                };
            }
        },
    };
}

function buildMemoryRecallTool(
    qdrant: QdrantClient,
    embed: (text: string) => Promise<number[] | null>,
    sqlite: SqliteStore,
    config: MemoryAlphaConfig
): AnyAgentTool {
    return {
        name: "memory_recall",
        description: "Quick recall of top recent memories matching query.",
        parameters: MemoryRecallParams,
        async execute(params: Static<typeof MemoryRecallParams>) {
            try {
                const limit = params.limit ?? config.recallLimit;
                const vector = await embed(params.query);
                const results = vector ? await qdrant.search(vector, limit) : [];

                const text = results
                    .map((r: any, i: number) => `${i + 1}. ${r.payload?.text ?? ""}`)
                    .join("\n");

                return {
                    content: [{ type: "text" as const, text: text || "No memories recalled." }],
                    details: { injected: results, count: results.length },
                };
            } catch (err: any) {
                return {
                    content: [{ type: "text" as const, text: `Memory recall failed: ${err.message}` }],
                    details: { error: err.message },
                };
            }
        },
    };
}

// ---- SQLite-only fallback tools ----

function buildSqliteOnlySaveTool(sqlite: SqliteStore): AnyAgentTool {
    return {
        name: "memory_save",
        description: "Store a memory (keyword search only, no vector embeddings).",
        parameters: MemorySaveParams,
        async execute(params: Static<typeof MemorySaveParams>) {
            try {
                const id = await sqlite.insertMemory({
                    text: params.text,
                    memory_type: params.memory_type ?? "fact",
                    source: "tool",
                    tags: params.tags,
                });
                return {
                    content: [{ type: "text" as const, text: `Memory saved with id ${id}` }],
                    details: { ok: true, id, mode: "sqlite" },
                };
            } catch (err: any) {
                return {
                    content: [{ type: "text" as const, text: `Failed to save memory: ${err.message}` }],
                    details: { ok: false, error: err.message },
                };
            }
        },
    };
}

function buildSqliteOnlySearchTool(
    sqlite: SqliteStore,
    config: MemoryAlphaConfig
): AnyAgentTool {
    return {
        name: "memory_search",
        description: "Search memories using FTS5 full-text search.",
        parameters: MemorySearchParams,
        async execute(params: Static<typeof MemorySearchParams>) {
            try {
                const limit = params.limit ?? config.recallLimit;
                const results = await sqlite.searchFts(params.query, limit);

                const text = results
                    .map((r: any, i: number) =>
                        `${i + 1}. [${r.memory_type ?? "unknown"}] ${r.text ?? ""}`
                    )
                    .join("\n");

                return {
                    content: [{ type: "text" as const, text: text || "No results found." }],
                    details: { results, mode: "sqlite" },
                };
            } catch (err: any) {
                return {
                    content: [{ type: "text" as const, text: `Search failed: ${err.message}` }],
                    details: { error: err.message },
                };
            }
        },
    };
}

// ---- Registration ----

export function registerMemoryTools(
    api: OpenClawPluginApi,
    config: MemoryAlphaConfig,
    sqlite: SqliteStore,
    mode: "sqlite-only" | "hybrid" | "full"
) {
    // Session context grabber — pulls from tool context if available
    const getCtxSession = () => null; // Will be populated by the runtime

    if (mode === "sqlite-only") {
        api.logger.info("memory-alpha: tools registered (SQLite-only)");
        api.registerTool(buildSqliteOnlySaveTool(sqlite));
        api.registerTool(buildSqliteOnlySearchTool(sqlite, config));
        return;
    }

    if (!config.qdrantUrl || !config.ollamaUrl) {
        throw new Error("Qdrant and Ollama URLs required for vector search mode");
    }

    const qdrant = new QdrantClient(config.qdrantUrl, config.qdrantCollection!);

    const embed = (text: string) =>
        embedText(text, config.embedDimensions, config.ollamaUrl!, config.embedModel!);

    api.registerTool(buildMemorySaveTool(qdrant, embed, sqlite, getCtxSession));
    api.registerTool(buildMemorySearchTool(qdrant, embed, sqlite, config, getCtxSession));
    api.registerTool(buildMemoryRecallTool(qdrant, embed, sqlite, config));

    api.logger.info("memory-alpha: tools registered (vector search enabled)", {
        tools: ["memory_save", "memory_search", "memory_recall"],
        sharedPool: config.sharedPool,
        mode,
    });
}
