import { Type, type Static } from "@sinclair/typebox";
import type {
  OpenClawPluginApi,
  AgentTool,
  AgentToolResult,
} from "../types.js";
import type { MemoryAlphaConfig } from "../config/index.js";
import type { SqliteStore } from "../db/sqlite.js";
import { QdrantClient } from "../ingest/qdrant.js";
import { embedText } from "../ingest/embeddings.js";

// ---- Parameter schemas (TypeBox) ----

const MemorySaveParams = Type.Object({
  text: Type.String(),
  tags: Type.Optional(Type.Array(Type.String())),
  memory_type: Type.Optional(Type.String()),
  agent_id: Type.Optional(Type.String()),
  session_id: Type.Optional(Type.String()),
});

const MemorySearchParams = Type.Object({
  query: Type.String(),
  limit: Type.Optional(Type.Number()),
});

const MemoryRecallParams = Type.Object({
  query: Type.String(),
  limit: Type.Optional(Type.Number()),
});

// ---- Tool builders ----

function buildMemorySaveTool(
  qdrant: QdrantClient,
  embed: (text: string) => Promise<number[]>,
  sqlite: SqliteStore
): AgentTool<typeof MemorySaveParams> {
  return {
    name: "memory_save",
    description: "Store a memory in the shared pool",
    label: "Save Memory",
    parameters: MemorySaveParams,
    async execute(
      _toolCallId: string,
      args: Static<typeof MemorySaveParams>
    ): Promise<AgentToolResult> {
      const id = crypto.randomUUID();
      const vector = await embed(args.text);
      const now = Date.now();

      // Write to Qdrant
      await qdrant.upsert([
        {
          id,
          vector,
          payload: {
            text: args.text,
            tags: args.tags ?? [],
            memory_type: args.memory_type ?? "fact",
            agent_id: args.agent_id,
            session_id: args.session_id,
            source: "tool",
            created_at: now,
          },
        },
      ]);

      // Write to SQLite
      await sqlite.insertMemory({
        id,
        text: args.text,
        memory_type: args.memory_type ?? "fact",
        session_id: args.session_id,
        agent_id: args.agent_id,
        source: "tool",
        tags: args.tags,
      });

      return {
        content: [{ type: "text", text: `Memory saved with id ${id}` }],
        details: { ok: true, id },
      };
    },
  };
}

function buildMemorySearchTool(
  qdrant: QdrantClient,
  embed: (text: string) => Promise<number[]>,
  sqlite: SqliteStore,
  config: MemoryAlphaConfig
): AgentTool<typeof MemorySearchParams> {
  return {
    name: "memory_search",
    description: "Search memories (hybrid: vector + FTS)",
    label: "Search Memories",
    parameters: MemorySearchParams,
    async execute(
      _toolCallId: string,
      args: Static<typeof MemorySearchParams>
    ): Promise<AgentToolResult> {
      const limit = args.limit ?? config.recallLimit;
      const vector = await embed(args.query);
      const vectorResults = await qdrant.search(vector, limit);

      // FTS fallback / supplement
      let ftsResults: any[] = [];
      try {
        ftsResults = await sqlite.searchFts(args.query, limit);
      } catch {
        // FTS query may fail on special chars — degrade gracefully
      }

      // Merge: vector results first, then FTS results not already present
      const seenTexts = new Set(
        vectorResults.map((r: any) => r.payload?.text)
      );
      const supplemental = ftsResults
        .filter((r) => !seenTexts.has(r.text))
        .map((r) => ({
          payload: { text: r.text, memory_type: r.memory_type },
          score: 0,
          source: "fts",
        }));

      const merged = [...vectorResults, ...supplemental].slice(0, limit);

      // Track recall counts for FTS hits
      for (const r of ftsResults) {
        await sqlite.incrementRecallCount(r.id);
      }

      const text = merged
        .map(
          (r: any, i: number) =>
            `${i + 1}. [${r.payload?.memory_type ?? "unknown"}] ${r.payload?.text ?? ""}`
        )
        .join("\n");

      return {
        content: [{ type: "text", text: text || "No results found." }],
        details: { results: merged },
      };
    },
  };
}

function buildMemoryRecallTool(
  qdrant: QdrantClient,
  embed: (text: string) => Promise<number[]>,
  sqlite: SqliteStore,
  config: MemoryAlphaConfig
): AgentTool<typeof MemoryRecallParams> {
  return {
    name: "memory_recall",
    description: "Return top memories for current context",
    label: "Recall Memories",
    parameters: MemoryRecallParams,
    async execute(
      _toolCallId: string,
      args: Static<typeof MemoryRecallParams>
    ): Promise<AgentToolResult> {
      const limit = args.limit ?? config.recallLimit;
      const vector = await embed(args.query);
      const results = await qdrant.search(vector, limit);

      // Track used_count for recalled memories
      for (const r of results) {
        if (r.id) {
          await sqlite.incrementUsedCount(r.id as string);
        }
      }

      const text = results
        .map((r: any, i: number) => `${i + 1}. ${r.payload?.text ?? ""}`)
        .join("\n");

      return {
        content: [{ type: "text", text: text || "No memories recalled." }],
        details: { injected: results, count: results.length },
      };
    },
  };
}

// ---- Registration ----

export function registerMemoryTools(
  api: OpenClawPluginApi,
  config: MemoryAlphaConfig,
  sqlite: SqliteStore
) {
  const qdrant = new QdrantClient(config.qdrantUrl, config.qdrantCollection);
  const embed = (text: string) =>
    embedText(
      text,
      config.embedDimensions,
      config.ollamaUrl,
      config.embedModel
    );

  api.registerTool(buildMemorySaveTool(qdrant, embed, sqlite));
  api.registerTool(buildMemorySearchTool(qdrant, embed, sqlite, config));
  api.registerTool(buildMemoryRecallTool(qdrant, embed, sqlite, config));

  api.logger.info("memory-alpha: tools registered", {
    sharedPool: config.sharedPool,
  });
}
