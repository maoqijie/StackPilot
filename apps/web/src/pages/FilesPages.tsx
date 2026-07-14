import type { Permission } from "@stackpilot/contracts";
import { Shield } from "lucide-react";
import type { Notify, PageKey } from "../types/app";
import { FilesPage } from "./files/FilesPage";
import { FileTrashPage } from "./files/FileTrashPage";
import { FileUploadQueuePage } from "./files/FileUploadQueuePage";

function FilesModule({ page, notify, permissions }: { page: PageKey; notify: Notify; permissions: Permission[] }) {
  if (!permissions.includes("files:read")) return <section className="module-page module-page-files"><h1>文件</h1><div className="overview-error-state" role="alert"><Shield size={18} /><span>当前账号没有文件读取权限</span></div></section>;
  const canWrite = permissions.includes("files:write"); const canDelete = permissions.includes("files:delete");
  if (page === "files-upload") return <FileUploadQueuePage page={page} notify={notify} canWrite={canWrite} />;
  if (page === "files-trash") return <FileTrashPage page={page} notify={notify} canWrite={canWrite} canDelete={canDelete} />;
  return <FilesPage page={page} notify={notify} canWrite={canWrite} />;
}

export { FilesModule, FilesPage, FileUploadQueuePage, FileTrashPage };
