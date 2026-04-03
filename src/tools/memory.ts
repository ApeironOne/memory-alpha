import type { MemoryAlphaConfig, OpenClawPluginContext } from "../types";

export function registerMemoryTools(ctx: OpenClawPluginContext, config: MemoryAlphaConfig) {
  ctx.tools.register(
    "memory_save",
    {
      description: "Store a memory in the shared pool",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string" },
          tags: { type: "array", items: { type: "string" } }
        },
        required: ["text"]
      }
    },
    async (_args: any) => {
      // TODO: implement store in Qdrant + SQLite graph
      return { ok: true, queued: true };
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
    async (_args: any) => {
      // TODO: implement hybrid search
      return { results: [] };
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
    async (_args: any) => {
      // TODO: implement recall with ranking + budget
      return { injected: [], count: 0 };
    }
  );

  ctx.logger.info("memory-alpha: tools registered", { sharedPool: config.sharedPool });
}
