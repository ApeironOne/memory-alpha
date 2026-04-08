export type QdrantPoint = {
  id: string;
  vector: number[];
  payload: Record<string, any>;
};

export class QdrantClient {
  private collectionReady = false;

  constructor(private baseUrl: string, private collection: string) {}

  /**
   * Ensure the Qdrant collection exists, creating it if necessary.
   * Uses 1024 dimensions for snowflake-arctic-embed2.
   */
  async ensureCollection(dimensions = 1024): Promise<void> {
    if (this.collectionReady) return;

    try {
      const res = await fetch(
        `${this.baseUrl}/collections/${this.collection}`,
        { method: "GET" }
      );
      if (res.ok) {
        this.collectionReady = true;
        return;
      }
    } catch {
      // Collection check failed — attempt to create it below
    }

    const res = await fetch(
      `${this.baseUrl}/collections/${this.collection}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vectors: { size: dimensions, distance: "Cosine" },
        }),
      }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "unknown error");
      throw new Error(
        `Failed to create Qdrant collection "${this.collection}": ${res.status} ${body}`
      );
    }
    this.collectionReady = true;
  }

  async upsert(points: QdrantPoint[]): Promise<void> {
    const res = await fetch(`${this.baseUrl}/collections/${this.collection}/points?wait=true`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ points })
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "unknown error");
      throw new Error(`Qdrant upsert failed: ${res.status} ${body}`);
    }
  }

  async search(queryVector: number[], limit = 10): Promise<any[]> {
    const res = await fetch(`${this.baseUrl}/collections/${this.collection}/points/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vector: queryVector, limit, with_payload: true })
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "unknown error");
      throw new Error(`Qdrant search failed: ${res.status} ${body}`);
    }
    const data = await res.json();
    return data?.result ?? [];
  }
}
