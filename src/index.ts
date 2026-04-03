import type { OpenClawPluginContext } from "./types";
import { loadConfig } from "./config";

export default function register(ctx: OpenClawPluginContext, rawConfig: any) {
  const config = loadConfig(rawConfig);

  ctx.logger.info("memory-alpha: registering", { config: { ...config, /* omit secrets later */ } });

  // TODO: register hooks
  // message:received -> auto-capture
  // message:sent -> auto-capture
  // before_prompt_build -> auto-recall inject

  // TODO: register tools
  // memory_save, memory_search, memory_recall

  // TODO: register memory slot replacement
  // ctx.memory.registerSlot("memory", handler)
}
