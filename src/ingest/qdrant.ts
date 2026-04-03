export type QdrantPoint = {
  id: string;
  vector: number[];
  payload: Record<string, any>;
};

export class QdrantClient {
  constructor(private baseUrl: string, private collection: string) {}

  async upsert(points: QdrantPoint[]): Promise<void> {
    await fetch(`${this.baseUrl}/collections/${this.collection}/points?wait=true`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ points })
    });
  }

  async search(queryVector: number[], limit = 10): Promise<any[]> {
    const res = await fetch(`${this.baseUrl}/collections/${this.collection}/points/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vector: queryVector, limit, with_payload: true })
    });
    const data = await res.json();
    return data?.result ?? [];
  }
}
