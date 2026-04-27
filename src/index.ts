import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { mkdirSync, existsSync } from "fs";
import { dirname, resolve, sep } from "path";
import { loadConfig } from "./config/index.js";
import { registerHooks } from "./hooks/index.js";
import { registerMemoryTools } from "./tools/memory.js";
import { registerMemorySupplement } from "./memory/supplement.js";
import { SqliteStore } from "./db/sqlite.js";

export default definePluginEntry({
    id: "memory-alpha",
    name: "Memory Alpha",
    description: "Universal memory system with SQLite keyword search and optional Qdrant vector search",
    kind: "memory",
    register(api: OpenClawPluginApi) {
        // Load and validate configuration
        const result = loadConfig(api.config);

        if (!result.valid) {
            api.logger.error("memory-alpha: configuration invalid", {
                errors: result.errors,
                warnings: result.warnings,
            });
            api.logger.error('Run "openclaw memory-alpha setup" to configure');
            throw new Error("Memory Alpha plugin configuration invalid. Run setup to configure.");
        }

        const config = result.config;

        // Log config status
        api.logger.info("memory-alpha: registering", {
            mode: result.mode,
            sqlitePath: config.sqlitePath,
            qdrant: config.qdrantUrl ? "enabled" : "disabled",
            ollama: config.ollamaUrl ? "enabled" : "disabled",
            sharedPool: config.sharedPool,
        });

        if (result.warnings && result.warnings.length > 0) {
            result.warnings.forEach((w: string) => api.logger.warn("memory-alpha:", w));
        }

        // Ensure SQLite parent directory exists
        try {
            const dir = dirname(config.sqlitePath);
            if (!existsSync(dir)) {
                mkdirSync(dir, { recursive: true });
            }
        } catch (err: any) {
            api.logger.error("memory-alpha: failed to create SQLite directory", {
                error: err.message,
            });
            throw new Error(
                `Cannot create directory for SQLite at ${config.sqlitePath}: ${err.message}`
            );
        }

        // Initialize SQLite (always required)
        const sqlite = new SqliteStore(config.sqlitePath);
        try {
            sqlite.init();
            api.logger.info("memory-alpha: SQLite initialized", { path: config.sqlitePath });
        } catch (err: any) {
            api.logger.error("memory-alpha: SQLite initialization failed", {
                error: err.message,
            });
            throw new Error(
                `Failed to initialize SQLite at ${config.sqlitePath}: ${err.message}`
            );
        }

        // Ensure Qdrant collection exists (if vector search is configured)
        if (result.mode === "full" && config.qdrantUrl) {
            (async () => {
                try {
                    const { QdrantClient } = await import("./ingest/qdrant.js");
                    const qdrant = new QdrantClient(
                        config.qdrantUrl,
                        config.qdrantCollection ?? "memory_alpha"
                    );
                    await qdrant.ensureCollection(config.embedDimensions ?? 1024);
                    api.logger.info("memory-alpha: Qdrant collection ready", {
                        collection: config.qdrantCollection,
                    });
                } catch (err: any) {
                    api.logger.warn("memory-alpha: Qdrant collection setup failed (will retry on first use)", {
                        error: err.message,
                    });
                }
            })();
        }

        // Register components
        registerHooks(api, config, sqlite);
        registerMemoryTools(api, config, sqlite, result.mode);
        registerMemorySupplement(api, config, sqlite, "memory-alpha");

        api.logger.info("memory-alpha: registration complete", { mode: result.mode });
    },
});
