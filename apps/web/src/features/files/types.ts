

type FileRecord = {
  id: string;
  name: string;
  type: "文件夹" | "文件";
  path: string;
  size: string;
  modified: string;
  owner: string;
};

type FileUploadRecord = {
  id: string;
  name: string;
  targetPath: string;
  size: string;
  progress: number;
  status: "上传中" | "等待" | "已完成" | "失败";
  speed: string;
  owner: string;
  startedAt: string;
};

export type { FileRecord, FileUploadRecord };
