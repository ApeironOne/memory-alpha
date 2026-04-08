// ---------------------------------------------------------------------------
// Inline OpenClaw / pi-agent-core type definitions
// We define the shapes locally because 'openclaw/plugin-sdk' is not published.
// The shapes MUST match the real SDK at runtime.
// ---------------------------------------------------------------------------

import type { TSchema, Static } from "@sinclair/typebox";

// ---- AgentTool (from @mariozechner/pi-agent-core) ----

export interface TextContent {
  type: "text";
  text: string;
}

export interface ImageContent {
  type: "image";
  data: string;
  mimeType: string;
}

export interface AgentToolResult<TDetails = any> {
  content: (TextContent | ImageContent)[];
  details: TDetails;
}

export interface AgentTool<
  TParameters extends TSchema = TSchema,
  TDetails = any
> {
  name: string;
  description: string;
  parameters: TParameters;
  label: string;
  execute: (
    toolCallId: string,
    params: Static<TParameters>,
    signal?: AbortSignal
  ) => Promise<AgentToolResult<TDetails>>;
}

// ---- OpenClaw Plugin API ----

export interface OpenClawPluginToolContext {
  session?: { id?: string; agentId?: string };
  [key: string]: any;
}

export interface OpenClawHookRegistration {
  name: string;
  handler: (...args: any[]) => any;
  priority?: number;
}

export interface OpenClawPluginApi {
  registerTool(
    tool:
      | AgentTool<any, any>
      | ((ctx: OpenClawPluginToolContext) => AgentTool<any, any>)
  ): void;
  registerHook(hook: OpenClawHookRegistration): void;
  registerMemoryPromptSection(
    builder: (params: { availableTools: Set<string> }) => string[]
  ): void;
  registerMemoryRuntime(runtime: {
    getMemorySearchManager?: (params: any) => any;
    resolveMemoryBackendConfig?: (params: any) => any;
  }): void;
  logger: {
    info(msg: string, meta?: any): void;
    warn(msg: string, meta?: any): void;
    error(msg: string, meta?: any): void;
  };
}

export interface PluginEntryOptions {
  id: string;
  name: string;
  description: string;
  kind: string;
  hooks?: string[];
  register(api: OpenClawPluginApi): void;
}

export interface PluginEntry extends PluginEntryOptions {}

/**
 * Mirrors openclaw/plugin-sdk/plugin-entry#definePluginEntry.
 * Simply returns the descriptor so the host can introspect + call register().
 */
export function definePluginEntry(opts: PluginEntryOptions): PluginEntry {
  return opts;
}

export type { MemoryAlphaConfig } from "./config/index.js";
