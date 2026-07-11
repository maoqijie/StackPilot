import { OverviewRisksPayloadSchema } from "@stackpilot/contracts";
import type { ExportRepository } from "../../repositories/exportRepository.js";
import type { OverviewService } from "../overview/overviewService.js";

export class RiskService {
  constructor(private readonly overview: OverviewService, private readonly exports: ExportRepository) {}
  async list() { const payload = await this.overview.getOverview(); return OverviewRisksPayloadSchema.parse({ risks: payload.risks, scannedAt: payload.lastRefresh }); }
  async scan() { return this.list(); }
  async export() { const payload = await this.list(); return this.exports.writeJson("overview-risks", { exportedAt: new Date().toISOString(), ...payload }); }
}
