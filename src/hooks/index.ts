import type { MemoryAlphaConfig, OpenClawPluginContext } from "../types";
import { extractMemoriesFromText } from "../ingest/extract";
import { QdrantClient } from "../ingest/qdrant";
import { embedText } from "../ingest/embeddings";

export function registerHooks(ctx: OpenClawPluginContext, config: MemoryAlphaConfig) {
  const qdrant = new QdrantClient(config.qdrantUrl, config.qdrantCollection);
  const embed = (text: string) => embedText(text, config.embedDimensions, config.ollamaUrl, config.embedModel);

  if (config.autoCapture) {
    ctx.hooks.on("message:received", async (hookCtx: any) => {
      const text = hookCtx?.message?.text ?? "";
      const memories = extractMemoriesFromText(text);
      for (const m of memories) {
        const vector = await embed(m.text);
        await qdrant.upsert([
          {
            id: crypto.randomUUID(),
            vector,
            payload: {
              text: m.text,
              memory_type: m.memoryType ?? "fact",
              source: "message:received",
              session_id: hookCtx?.session?.id,
              agent_id: hookCtx?.session?.agentId
            }
          }
        ]);
      }
    });

    ctx.hooks.on("message:sent", async (hookCtx: any) => {
      const text = hookCtx?.message?.text ?? "";
      const memories = extractMemoriesFromText(text);
      for (const m of memories) {
        const vector = await embed(m.text);
        await qdrant.upsert([
          {
            id: crypto.randomUUID(),
            vector,
            payload: {
              text: m.text,
              memory_type: m.memoryType ?? "fact",
              source: "message:sent",
              session_id: hookCtx?.session?.id,
              agent_id: hookCtx?.session?.agentId
            }
          }
        ]);
      }
    });
  }

  if (config.autoRecall) {
    ctx.hooks.on("before_prompt_build", async (hookCtx: any) => {
      const query = hookCtx?.message?.text ?? "";
      if (!query) return;
      const vector = await embed(query);
      const results = await qdrant.search(vector, config.recallLimit);
      // naive injection
      hookCtx.prompt = hookCtx.prompt || {};
      hookCtx.prompt.memory = results.map((r: any) => r.payload?.text).filter(Boolean);
    });
  }

  ctx.logger.info("memory-alpha: hooks registered", {
    autoCapture: config.autoCapture,
    autoRecall: config.autoRecall
  });
}
