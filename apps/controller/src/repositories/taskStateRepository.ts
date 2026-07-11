import type { OverviewTaskRecord } from "@stackpilot/contracts";

export interface TaskStateRepository {
  get(id: string): Partial<OverviewTaskRecord> | undefined;
  set(id: string, patch: Partial<OverviewTaskRecord>): void;
  clear(): void;
}

export class MemoryTaskStateRepository implements TaskStateRepository {
  private readonly state = new Map<string, Partial<OverviewTaskRecord>>();
  get(id: string) { return this.state.get(id); }
  set(id: string, patch: Partial<OverviewTaskRecord>) { this.state.set(id, patch); }
  clear() { this.state.clear(); }
}
