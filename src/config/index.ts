import { z } from "zod";
import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { resolve } from "path";

const CONFIG_PATH = resolve(homedir(), ".openclaw/plugins/memory-alpha/config.json");

// Schema — NO defaults on required fields; everything else explicit.
export const ConfigSchema = z.object({
    // Storage (required)
    sqlitePath: z.string().describe("Path to SQLite database file"),

    // Qdrant (optional — for vector search)
    qdrantUrl: z.string().optional().describe("Qdrant URL (e.g. http://192.168.0.126:6333)"),
    qdrantCollection: z.string().optional().describe("Qdrant collection name"),

    // Ollama (optional — for embeddings, requires Qdrant)
    ollamaUrl: z.string().optional().describe("Ollama URL (e.g. http://192.168.0.126:11434)"),
    embedModel: z.string().optional().describe("Embedding model name"),
    embedDimensions: z.number().optional().describe("Embedding dimensions"),

    // Behavior
    sharedPool: z.boolean().default(false).describe("Multi-gateway shared memory mode"),
    autoCapture: z.boolean().default(true).describe("Auto-capture memories from sessions"),
    autoRecall: z.boolean().default(true).describe("Auto-inject recent memories into prompts"),
    recallLimit: z.number().default(10).describe("Number of memories to recall"),
    captureMode: z.enum(["filtered", "full", "hybrid"]).default("hybrid").describe("Memory capture mode"),
});

export type MemoryAlphaConfig = z.infer<typeof ConfigSchema>;

export interface ConfigValidationResult {
    valid: boolean;
    errors?: string[];
    warnings?: string[];
    config?: MemoryAlphaConfig;
    mode: "sqlite-only" | "hybrid" | "full";
}

/**
 * Load config file from disk if it exists.
 */
function loadConfigFile(): Record<string, any> | null {
    try {
        if (existsSync(CONFIG_PATH)) {
            return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
        }
    } catch {
        // ignore malformed file
    }
    return null;
}

/**
 * Load & validate config from: config file → environment → OpenClaw config → defaults.
 * OpenClaw config is passed in from the plugin API.
 */
export function loadConfig(openclawConfig?: Record<string, any>): ConfigValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const file = loadConfigFile();
    const env = process.env;

    // SQLite path (required) — try config file, env, OpenClaw config
    let sqlitePath = file?.sqlitePath ?? env.MEMORY_ALPHA_SQLITE_PATH
        ?? openclawConfig?.memoryAlpha?.sqlitePath;
    if (!sqlitePath) {
        sqlitePath = resolve(homedir(), ".openclaw/memory/memory-alpha.db");
        warnings.push(`No sqlitePath configured — defaulting to ${sqlitePath}`);
    }

    // Expand tilde
    if (sqlitePath.startsWith("~/")) {
        sqlitePath = resolve(homedir(), sqlitePath.slice(2));
    }

    // Qdrant (optional)
    const qdrantUrl = file?.qdrantUrl ?? env.MEMORY_ALPHA_QDRANT_URL
        ?? openclawConfig?.memoryAlpha?.qdrantUrl;
    const qdrantCollection = file?.qdrantCollection ?? env.MEMORY_ALPHA_QDRANT_COLLECTION
        ?? openclawConfig?.memoryAlpha?.qdrantCollection ?? "memory_alpha";

    // Ollama (optional, requires Qdrant)
    const ollamaUrl = file?.ollamaUrl ?? env.MEMORY_ALPHA_OLLAMA_URL
        ?? openclawConfig?.memoryAlpha?.ollamaUrl;
    const embedModel = file?.embedModel ?? env.MEMORY_ALPHA_EMBED_MODEL
        ?? openclawConfig?.memoryAlpha?.embedModel ?? "snowflake-arctic-embed2";
    const embedDimensions = parseInt(
        file?.embedDimensions ?? env.MEMORY_ALPHA_EMBED_DIMENSIONS
            ?? openclawConfig?.memoryAlpha?.embedDimensions ?? "1024",
        10
    );

    // Behavior flags
    const sharedPool = parseBool(
        file?.sharedPool ?? env.MEMORY_ALPHA_SHARED_POOL
        ?? openclawConfig?.memoryAlpha?.sharedPool, false
    );
    const autoCapture = parseBool(
        file?.autoCapture ?? env.MEMORY_ALPHA_AUTO_CAPTURE
        ?? openclawConfig?.memoryAlpha?.autoCapture, true
    );
    const autoRecall = parseBool(
        file?.autoRecall ?? env.MEMORY_ALPHA_AUTO_RECALL
        ?? openclawConfig?.memoryAlpha?.autoRecall, true
    );
    const recallLimit = parseInt(
        file?.recallLimit ?? env.MEMORY_ALPHA_RECALL_LIMIT
        ?? openclawConfig?.memoryAlpha?.recallLimit ?? "10", 10
    );
    const captureMode = file?.captureMode ?? env.MEMORY_ALPHA_CAPTURE_MODE
        ?? openclawConfig?.memoryAlpha?.captureMode ?? "hybrid";

    // Validate URLs
    if (qdrantUrl && !isValidHttpUrl(qdrantUrl)) {
        errors.push(`Invalid Qdrant URL: "${qdrantUrl}"`);
    }
    if (ollamaUrl && !isValidHttpUrl(ollamaUrl)) {
        errors.push(`Invalid Ollama URL: "${ollamaUrl}"`);
    }
    if (errors.length > 0) {
        return { valid: false, errors, warnings, mode: "sqlite-only" };
    }

    // Determine mode
    let mode: "sqlite-only" | "hybrid" | "full" = "sqlite-only";
    if (qdrantUrl && ollamaUrl) mode = "full";
    else if (qdrantUrl) {
        mode = "hybrid";
        warnings.push("Qdrant configured but no Ollama URL — embeddings disabled");
    } else {
        warnings.push("Running in SQLite-only mode (no vector search)");
    }

    // Build + validate
    const config: MemoryAlphaConfig = {
        sqlitePath,
        qdrantUrl,
        qdrantCollection,
        ollamaUrl,
        embedModel,
        embedDimensions,
        sharedPool,
        autoCapture,
        autoRecall,
        recallLimit,
        captureMode,
    };

    try {
        const validated = ConfigSchema.parse(config);
        return { valid: true, config: validated, warnings: warnings.length > 0 ? warnings : undefined, mode };
    } catch (err: any) {
        errors.push(`Config validation failed: ${err.message}`);
        return { valid: false, errors, warnings, mode };
    }
}

function isValidHttpUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch {
        return false;
    }
}

function parseBool(value: any, defaultValue: boolean): boolean {
    if (value === undefined || value === null) return defaultValue;
    if (typeof value === "boolean") return value;
    const str = String(value).toLowerCase();
    if (str === "true" || str === "1" || str === "yes") return true;
    if (str === "false" || str === "0" || str === "no") return false;
    return defaultValue;
}
