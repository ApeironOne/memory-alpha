export type ExtractedMemory = {
  text: string;
  memoryType?: "fact" | "preference" | "episode";
};

export function extractMemoriesFromText(text: string): ExtractedMemory[] {
  // Placeholder: naive extraction. Replace with LLM extraction later.
  if (!text || text.trim().length < 20) return [];
  return [{ text: text.trim().slice(0, 500), memoryType: "fact" }];
}
