export type MemoryType = "fact" | "preference" | "episode" | "decision";

export type ExtractedMemory = {
  text: string;
  memoryType: MemoryType;
};

// Patterns that indicate noise / non-memorable content
const GREETING_RE = /^(hi|hello|hey|thanks|thank you|ok|okay|sure|yes|no|bye|goodbye|cheers|np|ty|thx)\b/i;
const COMMAND_RE = /^\//;  // slash commands
const QUESTION_ONLY_RE = /^(what|how|why|where|when|who|can you|could you|would you|will you|do you)\b.*\?$/i;

// Classification patterns
const PREFERENCE_RE = /\b(prefer|like|want|don't like|dislike|hate|love|always use|never use|favorite|rather|instead of)\b/i;
const DECISION_RE = /\b(decided|decision|going with|chose|choosing|let's go with|we('ll| will) use|switching to|moving to|approved)\b/i;
const EPISODE_RE = /\b(yesterday|last week|last month|earlier|previously|remember when|that time|incident|outage|broke|crashed|deployed|shipped|released|migrated)\b/i;

function splitSentences(text: string): string[] {
  // Split on sentence-ending punctuation, keeping the delimiter
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function isNoise(sentence: string): boolean {
  if (sentence.length < 20) return true;
  if (GREETING_RE.test(sentence)) return true;
  if (COMMAND_RE.test(sentence)) return true;
  // Pure questions with no assertion are low-value for memory
  if (QUESTION_ONLY_RE.test(sentence) && sentence.length < 80) return true;
  return false;
}

function classify(sentence: string): MemoryType {
  if (PREFERENCE_RE.test(sentence)) return "preference";
  if (DECISION_RE.test(sentence)) return "decision";
  if (EPISODE_RE.test(sentence)) return "episode";
  return "fact";
}

export function extractMemoriesFromText(text: string): ExtractedMemory[] {
  if (!text || text.trim().length < 20) return [];

  const sentences = splitSentences(text.trim());
  const results: ExtractedMemory[] = [];

  for (const sentence of sentences) {
    if (isNoise(sentence)) continue;
    results.push({
      text: sentence.slice(0, 500),
      memoryType: classify(sentence),
    });
  }

  return results;
}
