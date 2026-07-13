import { normalizeTableValue } from "../../utils/data";
import type { FileRecord } from "./types";
import type { PageKey } from "../../types/app";

function filesPagePreset(page: PageKey) {
  if (page === "files-upload") return { path: "/var/www/html", type: "文件", search: "upload", subtitle: "上传队列视图，展示当前路径中的上传文件项。" };
  if (page === "files-trash") return { path: "/tmp", type: "全部", search: "old", subtitle: "回收站视图，集中处理 7 天保留的可删除文件。" };
  return { path: "/var/www", type: "全部", search: "", subtitle: "浏览和管理服务器 /var/www 目录中的真实文件。" };
}

function fileSizeValue(value: string) {
  const normalized = normalizeTableValue(value);
  return typeof normalized === "number" ? normalized : null;
}

function fileSizeSortValue(row: FileRecord) {
  return row.type === "文件夹" ? null : fileSizeValue(row.size);
}

export { filesPagePreset, fileSizeValue, fileSizeSortValue };
