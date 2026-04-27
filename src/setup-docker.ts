import { execSync } from "child_process";

export function checkDocker(): boolean {
    try {
        execSync("docker --version", { stdio: "ignore" });
        return true;
    } catch {
        return false;
    }
}

export async function deployDockerStack(): Promise<boolean> {
    try {
        console.log("Starting Qdrant + Ollama services...");
        execSync("docker compose up -d", { stdio: "inherit" });

        console.log("Waiting for services to be healthy...");
        await new Promise((r) => setTimeout(r, 5000));

        console.log("Pulling embedding model...");
        execSync("docker exec memory-alpha-ollama ollama pull snowflake-arctic-embed2", {
            stdio: "inherit",
        });

        return true;
    } catch (err: any) {
        console.error("Docker deployment failed:", err.message);
        return false;
    }
}
