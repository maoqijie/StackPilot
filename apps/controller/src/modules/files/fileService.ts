import { constants } from "node:fs";
import { access, lstat, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { FileEntry, FileListPayload } from "@stackpilot/contracts";
import { ServiceError } from "../serviceError.js";

type RootMatch = { configuredRoot: string; realRoot: string; absolutePath: string };
const isInside = (root: string, candidate: string) => { const value = relative(root, candidate); return value === "" || (value !== ".." && !value.startsWith(`..${sep}`)); };
function validName(value: string) { const name = value.trim(); if (!name || name === "." || name === ".." || /[\\/\0-\x1f]/.test(name)) throw new ServiceError(400,"BAD_REQUEST","文件名无效"); return name; }

export class FileService {
  private owners: Map<number, string> | null = null;
  constructor(private readonly roots: readonly string[]) { if (!roots.length || roots.some((root) => !isAbsolute(root))) throw new Error("文件根目录必须是绝对路径"); }
  private normalized(value: string) { if (!isAbsolute(value) || value.includes("\0")) throw new ServiceError(400,"BAD_REQUEST","文件路径无效"); return normalize(value); }
  private rootFor(path: string) { const root = this.roots.map(resolve).filter((item) => isInside(item,path)).sort((a,b)=>b.length-a.length)[0]; if(!root)throw new ServiceError(403,"FORBIDDEN","文件路径超出允许范围");return root; }
  private async existing(value: string): Promise<RootMatch> {
    const absolutePath=this.normalized(value),configuredRoot=this.rootFor(absolutePath);let realRoot:string,realTarget:string;
    try{[realRoot,realTarget]=await Promise.all([realpath(configuredRoot),realpath(absolutePath)]);}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")throw new ServiceError(404,"NOT_FOUND","文件或目录不存在");throw error;}
    if(!isInside(realRoot,realTarget))throw new ServiceError(403,"FORBIDDEN","符号链接指向允许范围之外");return{configuredRoot,realRoot,absolutePath};
  }
  private async parentForNew(path:string){const parent=await this.existing(dirname(path));if(!isInside(parent.realRoot,path))throw new ServiceError(403,"FORBIDDEN","文件路径超出允许范围");return parent;}
  private async owner(uid:number){if(!this.owners){this.owners=new Map();try{for(const line of (await readFile("/etc/passwd","utf8")).split("\n")){const row=line.split(":"),id=Number(row[2]);if(row[0]&&Number.isInteger(id))this.owners.set(id,row[0]);}}catch{/* Numeric UID fallback. */}}return this.owners.get(uid)??`UID ${uid}`;}
  private async entry(path:string,parentPath=dirname(path)):Promise<FileEntry>{const stats=await lstat(path),kind=stats.isDirectory()?"directory":stats.isSymbolicLink()?"symlink":"file";return{id:createHash("sha256").update(path).digest("hex"),name:basename(path),kind,path,parentPath,sizeBytes:kind==="file"?stats.size:null,modifiedAt:stats.mtime.toISOString(),owner:await this.owner(stats.uid)};}
  async list(value:string):Promise<FileListPayload>{const match=await this.existing(value),stats=await lstat(match.absolutePath);if(!stats.isDirectory())throw new ServiceError(400,"BAD_REQUEST","请求路径不是目录");const entries=await Promise.all((await readdir(match.absolutePath)).filter((name)=>name!==".stackpilot-trash").map((name)=>this.entry(join(match.absolutePath,name),match.absolutePath)));entries.sort((a,b)=>a.kind===b.kind?a.name.localeCompare(b.name):a.kind==="directory"?-1:1);return{rootPath:match.configuredRoot,path:match.absolutePath,parentPath:match.absolutePath===match.configuredRoot?null:dirname(match.absolutePath),entries,collectedAt:new Date().toISOString(),writable:await access(match.absolutePath,constants.W_OK).then(()=>true,()=>false)};}
  async createDirectory(path:string,name:string){const parent=await this.existing(path),target=join(parent.absolutePath,validName(name));if(!isInside(parent.realRoot,target))throw new ServiceError(403,"FORBIDDEN","文件路径超出允许范围");try{await mkdir(target,{mode:0o775});}catch(error){if((error as NodeJS.ErrnoException).code==="EEXIST")throw new ServiceError(409,"BAD_REQUEST","同名项目已存在");throw error;}return this.entry(target,parent.absolutePath);}
  async upload(path:string,name:string,content:Buffer){const target=join(this.normalized(path),validName(name));await this.parentForNew(target);try{await writeFile(target,content,{flag:"wx",mode:0o664});}catch(error){if((error as NodeJS.ErrnoException).code==="EEXIST")throw new ServiceError(409,"BAD_REQUEST","同名项目已存在");throw error;}return this.entry(target,dirname(target));}
  async rename(path:string,newName:string){const source=await this.existing(path);if(source.absolutePath===source.configuredRoot)throw new ServiceError(403,"FORBIDDEN","不能重命名文件根目录");const target=join(dirname(source.absolutePath),validName(newName));await this.parentForNew(target);try{await lstat(target);throw new ServiceError(409,"BAD_REQUEST","同名项目已存在");}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}await rename(source.absolutePath,target);return this.entry(target,dirname(target));}
  async moveToTrash(path:string){const source=await this.existing(path);if(source.absolutePath===source.configuredRoot)throw new ServiceError(403,"FORBIDDEN","不能删除文件根目录");const trash=join(source.configuredRoot,".stackpilot-trash"),bucket=join(trash,randomUUID());await mkdir(bucket,{recursive:true,mode:0o700});await rename(source.absolutePath,join(bucket,basename(source.absolutePath)));return basename(source.absolutePath);}
  async purgeTrash(){for(const root of this.roots){const trash=join(resolve(root),".stackpilot-trash");await rm(trash,{recursive:true,force:true});}}
}
