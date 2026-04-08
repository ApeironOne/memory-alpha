import { execSync } from "child_process";
import { platform } from "os";

export function checkDocker(): boolean {
  try {
    execSync("docker --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function getDockerInstallInstructions(): string {
  const os = platform();
  if (os === "darwin") {
    return "Install Docker Desktop: https://www.docker.com/products/docker-desktop";
  } else if (os === "linux") {
    return "Run: curl -fsSL https://get.docker.com | sh";
  } else if (os === "win32") {
    return "Install Docker Desktop: https://www.docker.com/products/docker-desktop";
  }
  return "Install Docker from https://www.docker.com/";
}

export async function deployDockerStack(): Promise<boolean> {
  try {
    console.log("Starting Qdrant + Ollama services...");
    execSync("docker compose up -d", { stdio: "inherit" });
    
    console.log("Waiting for services to be healthy...");
    await sleep(5000);
    
    console.log("Pulling embedding model...");
    execSync("docker exec memory-alpha-ollama ollama pull snowflake-arctic-embed2", { stdio: "inherit" });
    
    return true;
  } catch (err: any) {
    console.error("Docker deployment failed:", err.message);
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
