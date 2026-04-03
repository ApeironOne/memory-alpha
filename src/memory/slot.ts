import type { MemoryAlphaConfig, OpenClawPluginContext } from "../types";

export function registerMemorySlot(ctx: OpenClawPluginContext, _config: MemoryAlphaConfig) {
  // Placeholder: memory slot replacement
  ctx.memory.registerSlot("memory", async () => {
    // TODO: return profile + recall bundle
    return { profile: [], memories: [] };
  });
}
