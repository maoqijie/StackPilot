import type { DatabaseSlowQueriesPayload } from "@stackpilot/contracts";
type SlowQueryCollector = { collect(): Promise<DatabaseSlowQueriesPayload> };

export class DatabaseSlowQueryService {
  private cached: { expiresAt: number; payload: DatabaseSlowQueriesPayload } | null = null;
  private inFlight: Promise<DatabaseSlowQueriesPayload> | null = null;
  constructor(private readonly collector: SlowQueryCollector, private readonly cacheMs = 8_000) {}
  getSlowQueries() {
    if (this.cached && this.cached.expiresAt > Date.now()) return Promise.resolve(this.cached.payload);
    if (this.inFlight) return this.inFlight;
    const request = this.collector.collect().then((payload) => { this.cached = { expiresAt: Date.now() + this.cacheMs, payload }; return payload; }).finally(() => { if (this.inFlight === request) this.inFlight = null; });
    this.inFlight = request; return request;
  }
}
