#!/usr/bin/env node
import prompts from "prompts";
import { existsSync, readFileSync, unlinkSync, rmdirSync } from "fs";
import { execSync } from "child_process";
import { homedir } from "os";
import { join } from "path";

console.log("\n🧹 Memory Alpha Cleanup\n");

const configPath = join(homedir(), ".openclaw/plugins/memory-alpha/config.json");
let sqlitePath = "";
let qdrantUrl = "";
let ollamaUrl = "";

// Try to load config to find what's installed
if (existsSync(configPath)) {
  try {
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    sqlitePath = config.sqlitePath || "";
    qdrantUrl = config.qdrantUrl || "";
    ollamaUrl = config.ollamaUrl || "";
  } catch {}
}

// Detect what exists
const hasPlugin = execSync("openclaw plugins list 2>/dev/null || true", { encoding: "utf8" }).includes("memory-alpha");
const hasDocker = existsSync("docker-compose.yml");
const hasSqlite = sqlitePath && existsSync(sqlitePath);
const hasConfig = existsSync(configPath);
const hasData = existsSync("data/");

const choices = [];

if (hasPlugin) {
  choices.push({
    title: "Uninstall plugin from OpenClaw",
    value: "plugin",
    description: "Remove memory-alpha from OpenClaw (requires gateway restart)",
    selected: false
  });
}

if (hasDocker) {
  choices.push({
    title: "Stop & remove Docker stack",
    value: "docker",
    description: "docker compose down (stops Qdrant + Ollama containers)",
    selected: false
  });
}

if (hasData) {
  choices.push({
    title: "Delete Docker data volumes",
    value: "volumes",
    description: "Remove ./data/ folder (Qdrant + Ollama persistent data)",
    selected: false
  });
}

if (hasSqlite) {
  choices.push({
    title: `Delete SQLite database`,
    value: "sqlite",
    description: sqlitePath,
    selected: false
  });
}

if (hasConfig) {
  choices.push({
    title: "Delete plugin config",
    value: "config",
    description: configPath,
    selected: false
  });
}

if (choices.length === 0) {
  console.log("✓ Nothing to clean up - memory-alpha is not installed\n");
  process.exit(0);
}

const response = await prompts({
  type: "multiselect",
  name: "selected",
  message: "Select items to remove (space to toggle, enter to confirm):",
  choices,
  hint: "- Space to select. Return to submit"
});

if (!response.selected || response.selected.length === 0) {
  console.log("\n❌ Cancelled\n");
  process.exit(0);
}

console.log("");

// Execute selected cleanups
const selected = new Set(response.selected);

if (selected.has("plugin") && hasPlugin) {
  console.log("→ Uninstalling plugin from OpenClaw...");
  try {
    execSync("openclaw plugins uninstall memory-alpha --force", { stdio: "inherit" });
    console.log("  ✓ Plugin uninstalled");
  } catch (err) {
    console.error("  ✗ Failed to uninstall plugin:", (err as Error).message);
  }
}

if (selected.has("docker") && hasDocker) {
  console.log("→ Stopping Docker stack...");
  try {
    execSync("docker compose down -v", { stdio: "inherit" });
    console.log("  ✓ Docker stack stopped");
  } catch (err) {
    console.error("  ✗ Failed to stop Docker:", (err as Error).message);
  }
}

if (selected.has("volumes") && hasData) {
  console.log("→ Deleting Docker volumes...");
  try {
    execSync("rm -rf data/", { stdio: "inherit" });
    console.log("  ✓ Volumes deleted");
  } catch (err) {
    console.error("  ✗ Failed to delete volumes:", (err as Error).message);
  }
}

if (selected.has("sqlite") && hasSqlite) {
  console.log(`→ Deleting SQLite database...`);
  try {
    unlinkSync(sqlitePath);
    console.log(`  ✓ Deleted: ${sqlitePath}`);
  } catch (err) {
    console.error("  ✗ Failed to delete SQLite:", (err as Error).message);
  }
}

if (selected.has("config") && hasConfig) {
  console.log("→ Deleting plugin config...");
  try {
    unlinkSync(configPath);
    try {
      rmdirSync(join(homedir(), ".openclaw/plugins/memory-alpha"));
    } catch {}
    console.log("  ✓ Config deleted");
  } catch (err) {
    console.error("  ✗ Failed to delete config:", (err as Error).message);
  }
}

console.log("\n✓ Cleanup complete!\n");

if (selected.has("plugin")) {
  console.log("⚠️  Restart your gateway: openclaw gateway restart\n");
}
