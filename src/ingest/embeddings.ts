export async function embedText(text: string, dims = 1024, ollamaUrl = "http://127.0.0.1:11434", model = "snowflake-arctic-embed2"): Promise<number[]> {
  const res = await fetch(`${ollamaUrl}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, input: text })
  });
  const data = await res.json();
  const vec = data?.embeddings?.[0] ?? [];
  if (vec.length === 0) return new Array(dims).fill(0);
  return vec;
}
