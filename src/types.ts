// ---------------------------------------------------------------------------
// Type re-exports from the OpenClaw plugin SDK.
//
// This plugin MUST NOT reinvent SDK types — the real definitions come from
// `openclaw/plugin-sdk` at runtime.  We only re-export what we need so that
// the rest of the codebase stays clean.
// ---------------------------------------------------------------------------

export type {
    AnyAgentTool,
    OpenClawPluginApi,
    OpenClawPluginToolFactory,
    OpenClawPluginToolContext,
    OpenClawPluginToolOptions,
    OpenClawPluginHookOptions,
    PluginLogger,
    PluginHookMessageReceivedEvent,
    PluginHookMessageSentEvent,
    PluginHookBeforePromptBuildEvent,
    PluginHookBeforePromptBuildResult,
    PluginHookAgentContext,
    MemoryPromptSectionBuilder,
    MemoryPluginCapability,
    MemoryPluginRuntime,
    PluginHookBeforeToolCallEvent,
    PluginHookAfterToolCallEvent,
} from "openclaw/plugin-sdk";

// Re-export the full SDK so downstream files can import from here if needed.
export type * from "openclaw/plugin-sdk";
