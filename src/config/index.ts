import { z } from "zod";

export const ConfigSchema = z.object({
  qdrantUrl: z.string().default("http://127.0.0.1:6333"),
  qdrantCollection: z.string().default("memory_alpha"),
  sqlitePath: z.string().default("~/.openclaw/memory/memory-alpha.db"),
  sharedPool: z.boolean().default(true),
  autoCapture: z.boolean().default(true),
  autoRecall: z.boolean().default(true),
  recallLimit: z.number().default(10),
  embedDimensions: z.number().default(1024),
  embedModel: z.string().default("snowflake-arctic-embed2"),
  ollamaUrl: z.string().default("http://127.0.0.1:11434")
});

export type MemoryAlphaConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(raw: any): MemoryAlphaConfig {
  return ConfigSchema.parse(raw ?? {});
}
