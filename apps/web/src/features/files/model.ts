import type { FileRecord } from "./types";
import type { PageKey } from "../../types/app";

function filesPagePreset(page: PageKey) {
  if (page === "files-upload") return { path: "/", type: "文件", search: "", subtitle: "上传记录由 Controller 真实保存。" };
  if (page === "files-trash") return { path: "/", type: "全部", search: "", subtitle: "回收站项目保留 7 天并支持恢复。" };
  return { path: "/", type: "全部", search: "", subtitle: "浏览和管理 Controller 配置的受管文件根目录。" };
}

function fileSizeSortValue(row: FileRecord) {
  return row.type === "文件夹" ? null : row.sizeBytes;
}

export { filesPagePreset, fileSizeSortValue };
