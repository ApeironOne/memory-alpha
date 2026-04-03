import type { MemoryAlphaConfig, OpenClawPluginContext } from "../types";
import type { SqliteStore } from "../db/sqlite";
import { QdrantClient } from "../ingest/qdrant";
import { embedText } from "../ingest/embeddings";

export function registerMemoryTools(
  ctx: OpenClawPluginContext,
  config: MemoryAlphaConfig,
  sqlite: SqliteStore
) {
  const qdrant = new QdrantClient(config.qdrantUrl, config.qdrantCollection);
  const embed = (text: string) =>
    embedText(text, config.embedDimensions, config.ollamaUrl, config.embedModel);

  ctx.tools.register(
    "memory_save",
    {
      description: "Store a memory in the shared pool",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          memory_type: { type: "string" },
          agent_id: { type: "string" },
          session_id: { type: "string" },
        },
        required: ["text"],
      },
    },
    async (args: any) => {
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

      return { ok: true, id };
    }
  );

  ctx.tools.register(
    "memory_search",
    {
      description: "Search memories (hybrid: vector + FTS)",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          limit: { type: "number" },
        },
        required: ["query"],
      },
    },
    async (args: any) => {
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
        .map((r) => ({ payload: { text: r.text, memory_type: r.memory_type }, score: 0, source: "fts" }));

      const merged = [...vectorResults, ...supplemental].slice(0, limit);

      // Track recall counts for FTS hits
      for (const r of ftsResults) {
        await sqlite.incrementRecallCount(r.id);
      }

      return { results: merged };
    }
  );

  ctx.tools.register(
    "memory_recall",
    {
      description: "Return top memories for current context",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          limit: { type: "number" },
        },
        required: ["query"],
      },
    },
    async (args: any) => {
      const limit = args.limit ?? config.recallLimit;
      const vector = await embed(args.query);
      const results = await qdrant.search(vector, limit);

      // Track used_count for recalled memories
      for (const r of results) {
        if (r.id) {
          await sqlite.incrementUsedCount(r.id as string);
        }
      }

      return { injected: results, count: results.length };
    }
  );

  ctx.logger.info("memory-alpha: tools registered", {
    sharedPool: config.sharedPool,
  });
}
