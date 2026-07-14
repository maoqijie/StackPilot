type FileRecord = {
  id: string;
  name: string;
  type: "文件夹" | "文件";
  path: string;
  size: string;
  sizeBytes: number | null;
  modified: string;
  owner: string;
};
export type { FileRecord };
