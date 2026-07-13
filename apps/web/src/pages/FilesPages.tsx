import type { Permission } from "@stackpilot/contracts";
import { FileTrashPage } from "../features/files/FileTrashPage";
import { FileUploadQueuePage } from "../features/files/FileUploadQueuePage";
import { FilesBrowserPage } from "../features/files/FilesBrowserPage";
import type { Notify, PageKey } from "../types/app";

function FilesModule({page,notify,permissions=[]}:{page:PageKey;notify:Notify;permissions?:readonly Permission[]}){
  if(page==="files-upload")return <FileUploadQueuePage page={page} notify={notify}/>;
  if(page==="files-trash")return <FileTrashPage page={page} notify={notify} canManage={permissions.includes("files:manage")}/>;
  return <FilesBrowserPage page={page} notify={notify} permissions={permissions}/>;
}

export { FilesModule, FileTrashPage, FileUploadQueuePage };
