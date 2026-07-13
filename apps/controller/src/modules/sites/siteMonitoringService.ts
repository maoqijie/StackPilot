import { SiteRuntimePayloadSchema } from "@stackpilot/contracts";
import type { SiteRuntimePayload } from "@stackpilot/contracts";

type SiteCollector = { collectSites(): Promise<SiteRuntimePayload> };

export class SiteMonitoringService {
  private cached: { expiresAt: number; payload: SiteRuntimePayload } | null = null;
  private inFlight: Promise<SiteRuntimePayload> | null = null;

  constructor(private readonly collector: SiteCollector, private readonly cacheMs = 8_000) {}

  getSites() {
    if (this.cached && this.cached.expiresAt > Date.now()) return Promise.resolve(this.cached.payload);
    if (this.inFlight) return this.inFlight;
    const request = this.collector.collectSites().then((payload) => {
      const parsed = SiteRuntimePayloadSchema.parse(payload);
      this.cached = { expiresAt: Date.now() + this.cacheMs, payload: parsed };
      return parsed;
    }).finally(() => { if (this.inFlight === request) this.inFlight = null; });
    this.inFlight = request;
    return request;
  }
}
