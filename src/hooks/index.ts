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
  const hasVector = !!(config.qdrantUrl && config.ollamaUrl);
  const qdrant = hasVector
    ? new QdrantClient(config.qdrantUrl!, config.qdrantCollection ?? "memory_alpha")
    : null;
  const embed = hasVector
    ? (text: string) =>
        embedText(
          text,
          config.embedDimensions,
          config.ollamaUrl!,
          config.embedModel
        )
    : null;

  async function saveMemory(
    text: string,
    memoryType: string,
    source: string,
    hookCtx: any
  ) {
    const userId =
      hookCtx?.user?.id ?? hookCtx?.author?.id ?? hookCtx?.message?.userId;
    try {
      const id = crypto.randomUUID();
      const now = Date.now();

      if (qdrant && embed) {
        const vector = await embed(text);
        await qdrant.upsert([
          {
            id,
            vector,
            payload: {
              text,
              memory_type: memoryType,
              source,
              session_id: hookCtx?.session?.id,
              agent_id: hookCtx?.session?.agentId,
              user_id: userId,
              created_at: now,
            },
          },
        ]);
      }

      await sqlite.insertMemory({
        id,
        text,
        memory_type: memoryType,
        session_id: hookCtx?.session?.id,
        agent_id: hookCtx?.session?.agentId,
        user_id: userId,
        source,
      });
    } catch (err: any) {
      api.logger.error("memory-alpha: auto-capture failed", {
        source,
        memoryType,
        error: err.message,
      });
    }
  }

  async function captureMemories(
    text: string,
    source: string,
    hookCtx: any
  ) {
    const mode = config.captureMode ?? "hybrid";

    // Save full transcript
    if (mode === "full" || mode === "hybrid") {
      await saveMemory(text, "transcript", source, hookCtx);
    }

    // Save filtered key moments
    if (mode === "filtered" || mode === "hybrid") {
      const memories = extractMemoriesFromText(text);
      for (const m of memories) {
        await saveMemory(m.text, m.memoryType, source, hookCtx);
      }
    }
  }

  if (config.autoCapture) {
    api.on(
      "message:received",
      async (hookCtx: any) => {
        const text = hookCtx?.message?.text;
        if (typeof text !== "string" || !text) return;
        await captureMemories(text, "message:received", hookCtx);
      },
      { priority: 10 }
    );

    api.on(
      "message:sent",
      async (hookCtx: any) => {
        const text = hookCtx?.message?.text;
        if (typeof text !== "string" || !text) return;
        await captureMemories(text, "message:sent", hookCtx);
      },
      { priority: 10 }
    );
  }

  if (config.autoRecall && qdrant && embed) {
    api.on(
      "before_prompt_build",
      async (hookCtx: any) => {
        const query = hookCtx?.message?.text;
        if (typeof query !== "string" || !query) return;
        try {
          const vector = await embed(query);
          const results = await qdrant.search(vector, config.recallLimit);
          hookCtx.prompt = hookCtx.prompt || {};
          hookCtx.prompt.memory = results
            .map((r: any) => r.payload?.text)
            .filter(Boolean);
        } catch (err: any) {
          api.logger.error("memory-alpha: auto-recall failed", {
            error: err.message,
          });
        }
      },
      { priority: 5 }
    );
  }

  api.logger.info("memory-alpha: hooks registered", {
    autoCapture: config.autoCapture,
    autoRecall: config.autoRecall,
  });
}
