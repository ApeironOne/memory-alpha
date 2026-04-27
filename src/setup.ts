#!/usr/bin/env node
/**
 * Interactive setup wizard — creates plugin config at
 * ~/.openclaw/plugins/memory-alpha/config.json
 */
import prompts from "prompts";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { homedir } from "os";
import { checkDocker, deployDockerStack } from "./setup-docker.js";

const CONFIG_DIR = resolve(homedir(), ".openclaw/plugins/memory-alpha");
const CONFIG_PATH = resolve(CONFIG_DIR, "config.json");

function isValidHttpUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch {
        return false;
    }
}

function expandTilde(p: string): string {
    return p.startsWith("~/") ? resolve(homedir(), p.slice(2)) : p;
}

function loadExisting(): Record<string, any> | null {
    try {
        if (existsSync(CONFIG_PATH)) {
            return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
        }
    } catch {}
    return null;
}

async function main() {
    const existing = loadExisting();

    console.log("\n╔═══════════════════════════════════════════╗");
    console.log("║        Memory Alpha — Setup Wizard v0.4   ║");
    console.log("╚═══════════════════════════════════════════╝\n");

    if (existing) {
        console.log("  Existing config found. Current values shown as defaults.\n");
    }

    const onCancel = () => { console.log("\nSetup cancelled."); process.exit(0); };

    // SQLite path
    const { sqlitePath } = await prompts({
        type: "text", name: "sqlitePath",
        message: "SQLite database path",
        initial: existing?.sqlitePath ?? "~/.openclaw/memory/memory-alpha.db",
    }, { onCancel });

    // Vector search?
    const { enableVector } = await prompts({
        type: "confirm", name: "enableVector",
        message: "Enable vector search? (requires Qdrant + Ollama)",
        initial: !!existing?.qdrantUrl,
    }, { onCancel });

    let qdrantUrl: string | undefined;
    let qdrantCollection: string | undefined;
    let ollamaUrl: string | undefined;
    let embedModel = "snowflake-arctic-embed2";
    let embedDimensions = 1024;

    async function askRemoteUrls() {
        const ans = await prompts([
            { type: "text", name: "qdrantUrl", message: "Qdrant URL", initial: existing?.qdrantUrl ?? "http://192.168.0.126:6333" },
            { type: "text", name: "qdrantCollection", message: "Qdrant collection", initial: existing?.qdrantCollection ?? "memory_alpha" },
            { type: "text", name: "ollamaUrl", message: "Ollama URL", initial: existing?.ollamaUrl ?? "http://192.168.0.126:11434" },
            { type: "text", name: "embedModel", message: "Embedding model", initial: existing?.embedModel ?? embedModel },
            { type: "text", name: "embedDimensions", message: "Embedding dimensions", initial: String(existing?.embedDimensions ?? embedDimensions) },
        ], { onCancel });
        qdrantUrl = ans.qdrantUrl;
        qdrantCollection = ans.qdrantCollection;
        ollamaUrl = ans.ollamaUrl;
        embedModel = ans.embedModel ?? embedModel;
        embedDimensions = parseInt(ans.embedDimensions ?? String(embedDimensions), 10);
    }

    if (enableVector) {
        if (checkDocker()) {
            const deploy = await prompts({ type: "confirm", name: "value", message: "Deploy Qdrant + Ollama locally via Docker?", initial: true }, { onCancel });
            if (deploy.value && await deployDockerStack()) {
                qdrantUrl = "http://localhost:6333";
                ollamaUrl = "http://localhost:11434";
                console.log("\n✓ Infrastructure deployed!");
            } else {
                console.log("Please enter remote URLs:");
                await askRemoteUrls();
            }
        } else {
            const remote = await prompts({ type: "confirm", name: "value", message: "Qdrant + Ollama on remote server?", initial: false }, { onCancel });
            if (remote.value) await askRemoteUrls();
            else {
                console.log("Vector search disabled. Using SQLite-only mode.");
                enableVector = false;
            }
        }
    }

    // Behavior
    const behavior = await prompts([
        { type: "confirm", name: "sharedPool", message: "Multi-gateway shared pool mode?", initial: existing?.sharedPool ?? false },
        { type: "confirm", name: "autoCapture", message: "Auto-capture memories from conversations?", initial: existing?.autoCapture ?? true },
        { type: "confirm", name: "autoRecall", message: "Auto-inject memories into prompts?", initial: existing?.autoRecall ?? true },
        { type: "number", name: "recallLimit", message: "How many memories to recall?", initial: existing?.recallLimit ?? 10 },
        { type: "select", name: "captureMode", message: "Capture mode", initial: 2,
            choices: [
                { title: "filtered — key moments only", value: "filtered" },
                { title: "full — complete transcripts", value: "full" },
                { title: "hybrid — both", value: "hybrid" },
            ]},
    ], { onCancel });

    // Save
    mkdirSync(CONFIG_DIR, { recursive: true });
    const config: any = {
        sqlitePath: expandTilde(sqlitePath),
        sharedPool: behavior.sharedPool,
        autoCapture: behavior.autoCapture,
        autoRecall: behavior.autoRecall,
        recallLimit: behavior.recallLimit,
        captureMode: behavior.captureMode ?? "hybrid",
    };
    if (enableVector && qdrantUrl) {
        config.qdrantUrl = qdrantUrl;
        config.qdrantCollection = qdrantCollection;
    }
    if (enableVector && ollamaUrl) {
        config.ollamaUrl = ollamaUrl;
        config.embedModel = embedModel;
        config.embedDimensions = embedDimensions;
    }

    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");

    const mode = config.qdrantUrl && config.ollamaUrl ? "full" : config.qdrantUrl ? "hybrid" : "sqlite-only";
    console.log(`\n✓ Saved → ${CONFIG_PATH}\n  Mode: ${mode}\n  SQLite: ${config.sqlitePath}`);
    console.log("  Restart your gateway to apply.\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
