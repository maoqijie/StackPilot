import { OverviewRisksPayloadSchema } from "@stackpilot/contracts";
import type { ExportRepository } from "../../repositories/exportRepository.js";
import type { OverviewAccess, OverviewService } from "../overview/overviewService.js";

export class RiskService {
  constructor(private readonly overview: OverviewService, private readonly exports: ExportRepository) {}
  async list(access?: OverviewAccess) { const payload = await this.overview.getOverview(access); return OverviewRisksPayloadSchema.parse({ risks: payload.risks, scannedAt: payload.collectedAt }); }
  async scan(access?: OverviewAccess) { const payload = await this.overview.getOverview(access, { bypassCache: true }); return OverviewRisksPayloadSchema.parse({ risks: payload.risks, scannedAt: payload.collectedAt }); }
  async export(access?: OverviewAccess) { const overview = await this.overview.getOverview(access, { bypassCache: true }); const payload = OverviewRisksPayloadSchema.parse({ risks: overview.risks, scannedAt: overview.collectedAt }); return this.exports.writeJson("overview-risks", { exportedAt: new Date().toISOString(), ...payload }); }
}
