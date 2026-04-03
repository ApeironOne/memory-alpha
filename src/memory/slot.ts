import type { MemoryAlphaConfig, OpenClawPluginContext } from "../types";
import type { SqliteStore } from "../db/sqlite";

export function registerMemorySlot(
  ctx: OpenClawPluginContext,
  config: MemoryAlphaConfig,
  sqlite: SqliteStore
) {
  ctx.memory.registerSlot("memory", async () => {
    // Fetch recent memories from SQLite (last 24h, limit 5)
    const recent = await sqlite.getRecentMemories(5);

    // Fetch agent profile from profile_cache
    const profile = await sqlite.getProfile("agent");

    // Track recall counts
    for (const mem of recent) {
      await sqlite.incrementRecallCount(mem.id);
    }

    // Format for context injection
    const memoryLines = recent.map(
      (m) => `[${m.memory_type}] ${m.text}`
    );

    const block: string[] = [];
    if (profile) {
      block.push("## Agent Profile", profile, "");
    }
    if (memoryLines.length > 0) {
      block.push("## Recent Memories", ...memoryLines);
    }

    return {
      profile: profile ? [profile] : [],
      memories: recent.map((m) => m.text),
      formatted: block.join("\n"),
    };
  });
}
