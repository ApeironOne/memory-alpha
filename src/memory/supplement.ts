/**
 * Register Memory Alpha as a prompt supplement so recent memories
 * appear in the agent system prompt automatically.
 *
 * Uses registerMemoryPromptSupplement from the OpenClaw SDK (works
 * on every OpenClaw install that supports memory plugins).
 */
import type { OpenClawPluginApi } from "../types.js";
import type { MemoryAlphaConfig } from "../config/index.js";
import type { SqliteStore } from "../db/sqlite.js";

export async function registerMemorySupplement(
    api: OpenClawPluginApi,
    config: MemoryAlphaConfig,
    sqlite: SqliteStore,
    pluginId: string
) {
    try {
        // Dynamic import — the SDK path may not exist at build time
        // but will be present at runtime inside OpenClaw's require tree.
        const {
            registerMemoryCapability,
            registerMemoryPromptSupplement,
        } = await import("openclaw/plugin-sdk");

        // Primary: register as a memory capability (the new canonical API)
        if (typeof registerMemoryCapability === "function") {
            registerMemoryCapability(pluginId, {
                promptBuilder: async ({ availableTools, citationsMode }) => {
                    try {
                        const recent = await sqlite.getRecentMemories(config.recallLimit);
                        if (recent.length === 0) return [];

                        for (const m of recent) {
                            await sqlite.incrementRecallCount(m.id);
                        }

                        return [
                            "## Recent Memories",
                            ...recent.map(
                                (m) => `- [${m.memory_type}] ${m.text}`
                            ),
                        ];
                    } catch (err: any) {
                        api.logger.error("memory-alpha: promptBuilder error", {
                            error: err.message,
                        });
                        return [];
                    }
                },
            });
            api.logger.info("memory-alpha: registered via registerMemoryCapability");
            return;
        }

        // Fallback: the deprecated prompt supplement API
        if (typeof registerMemoryPromptSupplement === "function") {
            registerMemoryPromptSupplement(pluginId, async () => {
                try {
                    const recent = await sqlite.getRecentMemories(config.recallLimit);
                    if (recent.length === 0) return [];

                    for (const m of recent) {
                        await sqlite.incrementRecallCount(m.id);
                    }

                    return [
                        "## Recent Memories",
                        ...recent.map((m) => `- [${m.memory_type}] ${m.text}`),
                    ];
                } catch {
                    return [];
                }
            });
            api.logger.info("memory-alpha: registered via registerMemoryPromptSupplement (fallback)");
        }
    } catch (err: any) {
        // Neither API available — this OpenClaw version doesn't support memory plugins.
        // That's fine — the tools and hooks still work.
        api.logger.warn("memory-alpha: memory supplement API not available, skipping prompt injection", {
            error: err.message,
        });
    }
}
