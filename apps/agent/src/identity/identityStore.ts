import { createPrivateKey, createPublicKey, generateKeyPairSync } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ProtocolVersionSchema } from "@stackpilot/contracts";
import { z } from "zod";

export type AgentIdentity = { nodeId: string; credentialId: string; privateKey: string; publicKey: string; protocolVersion: string; createdAt: string };
export type PendingIdentity = { privateKey: string; publicKey: string };
export type PendingRotation = PendingIdentity & { rotationId: string; createdAt: string };
const AgentIdentitySchema = z.object({ nodeId: z.string().uuid(), credentialId: z.string().uuid(), privateKey: z.string(), publicKey: z.string(), protocolVersion: ProtocolVersionSchema, createdAt: z.string().datetime() }).strict();
const PendingRotationSchema = z.object({ rotationId: z.string().uuid(), privateKey: z.string(), publicKey: z.string(), createdAt: z.string().datetime() }).strict();
function validateKeys<T extends { privateKey: string; publicKey: string }>(value: T): T { const privateKey = createPrivateKey(value.privateKey); const publicKey = createPublicKey(value.publicKey); if (privateKey.asymmetricKeyType !== "ed25519" || publicKey.asymmetricKeyType !== "ed25519") throw new Error("Agent identity keys must be Ed25519"); return value; }

export class IdentityStore {
  readonly identityPath: string;
  readonly receiptPath: string;
  readonly pendingRotationPath: string;
  constructor(readonly stateDir: string) { this.identityPath = join(stateDir, "identity.json"); this.receiptPath = join(stateDir, "task-receipts.json"); this.pendingRotationPath = join(stateDir, "pending-rotation.json"); }
  createKeyPair(): PendingIdentity { const pair = generateKeyPairSync("ed25519"); return { privateKey: pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString(), publicKey: pair.publicKey.export({ type: "spki", format: "pem" }).toString() }; }
  async read(): Promise<AgentIdentity | null> { try { return validateKeys(AgentIdentitySchema.parse(JSON.parse(await readFile(this.identityPath, "utf8")))); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; } }
  async write(identity: AgentIdentity) { await mkdir(this.stateDir, { recursive: true, mode: 0o700 }); await chmod(this.stateDir, 0o700); const temporary = `${this.identityPath}.${process.pid}.tmp`; await writeFile(temporary, JSON.stringify(identity, null, 2), { mode: 0o600 }); await rename(temporary, this.identityPath); await chmod(this.identityPath, 0o600); }
  async readPendingRotation(): Promise<PendingRotation | null> { try { return validateKeys(PendingRotationSchema.parse(JSON.parse(await readFile(this.pendingRotationPath, "utf8")))); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; } }
  async writePendingRotation(value: PendingRotation) { await mkdir(this.stateDir, { recursive: true, mode: 0o700 }); await writeFile(this.pendingRotationPath, JSON.stringify(value, null, 2), { mode: 0o600 }); await chmod(this.pendingRotationPath, 0o600); }
  async clearPendingRotation() { await rm(this.pendingRotationPath, { force: true }); }
}
