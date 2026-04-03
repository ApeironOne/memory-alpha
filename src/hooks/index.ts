import type { MemoryAlphaConfig, OpenClawPluginContext } from "../types";
import type { SqliteStore } from "../db/sqlite";
import { extractMemoriesFromText } from "../ingest/extract";
import { QdrantClient } from "../ingest/qdrant";
import { embedText } from "../ingest/embeddings";

export function registerHooks(
  ctx: OpenClawPluginContext,
  config: MemoryAlphaConfig,
  sqlite: SqliteStore
) {
  const qdrant = new QdrantClient(config.qdrantUrl, config.qdrantCollection);
  const embed = (text: string) =>
    embedText(text, config.embedDimensions, config.ollamaUrl, config.embedModel);

  async function captureMemories(text: string, source: string, hookCtx: any) {
    const memories = extractMemoriesFromText(text);
    for (const m of memories) {
      const id = crypto.randomUUID();
      const vector = await embed(m.text);
      const now = Date.now();

      // Write to Qdrant
      await qdrant.upsert([
        {
          id,
          vector,
          payload: {
            text: m.text,
            memory_type: m.memoryType,
            source,
            session_id: hookCtx?.session?.id,
            agent_id: hookCtx?.session?.agentId,
            created_at: now,
          },
        },
      ]);

      // Write to SQLite
      await sqlite.insertMemory({
        id,
        text: m.text,
        memory_type: m.memoryType,
        session_id: hookCtx?.session?.id,
        agent_id: hookCtx?.session?.agentId,
        source,
      });
    }
  }

  if (config.autoCapture) {
    ctx.hooks.on("message:received", async (hookCtx: any) => {
      const text = hookCtx?.message?.text ?? "";
      await captureMemories(text, "message:received", hookCtx);
    });

    ctx.hooks.on("message:sent", async (hookCtx: any) => {
      const text = hookCtx?.message?.text ?? "";
      await captureMemories(text, "message:sent", hookCtx);
    });
  }

  if (config.autoRecall) {
    ctx.hooks.on("before_prompt_build", async (hookCtx: any) => {
      const query = hookCtx?.message?.text ?? "";
      if (!query) return;
      const vector = await embed(query);
      const results = await qdrant.search(vector, config.recallLimit);
      hookCtx.prompt = hookCtx.prompt || {};
      hookCtx.prompt.memory = results
        .map((r: any) => r.payload?.text)
        .filter(Boolean);
    });
  }

  ctx.logger.info("memory-alpha: hooks registered", {
    autoCapture: config.autoCapture,
    autoRecall: config.autoRecall,
  });
}
