import type {
    OpenClawPluginApi,
    OpenClawPluginHookOptions,
    InternalHookEvent,
} from "../types.js";
import type { MemoryAlphaConfig } from "../config/index.js";
import type { SqliteStore } from "../db/sqlite.js";
import { QdrantClient } from "../ingest/qdrant.js";
import { embedText } from "../ingest/embeddings.js";
import { extractMemoriesFromText } from "../ingest/extract.js";

export function registerHooks(
    api: OpenClawPluginApi,
    config: MemoryAlphaConfig,
    sqlite: SqliteStore
) {
    const hasVector = !!(config.qdrantUrl && config.ollamaUrl);
    const qdrant = hasVector
        ? new QdrantClient(config.qdrantUrl, config.qdrantCollection ?? "memory_alpha")
        : null;
    const embed = hasVector
        ? (text: string) =>
            embedText(text, config.embedDimensions, config.ollamaUrl, config.embedModel)
        : null;

    async function saveMemory(
        text: string,
        memoryType: string,
        source: string,
        sessionContext: { sessionId?: string; agentId?: string; userId?: string }
    ) {
        try {
            const id = crypto.randomUUID();
            const now = Date.now();

            if (qdrant && embed) {
                const vector = await embed(text);
                await qdrant.upsert([{
                    id,
                    vector,
                    payload: {
                        text,
                        memory_type: memoryType,
                        source,
                        session_id: sessionContext.sessionId,
                        agent_id: sessionContext.agentId,
                        user_id: sessionContext.userId,
                        created_at: now,
                    },
                }]);
            }

            await sqlite.insertMemory({
                id,
                text,
                memory_type: memoryType,
                session_id: sessionContext.sessionId,
                agent_id: sessionContext.agentId,
                user_id: sessionContext.userId,
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
        sessionContext: { sessionId?: string; agentId?: string; userId?: string }
    ) {
        const mode = config.captureMode ?? "hybrid";

        if (mode === "full" || mode === "hybrid") {
            await saveMemory(text, "transcript", source, sessionContext);
        }
        if (mode === "filtered" || mode === "hybrid") {
            const memories = extractMemoriesFromText(text);
            for (const m of memories) {
                await saveMemory(m.text, m.memoryType, source, sessionContext);
            }
        }
    }

    // Extract text from hook event context (handles various message shapes)
    function extractText(ctx: Record<string, unknown>): string | null {
        // Direct text field
        if (typeof ctx.text === "string" && ctx.text.length > 0) return ctx.text;
        // message.text
        if (typeof ctx.message === "object" && ctx.message !== null) {
            const msg = ctx.message as Record<string, unknown>;
            if (typeof msg.text === "string" && msg.text.length > 0) return msg.text;
            if (typeof msg.body === "string" && msg.body.length > 0) return msg.body;
            if (typeof msg.content === "string" && msg.content.length > 0) return msg.content;
        }
        // body field
        if (typeof ctx.body === "string" && ctx.body.length > 0) return ctx.body;
        // content field (array of blocks)
        if (Array.isArray(ctx.content)) {
            const texts = ctx.content
                .filter((c: any) => c?.type === "text" && typeof c.text === "string")
                .map((c: any) => c.text);
            if (texts.length > 0) return texts.join("\n");
        }
        // string content field
        if (typeof ctx.content === "string" && ctx.content.length > 0) return ctx.content;
        return null;
    }

    // Helper to pull session context from the event
    function sessionCtx(event: InternalHookEvent) {
        const ctx = event.context;
        return {
            sessionId: event.sessionKey,
            agentId: typeof ctx.agentId === "string" ? ctx.agentId : undefined,
            userId: typeof ctx.userId === "string" ? ctx.userId
                : typeof ctx.sender === "string" ? ctx.sender
                : undefined,
        };
    }

    const hookOpts: OpenClawPluginHookOptions = { priority: 10 };

    // ── message_received: capture incoming user messages ──
    if (config.autoCapture) {
        api.registerHook(
            "message_received",
            async (event: InternalHookEvent) => {
                const text = extractText(event.context);
                if (!text || text.length < 20) return;
                await captureMemories(text, "message_received", sessionCtx(event));
            },
            hookOpts
        );

        api.registerHook(
            "message_sent",
            async (event: InternalHookEvent) => {
                const text = extractText(event.context);
                if (!text || text.length < 20) return;
                await captureMemories(text, "message_sent", sessionCtx(event));
            },
            hookOpts
        );
    }

    // ── before_prompt_build: auto-inject recent memories ──
    if (config.autoRecall && qdrant && embed) {
        api.registerHook(
            "before_prompt_build",
            async (event: InternalHookEvent) => {
                const ctx = event.context;
                const body = typeof ctx.cleanBody === "string"
                    ? ctx.cleanBody
                    : typeof ctx.body === "string"
                        ? ctx.body
                        : "";
                const query = body.slice(0, 500);
                if (!query) return;

                try {
                    const vector = await embed(query);
                    const results = await qdrant.search(vector, config.recallLimit);
                    const lines = results
                        .map((r: any) => r.payload?.text)
                        .filter(Boolean);

                    if (lines.length > 0) {
                        // Attach memory section to the event context for prompt injection
                        (event.context as Record<string, unknown>).__memorySection = [
                            "## Memory Alpha Recall",
                            ...lines.map((t: string) => `- ${t}`),
                        ].join("\n");
                    }
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
