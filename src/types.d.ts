// Minimal OpenClaw plugin typings (placeholder)
// Replace with actual OpenClaw plugin types once available.

export type OpenClawHook = (ctx: any) => Promise<void> | void;

export interface OpenClawPluginContext {
  hooks: {
    on: (event: string, fn: OpenClawHook) => void;
  };
  tools: {
    register: (name: string, spec: any, handler: any) => void;
  };
  memory: {
    registerSlot: (name: string, handler: any) => void;
  };
  logger: {
    info: (msg: string, meta?: any) => void;
    warn: (msg: string, meta?: any) => void;
    error: (msg: string, meta?: any) => void;
  };
}

export type { MemoryAlphaConfig } from "./config";
