import { createHash, randomUUID } from "node:crypto";
import { constants, existsSync } from "node:fs";
import { link, lstat, mkdir, open, realpath, rm } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { CreateFileUploadRequest, FileUploadListResponse, ResumableFileUploadRecord } from "@stackpilot/contracts";
import type { Principal } from "../../identity/types.js";
import { ServiceError } from "../serviceError.js";
import { FileUploadRepository, type StoredFileUpload } from "../../repositories/fileUploadRepository.js";

function publicRecord(upload: StoredFileUpload): ResumableFileUploadRecord {
  return {
    id: upload.id, fileName: upload.fileName, targetDirectory: upload.targetDirectory, targetPath: upload.targetPath,
    sizeBytes: upload.sizeBytes, receivedBytes: upload.receivedBytes, status: upload.status, owner: upload.owner,
    contentType: upload.contentType, sha256: upload.sha256, errorMessage: upload.errorMessage,
    createdAt: upload.createdAt, updatedAt: upload.updatedAt, completedAt: upload.completedAt,
  };
}

export class FileUploadService {
  private readonly active = new Set<string>();
  constructor(private readonly repository: FileUploadRepository, private readonly root: string, private readonly maxFileBytes: number, private readonly chunkBytes: number) { repository.pauseInterrupted(); }

  async initialize(): Promise<void> {
    try { await mkdir(this.root, { recursive: true, mode: 0o700 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    const info = await lstat(this.root);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new ServiceError(400, "BAD_REQUEST", "上传根目录必须是真实目录");
  }
  async list(): Promise<FileUploadListResponse> { const base = await this.rootPath(); this.assertStoredPaths(base); return { uploads: this.repository.list().map(publicRecord), collectedAt: new Date().toISOString(), maxFileBytes: this.maxFileBytes, chunkBytes: this.chunkBytes }; }

  async create(principal: Principal, input: CreateFileUploadRequest): Promise<ResumableFileUploadRecord> {
    if (input.sizeBytes > this.maxFileBytes) throw new ServiceError(413, "PAYLOAD_TOO_LARGE", `单个文件不能超过 ${this.maxFileBytes} 字节`);
    const base = await this.rootPath();
    const previous = this.repository.findIdempotent(principal.userId, input.idempotencyKey);
    if (previous) {
      this.assertStoredUpload(base, previous);
      if (previous.fileName !== input.fileName || previous.targetDirectory !== input.targetDirectory || previous.sizeBytes !== input.sizeBytes || previous.contentType !== input.contentType) throw new ServiceError(409, "BAD_REQUEST", "幂等键已用于不同的上传请求");
      if ((previous.status === "cancelled" || previous.status === "failed") && !existsSync(previous.temporaryPath)) throw new ServiceError(409, "BAD_REQUEST", "幂等上传任务已经结束，请使用新的幂等键");
      if (previous.status !== "completed" && existsSync(resolve(base, previous.targetPath))) throw new ServiceError(409, "BAD_REQUEST", "目标文件已存在，未执行覆盖");
      return publicRecord(previous);
    }
    const canonicalDirectory = await this.ensureDirectory(base, input.targetDirectory);
    const targetPath = resolve(canonicalDirectory, input.fileName);
    this.assertContained(base, targetPath);
    if (existsSync(targetPath)) throw new ServiceError(409, "BAD_REQUEST", "目标文件已存在，未执行覆盖");
    const id = randomUUID();
    const temporaryPath = resolve(canonicalDirectory, `.${input.fileName}.${id}.upload`);
    const handle = await open(temporaryPath, "wx", 0o600);
    await handle.close();
    const now = new Date().toISOString();
    const upload: StoredFileUpload = {
      id, ownerUserId: principal.userId, owner: principal.user.displayName, fileName: input.fileName,
      targetDirectory: input.targetDirectory, targetPath: relative(base, targetPath) || input.fileName, temporaryPath,
      contentType: input.contentType, sizeBytes: input.sizeBytes, receivedBytes: 0, status: "waiting", sha256: null,
      errorMessage: null, idempotencyKey: input.idempotencyKey, createdAt: now, updatedAt: now, completedAt: null,
    };
    try { this.repository.create(upload); }
    catch (error) {
      await rm(temporaryPath, { force: true });
      const concurrent = this.repository.findIdempotent(principal.userId, input.idempotencyKey);
      if (concurrent && concurrent.fileName === input.fileName && concurrent.targetDirectory === input.targetDirectory && concurrent.sizeBytes === input.sizeBytes && concurrent.contentType === input.contentType) return publicRecord(concurrent);
      throw error;
    }
    return publicRecord(upload);
  }

  async append(id: string, offset: number, contentLength: number, body: AsyncIterable<Buffer | Uint8Array>): Promise<ResumableFileUploadRecord> {
    const base = await this.rootPath();
    const upload = this.required(id);
    this.assertStoredUpload(base, upload);
    if (["completed", "cancelled"].includes(upload.status)) throw new ServiceError(409, "BAD_REQUEST", "上传任务已经结束");
    if (offset !== upload.receivedBytes) throw new ServiceError(409, "BAD_REQUEST", `上传偏移冲突，服务端偏移为 ${upload.receivedBytes}`);
    if (!Number.isSafeInteger(contentLength) || contentLength <= 0 || contentLength > this.chunkBytes || offset + contentLength > upload.sizeBytes) throw new ServiceError(413, "PAYLOAD_TOO_LARGE", "上传分片大小无效");
    if (this.active.has(id)) throw new ServiceError(409, "BAD_REQUEST", "该上传任务正在接收分片");
    this.active.add(id);
    let written = 0;
    let handle: Awaited<ReturnType<typeof open>> | null = null;
    try {
      handle = await open(upload.temporaryPath, constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0));
      const current = await handle.stat();
      if (!current.isFile() || current.size !== offset) throw new ServiceError(409, "BAD_REQUEST", "临时文件状态与上传偏移不一致");
      for await (const raw of body) {
        const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
        if (written + chunk.length > contentLength || offset + written + chunk.length > upload.sizeBytes) throw new ServiceError(413, "PAYLOAD_TOO_LARGE", "上传分片超过声明大小");
        let chunkOffset = 0;
        while (chunkOffset < chunk.length) {
          const result = await handle.write(chunk, chunkOffset, chunk.length - chunkOffset, offset + written + chunkOffset);
          if (!result.bytesWritten) throw new Error("上传分片写入中断");
          chunkOffset += result.bytesWritten;
        }
        written += chunk.length;
      }
      await handle.sync();
      if (written !== contentLength) throw new ServiceError(400, "BAD_REQUEST", "上传分片长度与声明不一致");
      const nextOffset = offset + written;
      if (!this.repository.updateProgress(id, offset, nextOffset, nextOffset === upload.sizeBytes ? "waiting" : "uploading")) throw new ServiceError(409, "BAD_REQUEST", "上传状态已变化，请重新读取任务");
      return publicRecord(this.required(id));
    } catch (error) {
      await handle?.truncate(offset).catch(() => undefined);
      this.repository.updateState(id, "failed", { errorMessage: error instanceof ServiceError ? error.message : "写入上传分片失败" });
      throw error;
    } finally { await handle?.close().catch(() => undefined); this.active.delete(id); }
  }

  async complete(id: string): Promise<ResumableFileUploadRecord> {
    const base = await this.rootPath();
    const upload = this.required(id);
    this.assertStoredUpload(base, upload);
    if (upload.status === "completed") return publicRecord(upload);
    if (upload.status === "cancelled") throw new ServiceError(409, "BAD_REQUEST", "已取消任务不能完成");
    if (this.active.has(id)) throw new ServiceError(409, "BAD_REQUEST", "该上传任务正在接收分片");
    this.active.add(id);
    try {
      if (upload.receivedBytes !== upload.sizeBytes) throw new ServiceError(409, "BAD_REQUEST", "文件尚未完整上传");
      const inspected = await this.inspectTemporary(upload.temporaryPath);
      if (inspected.size !== upload.sizeBytes) throw new ServiceError(409, "BAD_REQUEST", "临时文件大小校验失败");
      const target = resolve(base, upload.targetPath);
      if (existsSync(target)) throw new ServiceError(409, "BAD_REQUEST", "目标文件已存在，未执行覆盖");
      try { await link(upload.temporaryPath, target); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new ServiceError(409, "BAD_REQUEST", "目标文件已存在，未执行覆盖"); throw error; }
      const published = await lstat(target);
      if (!published.isFile() || published.isSymbolicLink() || published.dev !== inspected.dev || published.ino !== inspected.ino) { await rm(target, { force: true }); throw new ServiceError(409, "BAD_REQUEST", "临时文件在发布时发生变化"); }
      const completedAt = new Date().toISOString();
      try { this.repository.updateState(id, "completed", { sha256: inspected.digest, completedAt }); }
      catch (error) { await rm(target, { force: true }); throw error; }
      await rm(upload.temporaryPath, { force: true });
      return publicRecord(this.required(id));
    } finally { this.active.delete(id); }
  }

  async cancel(id: string): Promise<ResumableFileUploadRecord> {
    const base = await this.rootPath();
    const upload = this.required(id);
    this.assertStoredUpload(base, upload);
    if (upload.status === "completed") throw new ServiceError(409, "BAD_REQUEST", "已完成任务不能取消");
    if (this.active.has(id)) throw new ServiceError(409, "BAD_REQUEST", "该上传任务正在接收分片");
    this.active.add(id);
    try { await rm(upload.temporaryPath, { force: true }); this.repository.updateState(id, "cancelled"); return publicRecord(this.required(id)); }
    finally { this.active.delete(id); }
  }
  clearCompleted(): number { return this.repository.clearCompleted(); }

  private required(id: string): StoredFileUpload { const upload = this.repository.find(id); if (!upload) throw new ServiceError(404, "NOT_FOUND", "上传任务不存在"); return upload; }
  private assertContained(base: string, candidate: string): void { const path = relative(base, candidate); if (path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path)) throw new ServiceError(400, "BAD_REQUEST", "上传路径超出允许目录"); }
  private async rootPath(): Promise<string> { await this.initialize(); return realpath(this.root); }
  private assertStoredUpload(base: string, upload: StoredFileUpload): void { this.assertContained(base, upload.temporaryPath); this.assertContained(base, resolve(base, upload.targetPath)); }
  private assertStoredPaths(base: string): void { for (const upload of this.repository.list()) this.assertStoredUpload(base, upload); }
  private async ensureDirectory(base: string, relativeDirectory: string): Promise<string> {
    let current = base;
    for (const part of relativeDirectory ? relativeDirectory.split("/") : []) {
      const next = resolve(current, part); this.assertContained(base, next);
      try { const info = await lstat(next); if (!info.isDirectory() || info.isSymbolicLink()) throw new ServiceError(400, "BAD_REQUEST", "上传目录包含不允许的链接或文件"); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; await mkdir(next, { mode: 0o700 }); }
      current = await realpath(next); this.assertContained(base, current);
    }
    return current;
  }
  private async inspectTemporary(path: string): Promise<{ digest: string; dev: number; ino: number; size: number }> {
    const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const info = await handle.stat(); if (!info.isFile()) throw new ServiceError(409, "BAD_REQUEST", "临时上传项不是普通文件");
      const hash = createHash("sha256"); for await (const chunk of handle.createReadStream({ autoClose: false })) hash.update(chunk);
      return { digest: hash.digest("hex"), dev: info.dev, ino: info.ino, size: info.size };
    } finally { await handle.close(); }
  }
}
