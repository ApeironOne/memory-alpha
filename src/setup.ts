#!/usr/bin/env node
import prompts from "prompts";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { homedir } from "os";
import { checkDocker, getDockerInstallInstructions, deployDockerStack } from "./setup-docker.js";

const CONFIG_DIR = resolve(homedir(), ".openclaw/plugins/memory-alpha");
const CONFIG_PATH = resolve(CONFIG_DIR, "config.json");

interface SetupConfig {
  sqlitePath: string;
  qdrantUrl?: string;
  qdrantCollection?: string;
  ollamaUrl?: string;
  embedModel?: string;
  embedDimensions?: number;
  sharedPool: boolean;
  autoCapture: boolean;
  autoRecall: boolean;
  recallLimit: number;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function expandTilde(p: string): string {
  if (p.startsWith("~/")) {
    return resolve(homedir(), p.slice(2));
  }
  return p;
}

function loadExisting(): Partial<SetupConfig> | null {
  try {
    if (existsSync(CONFIG_PATH)) {
      return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    }
  } catch {
    // ignore
  }
  return null;
}

async function main(): Promise<void> {
  const existing = loadExisting();
  const isUpdate = existing !== null;

  console.log("");
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║        Memory Alpha — Setup Wizard          ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log("");

  if (isUpdate) {
    console.log("  Existing config found. Current values shown as defaults.");
    console.log("");
  }

  // Handle Ctrl+C gracefully
  const onCancel = () => {
    console.log("\nSetup cancelled.");
    process.exit(0);
  };

  // --- SQLite path ---
  const { sqlitePath } = await prompts({
    type: "text",
    name: "sqlitePath",
    message: "SQLite database path",
    initial: existing?.sqlitePath ?? "~/.openclaw/memory/memory-alpha.db",
    validate: (v: string) => {
      if (!v.trim()) return "Path is required";
      return true;
    },
  }, { onCancel });

  // --- Vector search ---
  const { enableVector } = await prompts({
    type: "confirm",
    name: "enableVector",
    message: "Enable vector search? (requires Qdrant + Ollama)",
    initial: existing?.qdrantUrl ? true : false,
  }, { onCancel });

  let qdrantUrl: string | undefined;
  let qdrantCollection: string | undefined;
  let ollamaUrl: string | undefined;
  let embedModel: string | undefined;
  let embedDimensions: number | undefined;

  let vectorEnabled = enableVector;

  async function askRemoteUrls(): Promise<void> {
    const vectorAnswers = await prompts([
      {
        type: "text",
        name: "qdrantUrl",
        message: "Qdrant URL",
        initial: existing?.qdrantUrl ?? "http://192.168.0.126:6333",
        validate: (v: string) => {
          if (!v.trim()) return "Qdrant URL is required when vector search is enabled";
          if (!isValidHttpUrl(v)) return "Must be a valid http:// or https:// URL";
          return true;
        },
      },
      {
        type: "text",
        name: "qdrantCollection",
        message: "Qdrant collection name",
        initial: existing?.qdrantCollection ?? "memory_alpha",
      },
      {
        type: "text",
        name: "ollamaUrl",
        message: "Ollama URL",
        initial: existing?.ollamaUrl ?? "http://192.168.0.126:11434",
        validate: (v: string) => {
          if (!v.trim()) return "Ollama URL is required when vector search is enabled";
          if (!isValidHttpUrl(v)) return "Must be a valid http:// or https:// URL";
          return true;
        },
      },
      {
        type: "text",
        name: "embedModel",
        message: "Embedding model",
        initial: existing?.embedModel ?? "snowflake-arctic-embed2",
      },
      {
        type: "number",
        name: "embedDimensions",
        message: "Embedding dimensions",
        initial: existing?.embedDimensions ?? 1024,
        validate: (v: number) => {
          if (!v || v < 1) return "Must be a positive number";
          return true;
        },
      },
    ], { onCancel });

    qdrantUrl = vectorAnswers.qdrantUrl;
    qdrantCollection = vectorAnswers.qdrantCollection;
    ollamaUrl = vectorAnswers.ollamaUrl;
    embedModel = vectorAnswers.embedModel;
    embedDimensions = vectorAnswers.embedDimensions;
  }

  if (vectorEnabled) {
    let hasDocker = checkDocker();

    if (!hasDocker) {
      const installDocker = await prompts({
        type: "confirm",
        name: "value",
        message: "Docker is required for local vector search. Would you like to install Docker?",
        initial: false,
      }, { onCancel });

      if (installDocker.value) {
        console.log("\n" + getDockerInstallInstructions());
        await prompts({
          type: "confirm",
          name: "value",
          message: "Press enter when Docker is installed...",
          initial: true,
        }, { onCancel });

        // Re-check
        if (!checkDocker()) {
          const useRemote = await prompts({
            type: "confirm",
            name: "value",
            message: "Docker still not found. Do you have Qdrant + Ollama on a remote server?",
            initial: false,
          }, { onCancel });

          if (!useRemote.value) {
            console.log("Vector search disabled. Using SQLite-only mode.");
            vectorEnabled = false;
          } else {
            await askRemoteUrls();
          }
        } else {
          hasDocker = true;
        }
      } else {
        const useRemote = await prompts({
          type: "confirm",
          name: "value",
          message: "Do you have Qdrant + Ollama on a remote server?",
          initial: false,
        }, { onCancel });

        if (!useRemote.value) {
          console.log("Vector search disabled. Using SQLite-only mode.");
          vectorEnabled = false;
        } else {
          await askRemoteUrls();
        }
      }
    }

    if (hasDocker && vectorEnabled) {
      const deployLocal = await prompts({
        type: "confirm",
        name: "value",
        message: "Deploy Qdrant + Ollama locally with Docker?",
        initial: true,
      }, { onCancel });

      if (deployLocal.value) {
        const success = await deployDockerStack();
        if (success) {
          qdrantUrl = "http://localhost:6333";
          ollamaUrl = "http://localhost:11434";
          qdrantCollection = existing?.qdrantCollection ?? "memory_alpha";
          embedModel = existing?.embedModel ?? "snowflake-arctic-embed2";
          embedDimensions = existing?.embedDimensions ?? 1024;
          console.log("\n✓ Infrastructure deployed!");
        } else {
          console.log("Deployment failed. Please enter remote server URLs:");
          await askRemoteUrls();
        }
      } else {
        await askRemoteUrls();
      }
    }
  }

  // --- Behavior ---
  const behavior = await prompts([
    {
      type: "confirm",
      name: "sharedPool",
      message: "Multi-gateway shared pool mode?",
      initial: existing?.sharedPool ?? false,
    },
    {
      type: "confirm",
      name: "autoCapture",
      message: "Auto-capture memories from conversations?",
      initial: existing?.autoCapture ?? true,
    },
    {
      type: "confirm",
      name: "autoRecall",
      message: "Auto-inject memories into prompts?",
      initial: existing?.autoRecall ?? true,
    },
    {
      type: "number",
      name: "recallLimit",
      message: "How many memories to recall?",
      initial: existing?.recallLimit ?? 10,
      validate: (v: number) => {
        if (!v || v < 1) return "Must be at least 1";
        return true;
      },
    },
  ], { onCancel });

  // --- Build config ---
  const config: SetupConfig = {
    sqlitePath: expandTilde(sqlitePath),
    sharedPool: behavior.sharedPool,
    autoCapture: behavior.autoCapture,
    autoRecall: behavior.autoRecall,
    recallLimit: behavior.recallLimit,
  };

  if (vectorEnabled) {
    config.qdrantUrl = qdrantUrl;
    config.qdrantCollection = qdrantCollection;
    config.ollamaUrl = ollamaUrl;
    config.embedModel = embedModel;
    config.embedDimensions = embedDimensions;
  }

  // --- Save ---
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");

  // --- Summary ---
  const mode = config.qdrantUrl && config.ollamaUrl ? "full" : config.qdrantUrl ? "hybrid" : "sqlite-only";

  console.log("");
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║             Configuration Saved              ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log("");
  console.log(`  File:        ${CONFIG_PATH}`);
  console.log(`  Mode:        ${mode}`);
  console.log(`  SQLite:      ${config.sqlitePath}`);
  if (config.qdrantUrl) {
    console.log(`  Qdrant:      ${config.qdrantUrl} (${config.qdrantCollection})`);
  }
  if (config.ollamaUrl) {
    console.log(`  Ollama:      ${config.ollamaUrl} (${config.embedModel}, ${config.embedDimensions}d)`);
  }
  console.log(`  Shared pool: ${config.sharedPool ? "yes" : "no"}`);
  console.log(`  Auto-capture:${config.autoCapture ? " yes" : " no"}`);
  console.log(`  Auto-recall: ${config.autoRecall ? "yes" : "no"} (limit: ${config.recallLimit})`);
  console.log("");
  console.log("  Restart your OpenClaw gateway for changes to take effect.");
  console.log("");
}

main().catch((err) => {
  console.error("Setup failed:", err.message ?? err);
  process.exit(1);
});
