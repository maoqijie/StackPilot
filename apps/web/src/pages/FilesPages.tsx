import type { Permission } from "@stackpilot/contracts";
import { useState } from "react";
import { FileTrashPage } from "../features/files/FileTrashPage";
import { FileUploadQueuePage } from "../features/files/FileUploadQueuePage";
import { FilesBrowserPage } from "../features/files/FilesBrowserPage";
import type { FileRecord } from "../features/files/types";
import { initialFileRecords, initialTrashFiles } from "../mocks/demoData";
import type { Notify, PageKey } from "../types/app";

function FilesModule({page,notify,permissions=[]}:{page:PageKey;notify:Notify;permissions?:readonly Permission[]}){
  const[,setFiles]=useState(initialFileRecords),[trashRows,setTrashRows]=useState(initialTrashFiles),[restoredRows,setRestoredRows]=useState<FileRecord[]>([]);
  if(page==="files-upload")return <FileUploadQueuePage page={page} notify={notify}/>;
  if(page==="files-trash")return <FileTrashPage page={page} notify={notify} trashRows={trashRows} setTrashRows={setTrashRows} restoredRows={restoredRows} setRestoredRows={setRestoredRows} setFiles={setFiles}/>;
  return <FilesBrowserPage page={page} notify={notify} permissions={permissions}/>;
}

export { FilesModule, FileTrashPage, FileUploadQueuePage };
