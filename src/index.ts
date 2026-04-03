import type { OpenClawPluginContext } from "./types";
import { loadConfig } from "./config";
import { registerHooks } from "./hooks";
import { registerMemoryTools } from "./tools/memory";
import { registerMemorySlot } from "./memory/slot";

export default function register(ctx: OpenClawPluginContext, rawConfig: any) {
  const config = loadConfig(rawConfig);

  ctx.logger.info("memory-alpha: registering", { config: { ...config } });

  registerHooks(ctx, config);
  registerMemoryTools(ctx, config);
  registerMemorySlot(ctx, config);
}
