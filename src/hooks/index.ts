import type { MemoryAlphaConfig, OpenClawPluginContext } from "../types";

export function registerHooks(ctx: OpenClawPluginContext, config: MemoryAlphaConfig) {
  if (config.autoCapture) {
    ctx.hooks.on("message:received", async (_ctx) => {
      // TODO: extract memories from inbound messages
    });

    ctx.hooks.on("message:sent", async (_ctx) => {
      // TODO: extract memories from outbound messages
    });
  }

  if (config.autoRecall) {
    ctx.hooks.on("before_prompt_build", async (_ctx) => {
      // TODO: run recall and inject context
    });
  }

  ctx.logger.info("memory-alpha: hooks registered", {
    autoCapture: config.autoCapture,
    autoRecall: config.autoRecall
  });
}
