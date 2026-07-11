import { OverviewTasksPayloadSchema } from "@stackpilot/contracts";
import type { ExportRepository } from "../../repositories/exportRepository.js";
import type { TaskStateRepository } from "../../repositories/taskStateRepository.js";
import { missingRecord } from "../serviceError.js";
import type { OverviewService } from "../overview/overviewService.js";

export class TaskService {
  constructor(private readonly overview: OverviewService, private readonly state: TaskStateRepository, private readonly exports: ExportRepository) {}
  async list() { const payload = await this.overview.getOverview(); return OverviewTasksPayloadSchema.parse({ tasks: payload.tasks, page: payload.taskPage }); }
  async refresh() { this.state.clear(); return this.list(); }
  async run(id: string) {
    const payload = await this.list();
    const task = payload.tasks.find((item) => item.id === id);
    if (!task) throw missingRecord("任务不存在");
    const patch = { queuedAt: new Date().toLocaleString("zh-CN", { hour12: false }), logs: [...task.logs, "已重新检查"].slice(-8) };
    this.state.set(id, patch);
    const refreshed = await this.list();
    return { task: refreshed.tasks.find((item) => item.id === id) ?? task, ...refreshed };
  }
  async export() { const payload = await this.list(); return this.exports.writeJson("overview-tasks", { exportedAt: new Date().toISOString(), ...payload }); }
}
