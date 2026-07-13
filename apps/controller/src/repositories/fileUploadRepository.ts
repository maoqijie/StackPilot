import type { FileUploadRecord } from "@stackpilot/contracts";
import type Database from "better-sqlite3";

export type StoredFileUpload = FileUploadRecord & { ownerUserId: string; temporaryPath: string; idempotencyKey: string };
type FileUploadRow = {
  id: string; owner_user_id: string; owner_display_name: string; file_name: string; target_directory: string;
  target_path: string; temporary_path: string; content_type: string; size_bytes: number; received_bytes: number;
  status: FileUploadRecord["status"]; sha256: string | null; error_message: string | null; idempotency_key: string;
  created_at: string; updated_at: string; completed_at: string | null;
};

function mapRow(row: FileUploadRow): StoredFileUpload {
  return {
    id: row.id, ownerUserId: row.owner_user_id, owner: row.owner_display_name, fileName: row.file_name,
    targetDirectory: row.target_directory, targetPath: row.target_path, temporaryPath: row.temporary_path,
    contentType: row.content_type, sizeBytes: row.size_bytes, receivedBytes: row.received_bytes, status: row.status,
    sha256: row.sha256, errorMessage: row.error_message, idempotencyKey: row.idempotency_key,
    createdAt: row.created_at, updatedAt: row.updated_at, completedAt: row.completed_at,
  };
}

export class FileUploadRepository {
  constructor(private readonly database: Database.Database) {}
  list(): StoredFileUpload[] { return (this.database.prepare("SELECT * FROM file_uploads ORDER BY created_at DESC LIMIT 1000").all() as FileUploadRow[]).map(mapRow); }
  find(id: string): StoredFileUpload | null { const row = this.database.prepare("SELECT * FROM file_uploads WHERE id=?").get(id) as FileUploadRow | undefined; return row ? mapRow(row) : null; }
  findIdempotent(ownerUserId: string, key: string): StoredFileUpload | null { const row = this.database.prepare("SELECT * FROM file_uploads WHERE owner_user_id=? AND idempotency_key=?").get(ownerUserId, key) as FileUploadRow | undefined; return row ? mapRow(row) : null; }
  create(upload: StoredFileUpload): void {
    this.database.prepare(`INSERT INTO file_uploads(id,owner_user_id,owner_display_name,file_name,target_directory,target_path,temporary_path,content_type,size_bytes,received_bytes,status,sha256,error_message,idempotency_key,created_at,updated_at,completed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      upload.id, upload.ownerUserId, upload.owner, upload.fileName, upload.targetDirectory, upload.targetPath,
      upload.temporaryPath, upload.contentType, upload.sizeBytes, upload.receivedBytes, upload.status, upload.sha256,
      upload.errorMessage, upload.idempotencyKey, upload.createdAt, upload.updatedAt, upload.completedAt,
    );
  }
  updateProgress(id: string, expectedOffset: number, receivedBytes: number, status: FileUploadRecord["status"]): boolean {
    return this.database.prepare("UPDATE file_uploads SET received_bytes=?,status=?,error_message=NULL,updated_at=? WHERE id=? AND received_bytes=?").run(receivedBytes, status, new Date().toISOString(), id, expectedOffset).changes === 1;
  }
  updateState(id: string, status: FileUploadRecord["status"], values: { sha256?: string | null; errorMessage?: string | null; completedAt?: string | null } = {}): void {
    this.database.prepare("UPDATE file_uploads SET status=?,sha256=COALESCE(?,sha256),error_message=?,completed_at=?,updated_at=? WHERE id=?").run(status, values.sha256 ?? null, values.errorMessage ?? null, values.completedAt ?? null, new Date().toISOString(), id);
  }
  clearCompleted(): number { return this.database.prepare("DELETE FROM file_uploads WHERE status='completed'").run().changes; }
  pauseInterrupted(): void { this.database.prepare("UPDATE file_uploads SET status='waiting',updated_at=? WHERE status='uploading'").run(new Date().toISOString()); }
}
