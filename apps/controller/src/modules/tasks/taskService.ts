import { OverviewTasksPayloadSchema } from "@stackpilot/contracts";
import type { ExportRepository } from "../../repositories/exportRepository.js";
import type { TaskStateRepository } from "../../repositories/taskStateRepository.js";
import type { OverviewAccess, OverviewService } from "../overview/overviewService.js";

export class TaskService {
  constructor(private readonly overview: OverviewService, private readonly state: TaskStateRepository, private readonly exports: ExportRepository) {}
  async list(access?: OverviewAccess) { const payload = await this.overview.getOverview(access); return OverviewTasksPayloadSchema.parse({ tasks: payload.tasks, page: payload.taskPage }); }
  async refresh(access?: OverviewAccess) { this.state.clear(); const payload = await this.overview.getOverview(access, { bypassCache: true }); return OverviewTasksPayloadSchema.parse({ tasks: payload.tasks, page: payload.taskPage }); }
  async export(access?: OverviewAccess) { const overview = await this.overview.getOverview(access, { bypassCache: true }); const payload = OverviewTasksPayloadSchema.parse({ tasks: overview.tasks, page: overview.taskPage }); return this.exports.writeJson("overview-tasks", { exportedAt: new Date().toISOString(), ...payload }); }
}
