import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const digest = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
export function constantTimeDigestEqual(value: string, expectedDigest: string): boolean {
  const actual = Buffer.from(digest(value), "hex");
  const expected = Buffer.from(expectedDigest, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function parseMasterKey(value: string): Buffer {
  const key = /^[a-f0-9]{64}$/i.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64url");
  if (key.length !== 32) throw new Error("STACKPILOT_MASTER_KEY 必须是 32 字节的 base64url 或十六进制值");
  return key;
}
export function deriveKey(masterKey: Buffer, purpose: string): Buffer {
  return Buffer.from(hkdfSync("sha256", masterKey, Buffer.from("stackpilot-v1"), Buffer.from(purpose), 32));
}
export type EncryptedValue = { keyVersion: number; nonce: Buffer; ciphertext: Buffer; tag: Buffer };
export function encryptValue(key: Buffer, plaintext: Buffer, keyVersion = 1): EncryptedValue {
  const nonce = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { keyVersion, nonce, ciphertext, tag: cipher.getAuthTag() };
}
export function decryptValue(key: Buffer, value: EncryptedValue): Buffer {
  const decipher = createDecipheriv("aes-256-gcm", key, value.nonce); decipher.setAuthTag(value.tag);
  return Buffer.concat([decipher.update(value.ciphertext), decipher.final()]);
}
export const hmac = (key: Buffer, value: string) => createHmac("sha256", key).update(value).digest("hex");

