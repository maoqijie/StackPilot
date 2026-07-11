import type Database from "better-sqlite3";
import { decryptValue, encryptValue } from "./crypto.js";
import { randomBytes } from "node:crypto";

type SecretRow={key_version:number;nonce:Buffer;ciphertext:Buffer;tag:Buffer};
export class SecretStore{
 constructor(private readonly database:Database.Database,private readonly key:Buffer,private readonly keyVersion=1){}
 set(name:string,value:Buffer){const encrypted=encryptValue(this.key,value,this.keyVersion);this.database.prepare("INSERT INTO encrypted_secrets(key,key_version,nonce,ciphertext,tag,updated_at)VALUES(?,?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET key_version=excluded.key_version,nonce=excluded.nonce,ciphertext=excluded.ciphertext,tag=excluded.tag,updated_at=excluded.updated_at").run(name,encrypted.keyVersion,encrypted.nonce,encrypted.ciphertext,encrypted.tag,new Date().toISOString());}
 get(name:string):Buffer|null{const row=this.database.prepare("SELECT key_version,nonce,ciphertext,tag FROM encrypted_secrets WHERE key=?").get(name) as SecretRow|undefined;return row?decryptValue(this.key,{keyVersion:row.key_version,nonce:row.nonce,ciphertext:row.ciphertext,tag:row.tag}):null;}
 rotate(newKey:Buffer,newVersion:number){const rows=this.database.prepare("SELECT key FROM encrypted_secrets").all() as Array<{key:string}>;this.database.transaction(()=>{for(const row of rows){const value=this.get(row.key);if(value){const encrypted=encryptValue(newKey,value,newVersion);this.database.prepare("UPDATE encrypted_secrets SET key_version=?,nonce=?,ciphertext=?,tag=?,updated_at=? WHERE key=?").run(encrypted.keyVersion,encrypted.nonce,encrypted.ciphertext,encrypted.tag,new Date().toISOString(),row.key);}}})();}
}
export function loadOrCreateAuditKey(database:Database.Database,masterKey:Buffer):Buffer{const store=new SecretStore(database,masterKey);const existing=store.get("internal.audit-chain-key");if(existing)return existing;const generated=randomBytes(32);store.set("internal.audit-chain-key",generated);return generated;}
