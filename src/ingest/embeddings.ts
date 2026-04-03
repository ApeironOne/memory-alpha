export async function embedText(_text: string, dims = 1024): Promise<number[]> {
  // TODO: replace with Ollama embedding call
  return new Array(dims).fill(0);
}
