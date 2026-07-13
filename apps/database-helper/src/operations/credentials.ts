import { constants, createPublicKey, publicEncrypt, randomBytes } from "node:crypto";
import { DatabaseCredentialEnvelopeSchema } from "@stackpilot/contracts";
import type { z } from "zod";
import { HelperError } from "../domain.js";

type DatabaseCredentialEnvelope = z.infer<typeof DatabaseCredentialEnvelopeSchema>;

export function generateStrongPassword() { return randomBytes(32).toString("base64url"); }
export function encryptCredentials(publicKeyPem: string, value: Record<string, string>): DatabaseCredentialEnvelope {
  const key = createPublicKey(publicKeyPem);
  if (key.asymmetricKeyType !== "rsa" || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) throw new HelperError("INVALID_CREDENTIAL_KEY", "临时凭据公钥必须为至少 2048 位 RSA 公钥");
  const ciphertext = publicEncrypt({ key, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, Buffer.from(JSON.stringify(value), "utf8"));
  return { algorithm: "RSA-OAEP-256", ciphertext: ciphertext.toString("base64"), expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() };
}
