import type { OpenClawPluginContext } from "./types";
import { loadConfig } from "./config";
import { registerHooks } from "./hooks";
import { registerMemoryTools } from "./tools/memory";
import { registerMemorySlot } from "./memory/slot";
import { SqliteStore } from "./db/sqlite";

export default function register(ctx: OpenClawPluginContext, rawConfig: any) {
  const config = loadConfig(rawConfig);

  ctx.logger.info("memory-alpha: registering", { config: { ...config } });

  const sqlite = new SqliteStore(config.sqlitePath);
  sqlite.init();

  registerHooks(ctx, config, sqlite);
  registerMemoryTools(ctx, config, sqlite);
  registerMemorySlot(ctx, config, sqlite);
}
