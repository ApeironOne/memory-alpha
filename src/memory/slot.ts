import type { OpenClawPluginApi } from "../types.js";
import type { MemoryAlphaConfig } from "../config/index.js";
import type { SqliteStore } from "../db/sqlite.js";

export function registerMemorySlot(
  api: OpenClawPluginApi,
  _config: MemoryAlphaConfig,
  sqlite: SqliteStore
) {
  api.registerMemoryPromptSection(
    (_params: { availableTools: Set<string> }): string[] => {
      // registerMemoryPromptSection expects a synchronous builder returning
      // string[].  We use a time-based cache refreshed asynchronously.
      return buildMemoryLines(sqlite);
    }
  );
}

// Synchronous helper — returns cached lines.
let cachedLines: string[] = [];
let lastRefresh = 0;
const CACHE_TTL_MS = 30_000;

function buildMemoryLines(sqlite: SqliteStore): string[] {
  const now = Date.now();
  if (now - lastRefresh > CACHE_TTL_MS) {
    lastRefresh = now;
    // Fire-and-forget async refresh
    refreshCache(sqlite).catch(() => {});
  }
  return cachedLines;
}

async function refreshCache(sqlite: SqliteStore): Promise<void> {
  const recent = await sqlite.getRecentMemories(5);
  const profile = await sqlite.getProfile("agent");

  for (const mem of recent) {
    await sqlite.incrementRecallCount(mem.id);
  }

  const block: string[] = [];
  if (profile) {
    block.push("## Agent Profile", profile, "");
  }
  if (recent.length > 0) {
    block.push(
      "## Recent Memories",
      ...recent.map((m) => `[${m.memory_type}] ${m.text}`)
    );
  }
  cachedLines = block;
}
