import type { MemoryAlphaConfig, OpenClawPluginContext } from "../types";
import { QdrantClient } from "../ingest/qdrant";
import { embedText } from "../ingest/embeddings";

export function registerMemoryTools(ctx: OpenClawPluginContext, config: MemoryAlphaConfig) {
  const qdrant = new QdrantClient(config.qdrantUrl, config.qdrantCollection);
  const embed = (text: string) => embedText(text, config.embedDimensions, config.ollamaUrl, config.embedModel);

  ctx.tools.register(
    "memory_save",
    {
      description: "Store a memory in the shared pool",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          agent_id: { type: "string" },
          session_id: { type: "string" }
        },
        required: ["text"]
      }
    },
    async (args: any) => {
      const vector = await embed(args.text);
      await qdrant.upsert([
        {
          id: crypto.randomUUID(),
          vector,
          payload: {
            text: args.text,
            tags: args.tags ?? [],
            agent_id: args.agent_id,
            session_id: args.session_id,
            source: "tool"
          }
        }
      ]);
      return { ok: true };
    }
  );

  ctx.tools.register(
    "memory_search",
    {
      description: "Search memories (hybrid)",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          limit: { type: "number" }
        },
        required: ["query"]
      }
    },
    async (args: any) => {
      const vector = await embed(args.query);
      const results = await qdrant.search(vector, args.limit ?? config.recallLimit);
      return { results };
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
          limit: { type: "number" }
        },
        required: ["query"]
      }
    },
    async (args: any) => {
      const vector = await embed(args.query);
      const results = await qdrant.search(vector, args.limit ?? config.recallLimit);
      return { injected: results, count: results.length };
    }
  );

  ctx.logger.info("memory-alpha: tools registered", { sharedPool: config.sharedPool });
}
