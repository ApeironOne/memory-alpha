export type QdrantPoint = {
    id: string;
    vector: number[];
    payload: Record<string, any>;
};

export class QdrantClient {
    private baseUrl: string;
    private collection: string;
    private collectionReady = false;

    constructor(baseUrl: string, collection: string) {
        this.baseUrl = baseUrl.replace(/\/+$/, ""); // trim trailing slash
        this.collection = collection;
    }

    async ensureCollection(dimensions = 384): Promise<void> {
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
            // Collection check failed — attempt to create
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
        await this.ensureCollection();

        const res = await fetch(
            `${this.baseUrl}/collections/${this.collection}/points?wait=true`,
            {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ points }),
            }
        );
        if (!res.ok) {
            const body = await res.text().catch(() => "unknown error");
            throw new Error(`Qdrant upsert failed: ${res.status} ${body}`);
        }
    }

    async search(queryVector: number[], limit = 10): Promise<any[]> {
        await this.ensureCollection();

        const res = await fetch(
            `${this.baseUrl}/collections/${this.collection}/points/search`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    vector: queryVector,
                    limit,
                    with_payload: true,
                    with_vector: false,
                }),
            }
        );
        if (!res.ok) {
            const body = await res.text().catch(() => "unknown error");
            throw new Error(`Qdrant search failed: ${res.status} ${body}`);
        }
        const data = await res.json();
        return data?.result ?? [];
    }

    async count(): Promise<number> {
        await this.ensureCollection();

        const res = await fetch(
            `${this.baseUrl}/collections/${this.collection}/points/count`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ exact: false }),
            }
        );
        if (!res.ok) return 0;
        const data = await res.json();
        return data?.result?.count ?? 0;
    }

    /**
     * Test connectivity without creating anything.
     */
    async ping(): Promise<boolean> {
        try {
            const res = await fetch(`${this.baseUrl}/healthz`, { signal: AbortSignal.timeout(3000) });
            return res.ok;
        } catch {
            return false;
        }
    }
}
