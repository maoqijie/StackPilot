import { TrashMutationResponseSchema, TrashPayloadSchema } from "@stackpilot/contracts";
import type { FileTrashRepository } from "./fileTrashRepository.js";
import { missingRecord } from "../serviceError.js";

const RETENTION_DAYS = 7;

export class FileTrashService {
  constructor(private readonly repository: FileTrashRepository) {}
  list() { return TrashPayloadSchema.parse({ entries: this.repository.listActive(), recentlyRestored: this.repository.listRecentlyRestored(20), retentionDays: RETENTION_DAYS, collectedAt: new Date().toISOString() }); }
  restore(id: string, actor: string) {
    const entry = this.repository.restore(id, new Date().toISOString(), actor);
    if (!entry) throw missingRecord("回收站项目不存在");
    return TrashMutationResponseSchema.parse({ message: `${entry.name} 已恢复`, trash: this.list() });
  }
  purge(id: string) {
    const entry = this.repository.purge(id, new Date().toISOString());
    if (!entry) throw missingRecord("回收站项目不存在");
    return TrashMutationResponseSchema.parse({ message: `${entry.name} 已永久删除`, trash: this.list() });
  }
  purgeAll() {
    const count = this.repository.purgeAll(new Date().toISOString());
    return TrashMutationResponseSchema.parse({ message: `已永久删除回收站中的 ${count} 个项目`, trash: this.list() });
  }
}
