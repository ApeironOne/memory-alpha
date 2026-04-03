import type { OpenClawPluginApi } from "../types.js";
import type { MemoryAlphaConfig } from "../config/index.js";
import type { SqliteStore } from "../db/sqlite.js";
import { extractMemoriesFromText } from "../ingest/extract.js";
import { QdrantClient } from "../ingest/qdrant.js";
import { embedText } from "../ingest/embeddings.js";

export function registerHooks(
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

  async function captureMemories(
    text: string,
    source: string,
    hookCtx: any
  ) {
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
    api.on(
      "message:received",
      async (hookCtx: any) => {
        const text = hookCtx?.message?.text ?? "";
        await captureMemories(text, "message:received", hookCtx);
      },
      { priority: 10 }
    );

    api.on(
      "message:sent",
      async (hookCtx: any) => {
        const text = hookCtx?.message?.text ?? "";
        await captureMemories(text, "message:sent", hookCtx);
      },
      { priority: 10 }
    );
  }

  if (config.autoRecall) {
    api.on(
      "before_prompt_build",
      async (hookCtx: any) => {
        const query = hookCtx?.message?.text ?? "";
        if (!query) return;
        const vector = await embed(query);
        const results = await qdrant.search(vector, config.recallLimit);
        hookCtx.prompt = hookCtx.prompt || {};
        hookCtx.prompt.memory = results
          .map((r: any) => r.payload?.text)
          .filter(Boolean);
      },
      { priority: 5 }
    );
  }

  api.logger.info("memory-alpha: hooks registered", {
    autoCapture: config.autoCapture,
    autoRecall: config.autoRecall,
  });
}
