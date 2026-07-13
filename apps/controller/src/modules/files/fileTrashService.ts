import { TrashMutationResponseSchema, TrashPayloadSchema } from "@stackpilot/contracts";
import type { FileTrashRepository } from "./fileTrashRepository.js";
import { missingRecord } from "../serviceError.js";
import type { FileService, TrashPurgeStage } from "./fileService.js";

const RETENTION_DAYS = 7;

export class FileTrashService {
  private mutation = Promise.resolve();
  constructor(private readonly repository: FileTrashRepository, private readonly files?: FileService) {}
  private async mutate<T>(operation: () => Promise<T>): Promise<T> { const previous=this.mutation;let release!:()=>void;this.mutation=new Promise<void>((resolve)=>{release=resolve;});await previous;try{return await operation();}finally{release();} }
  list() { return TrashPayloadSchema.parse({ entries: this.repository.listActive(), recentlyRestored: this.repository.listRecentlyRestored(20), retentionDays: RETENTION_DAYS, collectedAt: new Date().toISOString() }); }
  async restore(id: string, actor: string) { return this.mutate(async () => {
    const entry = this.repository.listActive().find((item) => item.id === id);
    if (!entry) throw missingRecord("回收站项目不存在");
    const trashPath = this.repository.storagePath(id);
    if (trashPath && this.files) await this.files.restoreFromTrash(entry.originalPath, trashPath);
    let restored;
    try {
      restored = this.repository.restore(id, new Date().toISOString(), actor);
    } catch (error) {
      if (trashPath && this.files) await this.files.rollbackTrashRestore(entry.originalPath, trashPath);
      throw error;
    }
    if (!restored) {
      if (trashPath && this.files) await this.files.rollbackTrashRestore(entry.originalPath, trashPath);
      throw missingRecord("回收站项目不存在");
    }
    if (trashPath && this.files) await this.files.completeTrashRestore(trashPath);
    return TrashMutationResponseSchema.parse({ message: `${restored.name} 已恢复`, trash: this.list() });
  }); }
  async purge(id: string) { return this.mutate(async () => {
    const entry = this.repository.listActive().find((item) => item.id === id);
    if (!entry) throw missingRecord("回收站项目不存在");
    const trashPath = this.repository.storagePath(id);
    const stage = trashPath && this.files ? await this.files.stageTrashPurge(trashPath) : null;
    let purged;
    try { purged = this.repository.purge(id, new Date().toISOString()); }
    catch (error) { if (stage && this.files) await this.files.rollbackTrashPurge(stage); throw error; }
    if (!purged) { if (stage && this.files) await this.files.rollbackTrashPurge(stage); throw missingRecord("回收站项目不存在"); }
    if (stage && this.files) await this.files.completeTrashPurge(stage);
    return TrashMutationResponseSchema.parse({ message: `${purged.name} 已永久删除`, trash: this.list() });
  }); }
  async purgeAll() { return this.mutate(async () => {
    const entries = this.repository.listActive();
    const stages: TrashPurgeStage[] = [];
    try {
      for (const entry of entries) { const trashPath=this.repository.storagePath(entry.id),stage=trashPath&&this.files?await this.files.stageTrashPurge(trashPath):null;if(stage)stages.push(stage); }
      const purged=this.repository.purgeAll(new Date().toISOString());
      if(purged!==entries.length)throw new Error("回收站状态已并发变更");
    } catch (error) {
      if(this.files)for(const stage of stages.reverse())await this.files.rollbackTrashPurge(stage);
      throw error;
    }
    if(this.files)for(const stage of stages)await this.files.completeTrashPurge(stage);
    return TrashMutationResponseSchema.parse({ message: `已永久删除回收站中的 ${entries.length} 个项目`, trash: this.list() });
  }); }
}
