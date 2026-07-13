import type { FileEntry } from "../../api/filesApi";
import type { FileRecord } from "./types";
import { formatBackendDateTime } from "../../utils/time";

export function formatBytes(bytes: number | null) {
  if (bytes === null) return "-";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"]; let value = bytes / 1024; let index = 0;
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}
export function entryToView(entry: FileEntry): FileRecord {
  const parent = entry.path === `/${entry.name}` ? "/" : entry.path.slice(0, -(entry.name.length + 1)) || "/";
  return { id: entry.id, name: entry.name, type: entry.kind === "directory" ? "文件夹" : "文件", path: parent, size: formatBytes(entry.sizeBytes), sizeBytes: entry.sizeBytes, modified: formatBackendDateTime(entry.modifiedAt), owner: entry.owner };
}
export const joinVirtualPath = (parent: string, name: string) => `${parent === "/" ? "" : parent}/${name}`;
