import { constants } from "node:fs";
import { access, chmod, lstat, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { FileEntry, FileListPayload } from "@stackpilot/contracts";
import { ServiceError } from "../serviceError.js";
import type { FileTrashRepository } from "./fileTrashRepository.js";

type RootMatch = { configuredRoot: string; realRoot: string; absolutePath: string };
type TrashLocation = { trashRoot: string; bucketPath: string; itemPath: string };
export type TrashPurgeStage = { originalBucketPath: string; stagedBucketPath: string };
const isInside = (root: string, candidate: string) => { const value = relative(root, candidate); return value === "" || (value !== ".." && !value.startsWith(`..${sep}`)); };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validName(value: string) { const name = value.trim(),control=[...name].some((character)=>character.charCodeAt(0)<32); if (!name || name === "." || name === ".." || name === ".stackpilot-trash" || /[\\/]/.test(name) || control) throw new ServiceError(400,"BAD_REQUEST","文件名无效"); return name; }

export class FileService {
  private owners: Map<number, string> | null = null;
  private mutation = Promise.resolve();
  constructor(private readonly roots: readonly string[], private readonly trashRepository?: FileTrashRepository) { if (!roots.length || roots.some((root) => !isAbsolute(root))) throw new Error("文件根目录必须是绝对路径"); }
  defaultRoot(){return resolve(this.roots[0]!);}
  private async mutate<T>(operation:()=>Promise<T>):Promise<T>{const previous=this.mutation;let release!:()=>void;this.mutation=new Promise<void>((resolve)=>{release=resolve;});await previous;try{return await operation();}finally{release();}}
  private normalized(value: string) { if (!isAbsolute(value) || value.includes("\0")) throw new ServiceError(400,"BAD_REQUEST","文件路径无效");const path=normalize(value);if(path.split(sep).includes(".stackpilot-trash"))throw new ServiceError(403,"FORBIDDEN","文件回收目录不可直接访问");return path; }
  private async rootFor(path: string) { const matches=await Promise.all(this.roots.map(async(item)=>{const configuredRoot=resolve(item);try{const realRoot=await realpath(configuredRoot);return isInside(configuredRoot,path)||isInside(realRoot,path)?{configuredRoot,realRoot}:null;}catch{return null;}}));const root=matches.filter((item):item is {configuredRoot:string;realRoot:string}=>Boolean(item)).sort((a,b)=>b.realRoot.length-a.realRoot.length)[0];if(!root)throw new ServiceError(403,"FORBIDDEN","文件路径超出允许范围");return root; }
  private async existing(value: string): Promise<RootMatch> {
    const absolutePath=this.normalized(value),{configuredRoot,realRoot}=await this.rootFor(absolutePath);let realTarget:string;
    try{realTarget=await realpath(absolutePath);}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")throw new ServiceError(404,"NOT_FOUND","文件或目录不存在");throw error;}
    const base=isInside(configuredRoot,absolutePath)?configuredRoot:realRoot,expected=join(realRoot,relative(base,absolutePath));if(!isInside(realRoot,realTarget)||realTarget!==expected)throw new ServiceError(403,"FORBIDDEN","文件路径包含不受信任的符号链接");return{configuredRoot,realRoot,absolutePath:realTarget};
  }
  private async targetForNew(path:string){const parent=await this.existing(dirname(path)),target=join(parent.absolutePath,basename(path));if(!isInside(parent.realRoot,target))throw new ServiceError(403,"FORBIDDEN","文件路径超出允许范围");return target;}
  private async trashLocation(trashPath:string, requireItem=true):Promise<TrashLocation>{
    if(!isAbsolute(trashPath)||trashPath.includes("\0"))throw new ServiceError(403,"FORBIDDEN","回收站存储路径无效");
    const itemPath=normalize(trashPath),bucketPath=dirname(itemPath),trashRoot=dirname(bucketPath);
    if(basename(trashRoot)!==".stackpilot-trash"||!UUID_PATTERN.test(basename(bucketPath)))throw new ServiceError(403,"FORBIDDEN","回收站存储路径无效");
    const rootMatch=await this.rootFor(dirname(trashRoot));
    if(trashRoot!==join(rootMatch.realRoot,".stackpilot-trash"))throw new ServiceError(403,"FORBIDDEN","回收站存储路径无效");
    const realTrash=await realpath(trashRoot);
    if(realTrash!==trashRoot)throw new ServiceError(403,"FORBIDDEN","回收站存储路径不安全");
    try{
      const bucketStats=await lstat(bucketPath);
      if(!bucketStats.isDirectory()||bucketStats.isSymbolicLink()||await realpath(bucketPath)!==bucketPath)throw new ServiceError(403,"FORBIDDEN","回收站存储路径不安全");
    }catch(error){
      if(!requireItem&&(error as NodeJS.ErrnoException).code==="ENOENT")return{trashRoot,bucketPath,itemPath};
      throw error;
    }
    try{
      const realItem=await realpath(itemPath);
      if(realItem!==itemPath||dirname(realItem)!==bucketPath)throw new ServiceError(403,"FORBIDDEN","回收站存储路径不安全");
    }catch(error){
      if(!requireItem&&(error as NodeJS.ErrnoException).code==="ENOENT")return{trashRoot,bucketPath,itemPath};
      throw error;
    }
    return{trashRoot,bucketPath,itemPath};
  }
  private async trashPurgePaths(trashPath:string){
    if(!isAbsolute(trashPath)||trashPath.includes("\0"))throw new ServiceError(403,"FORBIDDEN","回收站存储路径无效");
    const itemPath=normalize(trashPath),originalBucketPath=dirname(itemPath),trashRoot=dirname(originalBucketPath),bucketId=basename(originalBucketPath);
    if(basename(trashRoot)!==".stackpilot-trash"||!UUID_PATTERN.test(bucketId))throw new ServiceError(403,"FORBIDDEN","回收站存储路径无效");
    const rootMatch=await this.rootFor(dirname(trashRoot));
    if(trashRoot!==join(rootMatch.realRoot,".stackpilot-trash"))throw new ServiceError(403,"FORBIDDEN","回收站存储路径无效");
    return{trashRoot,originalBucketPath,stagedBucketPath:join(trashRoot,`.purging-${bucketId}`)};
  }
  private async safeDirectory(path:string){const stats=await lstat(path);return stats.isDirectory()&&!stats.isSymbolicLink()&&await realpath(path)===path;}
  private async owner(uid:number){if(!this.owners){this.owners=new Map();try{for(const line of (await readFile("/etc/passwd","utf8")).split("\n")){const row=line.split(":"),id=Number(row[2]);if(row[0]&&Number.isInteger(id))this.owners.set(id,row[0]);}}catch{/* Numeric UID fallback. */}}return this.owners.get(uid)??`UID ${uid}`;}
  private async entry(path:string,parentPath=dirname(path)):Promise<FileEntry>{const stats=await lstat(path),kind=stats.isDirectory()?"directory":stats.isSymbolicLink()?"symlink":"file";return{id:createHash("sha256").update(path).digest("hex"),name:basename(path),kind,path,parentPath,sizeBytes:kind==="file"?stats.size:null,modifiedAt:stats.mtime.toISOString(),owner:await this.owner(stats.uid)};}
  async list(value:string):Promise<FileListPayload>{const match=await this.existing(value),stats=await lstat(match.absolutePath);if(!stats.isDirectory())throw new ServiceError(400,"BAD_REQUEST","请求路径不是目录");const names=(await readdir(match.absolutePath)).filter((name)=>name!==".stackpilot-trash");if(names.length>5000)throw new ServiceError(413,"PAYLOAD_TOO_LARGE","目录项目超过 5000 个");const entries=await Promise.all(names.map((name)=>this.entry(join(match.absolutePath,name),match.absolutePath)));entries.sort((a,b)=>a.kind===b.kind?a.name.localeCompare(b.name):a.kind==="directory"?-1:1);return{rootPath:match.configuredRoot,path:match.absolutePath,parentPath:match.absolutePath===match.realRoot?null:dirname(match.absolutePath),entries,collectedAt:new Date().toISOString(),writable:await access(match.absolutePath,constants.W_OK).then(()=>true,()=>false)};}
  async createDirectory(path:string,name:string){return this.mutate(async()=>{const parent=await this.existing(path),target=join(parent.absolutePath,validName(name));if(!isInside(parent.realRoot,target))throw new ServiceError(403,"FORBIDDEN","文件路径超出允许范围");try{await mkdir(target,{mode:0o775});}catch(error){if((error as NodeJS.ErrnoException).code==="EEXIST")throw new ServiceError(409,"BAD_REQUEST","同名项目已存在");throw error;}await chmod(target,0o775);return this.entry(target,parent.absolutePath);});}
  async upload(path:string,name:string,content:Buffer){return this.mutate(async()=>{const target=await this.targetForNew(join(this.normalized(path),validName(name)));try{await writeFile(target,content,{flag:"wx",mode:0o664});}catch(error){if((error as NodeJS.ErrnoException).code==="EEXIST")throw new ServiceError(409,"BAD_REQUEST","同名项目已存在");throw error;}await chmod(target,0o664);return this.entry(target,dirname(target));});}
  async rename(path:string,newName:string){return this.mutate(async()=>{const source=await this.existing(path);if(source.absolutePath===source.realRoot)throw new ServiceError(403,"FORBIDDEN","不能重命名文件根目录");const target=await this.targetForNew(join(dirname(source.absolutePath),validName(newName)));try{await lstat(target);throw new ServiceError(409,"BAD_REQUEST","同名项目已存在");}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}await rename(source.absolutePath,target);return this.entry(target,dirname(target));});}
  async moveToTrash(path:string,owner="unknown"){return this.mutate(async()=>{const source=await this.existing(path);if(source.absolutePath===source.realRoot)throw new ServiceError(403,"FORBIDDEN","不能删除文件根目录");const file=await this.entry(source.absolutePath),trash=join(source.realRoot,".stackpilot-trash");try{const stats=await lstat(trash);if(!stats.isDirectory()||stats.isSymbolicLink())throw new ServiceError(403,"FORBIDDEN","文件回收目录不安全");}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;await mkdir(trash,{mode:0o700});}const id=randomUUID(),bucket=join(trash,id),trashPath=join(bucket,file.name);await mkdir(bucket,{mode:0o700});try{await rename(source.absolutePath,trashPath);const deletedAt=new Date().toISOString();this.trashRepository?.create({id,name:file.name,kind:file.kind==="directory"?"directory":"file",originalPath:source.absolutePath,sizeBytes:file.sizeBytes,deletedAt,expiresAt:new Date(Date.now()+7*86_400_000).toISOString(),owner,reason:"从文件管理删除"},trashPath);}catch(error){let restored=false;try{await rename(trashPath,source.absolutePath);restored=true;}catch{/* Preserve the bucket for manual recovery. */}if(restored)await rm(bucket,{recursive:true,force:true});throw error;}return file.name;});}
  async restoreFromTrash(originalPath:string,trashPath:string){return this.mutate(async()=>{const location=await this.trashLocation(trashPath),target=await this.targetForNew(originalPath);try{await lstat(target);throw new ServiceError(409,"BAD_REQUEST","原路径已存在同名项目");}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}await rename(location.itemPath,target);});}
  async completeTrashRestore(trashPath:string){return this.mutate(async()=>{const location=await this.trashLocation(trashPath,false);await rm(location.bucketPath,{recursive:true,force:true});});}
  async rollbackTrashRestore(originalPath:string,trashPath:string){return this.mutate(async()=>{const location=await this.trashLocation(trashPath,false),source=await this.existing(originalPath);await mkdir(location.bucketPath,{mode:0o700,recursive:true});try{await rename(source.absolutePath,location.itemPath);}catch(error){await rm(location.bucketPath,{recursive:true,force:true});throw error;}});}
  async stageTrashPurge(trashPath:string){return this.mutate(async():Promise<TrashPurgeStage|null>=>{const paths=await this.trashPurgePaths(trashPath);try{if(!await this.safeDirectory(paths.trashRoot))throw new ServiceError(403,"FORBIDDEN","回收站存储路径不安全");}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return null;throw error;}try{if(!await this.safeDirectory(paths.originalBucketPath))throw new ServiceError(403,"FORBIDDEN","回收站存储路径不安全");try{await lstat(paths.stagedBucketPath);throw new ServiceError(409,"BAD_REQUEST","回收站清理状态冲突");}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}await rename(paths.originalBucketPath,paths.stagedBucketPath);return{originalBucketPath:paths.originalBucketPath,stagedBucketPath:paths.stagedBucketPath};}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;try{if(!await this.safeDirectory(paths.stagedBucketPath))throw new ServiceError(403,"FORBIDDEN","回收站存储路径不安全");return{originalBucketPath:paths.originalBucketPath,stagedBucketPath:paths.stagedBucketPath};}catch(stagedError){if((stagedError as NodeJS.ErrnoException).code==="ENOENT")return null;throw stagedError;}}});}
  async rollbackTrashPurge(stage:TrashPurgeStage){return this.mutate(async()=>{try{if(!await this.safeDirectory(stage.stagedBucketPath))throw new ServiceError(403,"FORBIDDEN","回收站存储路径不安全");}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return;throw error;}try{await lstat(stage.originalBucketPath);throw new ServiceError(409,"BAD_REQUEST","回收站清理回滚冲突");}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}await rename(stage.stagedBucketPath,stage.originalBucketPath);});}
  async completeTrashPurge(stage:TrashPurgeStage){return this.mutate(async()=>{try{if(!await this.safeDirectory(stage.stagedBucketPath))throw new ServiceError(403,"FORBIDDEN","回收站存储路径不安全");}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return;throw error;}await rm(stage.stagedBucketPath,{recursive:true,force:true});});}
}
