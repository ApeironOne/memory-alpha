import { z } from "zod";
import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { resolve } from "path";

const CONFIG_PATH = resolve(homedir(), ".openclaw/plugins/memory-alpha/config.json");

// Schema with NO defaults - all must be explicitly provided
export const ConfigSchema = z.object({
  // Storage (required)
  sqlitePath: z.string().describe("Path to SQLite database file"),
  
  // Qdrant (optional - for vector search)
  qdrantUrl: z.string().optional().describe("Qdrant URL (e.g. http://192.168.0.126:6333)"),
  qdrantCollection: z.string().optional().describe("Qdrant collection name"),
  
  // Ollama (optional - for embeddings, requires Qdrant)
  ollamaUrl: z.string().optional().describe("Ollama URL (e.g. http://192.168.0.126:11434)"),
  embedModel: z.string().optional().describe("Embedding model name"),
  embedDimensions: z.number().optional().describe("Embedding dimensions"),
  
  // Behavior
  sharedPool: z.boolean().default(false).describe("Multi-gateway shared memory mode"),
  autoCapture: z.boolean().default(true).describe("Auto-capture memories from sessions"),
  autoRecall: z.boolean().default(true).describe("Auto-inject recent memories into prompts"),
  recallLimit: z.number().default(10).describe("Number of memories to recall")
});

export type MemoryAlphaConfig = z.infer<typeof ConfigSchema>;

export interface ConfigValidationResult {
  valid: boolean;
  config?: MemoryAlphaConfig;
  errors?: string[];
  warnings?: string[];
  mode: "sqlite-only" | "hybrid" | "full";
}

/**
 * Load and validate configuration from environment variables.
 * 
 * Required:
 * - MEMORY_ALPHA_SQLITE_PATH
 * 
 * Optional (for vector search):
 * - MEMORY_ALPHA_QDRANT_URL
 * - MEMORY_ALPHA_QDRANT_COLLECTION (default: memory_alpha)
 * - MEMORY_ALPHA_OLLAMA_URL
 * - MEMORY_ALPHA_EMBED_MODEL (default: snowflake-arctic-embed2)
 * - MEMORY_ALPHA_EMBED_DIMENSIONS (default: 1024)
 * 
 * Optional (behavior):
 * - MEMORY_ALPHA_SHARED_POOL (default: false)
 * - MEMORY_ALPHA_AUTO_CAPTURE (default: true)
 * - MEMORY_ALPHA_AUTO_RECALL (default: true)
 * - MEMORY_ALPHA_RECALL_LIMIT (default: 10)
 */
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

export function loadConfig(overrides?: any): ConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Try config file first, then environment variables
  const file = loadConfigFile();
  const env = process.env;

  // SQLite path (required)
  let sqlitePath = overrides?.sqlitePath || file?.sqlitePath || env.MEMORY_ALPHA_SQLITE_PATH;
  if (!sqlitePath) {
    errors.push("No configuration found. Run: openclaw memory-alpha setup");
    errors.push("Or set MEMORY_ALPHA_SQLITE_PATH environment variable");
    return { valid: false, errors, warnings, mode: "sqlite-only" };
  }
  
  // Expand tilde
  if (sqlitePath.startsWith("~/")) {
    sqlitePath = resolve(homedir(), sqlitePath.slice(2));
  }
  
  // Qdrant (optional)
  const qdrantUrl = overrides?.qdrantUrl || file?.qdrantUrl || env.MEMORY_ALPHA_QDRANT_URL;
  const qdrantCollection = overrides?.qdrantCollection || file?.qdrantCollection || env.MEMORY_ALPHA_QDRANT_COLLECTION || "memory_alpha";

  // Ollama (optional, requires Qdrant)
  const ollamaUrl = overrides?.ollamaUrl || file?.ollamaUrl || env.MEMORY_ALPHA_OLLAMA_URL;
  const embedModel = overrides?.embedModel || file?.embedModel || env.MEMORY_ALPHA_EMBED_MODEL || "snowflake-arctic-embed2";
  const embedDimensions = parseInt(overrides?.embedDimensions || file?.embedDimensions || env.MEMORY_ALPHA_EMBED_DIMENSIONS || "1024", 10);

  // Behavior flags
  const sharedPool = parseBool(overrides?.sharedPool ?? file?.sharedPool ?? env.MEMORY_ALPHA_SHARED_POOL, false);
  const autoCapture = parseBool(overrides?.autoCapture ?? file?.autoCapture ?? env.MEMORY_ALPHA_AUTO_CAPTURE, true);
  const autoRecall = parseBool(overrides?.autoRecall ?? file?.autoRecall ?? env.MEMORY_ALPHA_AUTO_RECALL, true);
  const recallLimit = parseInt(overrides?.recallLimit || file?.recallLimit || env.MEMORY_ALPHA_RECALL_LIMIT || "10", 10);
  
  // Validate URLs
  if (qdrantUrl && !isValidHttpUrl(qdrantUrl)) {
    errors.push(`Invalid Qdrant URL: "${qdrantUrl}" — must be a valid http or https URL`);
  }
  if (ollamaUrl && !isValidHttpUrl(ollamaUrl)) {
    errors.push(`Invalid Ollama URL: "${ollamaUrl}" — must be a valid http or https URL`);
  }
  if (errors.length > 0) {
    return { valid: false, errors, warnings, mode: "sqlite-only" };
  }

  // Determine mode
  let mode: "sqlite-only" | "hybrid" | "full" = "sqlite-only";

  if (qdrantUrl && ollamaUrl) {
    mode = "full";
  } else if (qdrantUrl) {
    mode = "hybrid";
    warnings.push("Qdrant configured but no Ollama URL - embeddings disabled");
  } else {
    warnings.push("Running in SQLite-only mode (no vector search)");
  }
  
  // Build config
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
    recallLimit
  };
  
  // Validate with schema
  try {
    const validated = ConfigSchema.parse(config);
    return {
      valid: true,
      config: validated,
      warnings: warnings.length > 0 ? warnings : undefined,
      mode
    };
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

/**
 * Generate example configurations for different deployment scenarios
 */
export function getConfigExamples(): Record<string, string> {
  return {
    "SQLite-only (Synology)": `
MEMORY_ALPHA_SQLITE_PATH=/volume1/openclaw/memory-alpha.db
MEMORY_ALPHA_SHARED_POOL=false
`,
    
    "SQLite-only (Linux)": `
MEMORY_ALPHA_SQLITE_PATH=/opt/openclaw/memory-alpha.db
MEMORY_ALPHA_SHARED_POOL=false
`,
    
    "SQLite-only (macOS)": `
MEMORY_ALPHA_SQLITE_PATH=~/.openclaw/memory/memory-alpha.db
MEMORY_ALPHA_SHARED_POOL=false
`,
    
    "Shared pool (remote Qdrant + Ollama)": `
MEMORY_ALPHA_SQLITE_PATH=~/.openclaw/memory/memory-alpha.db
MEMORY_ALPHA_QDRANT_URL=http://192.168.0.126:6333
MEMORY_ALPHA_QDRANT_COLLECTION=memory_alpha
MEMORY_ALPHA_OLLAMA_URL=http://192.168.0.126:11434
MEMORY_ALPHA_EMBED_MODEL=snowflake-arctic-embed2
MEMORY_ALPHA_EMBED_DIMENSIONS=1024
MEMORY_ALPHA_SHARED_POOL=true
`,
    
    "Hybrid (local Ollama + remote Qdrant)": `
MEMORY_ALPHA_SQLITE_PATH=~/.openclaw/memory/memory-alpha.db
MEMORY_ALPHA_QDRANT_URL=http://192.168.0.126:6333
MEMORY_ALPHA_QDRANT_COLLECTION=memory_alpha
MEMORY_ALPHA_OLLAMA_URL=http://127.0.0.1:11434
MEMORY_ALPHA_EMBED_MODEL=snowflake-arctic-embed2
MEMORY_ALPHA_SHARED_POOL=true
`
  };
}
