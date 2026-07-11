import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadControllerConfig } from "../../apps/controller/dist/config/environment.js";
const config=loadControllerConfig();const npmCli=process.env.npm_execpath;if(!npmCli)throw new Error("必须通过 npm run release:upgrade 启动升级");const stamp=new Date().toISOString().replace(/[:.]/g,"-");const backup=resolve(process.argv[2]??`.stackpilot/backups/pre-upgrade-${stamp}.sqlite3`);mkdirSync(dirname(backup),{recursive:true,mode:0o700});
execFileSync(process.execPath,["deploy/scripts/preflight.mjs"],{stdio:"inherit",env:process.env});
execFileSync(process.execPath,[npmCli,"run","db:backup","--workspace","@stackpilot/controller","--",backup],{stdio:"inherit",env:process.env});
writeFileSync(`${backup}.sha256`,`${createHash("sha256").update(readFileSync(backup)).digest("hex")}  ${backup.split(/[\\/]/).at(-1)}\n`,{mode:0o600});
try{execFileSync(process.execPath,[npmCli,"run","db:migrate","--workspace","@stackpilot/controller"],{stdio:"inherit",env:process.env});execFileSync(process.execPath,[npmCli,"run","audit:verify","--workspace","@stackpilot/controller"],{stdio:"inherit",env:process.env});process.stdout.write(`升级迁移成功；升级前备份：${backup}\n`);}catch(error){process.stderr.write(`迁移失败，发布已停止。使用 db:restore 恢复 ${backup}\n`);process.exitCode=1;}
