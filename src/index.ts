import { definePluginEntry } from "./types.js";
import type { OpenClawPluginApi } from "./types.js";
import { loadConfig } from "./config/index.js";
import { registerHooks } from "./hooks/index.js";
import { registerMemoryTools } from "./tools/memory.js";
import { registerMemorySlot } from "./memory/slot.js";
import { SqliteStore } from "./db/sqlite.js";

export default definePluginEntry({
  id: "memory-alpha",
  name: "Memory Alpha",
  description: "Collective memory plugin with Qdrant + SQLite",
  kind: "memory",

  register(api: OpenClawPluginApi) {
    const config = loadConfig(undefined);

    api.logger.info("memory-alpha: registering", { config: { ...config } });

    const sqlite = new SqliteStore(config.sqlitePath);
    sqlite.init();

    registerHooks(api, config, sqlite);
    registerMemoryTools(api, config, sqlite);
    registerMemorySlot(api, config, sqlite);
  },
});
