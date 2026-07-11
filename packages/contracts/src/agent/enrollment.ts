import { z } from "zod";
import { AgentCapabilitiesSchema, AgentPlatformSchema } from "./capabilities.js";
import { ProtocolVersionSchema } from "../versioning/index.js";

export const CreateEnrollmentRequestSchema = z.object({
  nodeName: z.string().trim().min(1).max(120),
  expiresInSeconds: z.number().int().min(60).max(900).default(300),
}).strict();
export const EnrollmentCredentialSchema = z.object({
  enrollmentId: z.string().uuid(), token: z.string().min(32), expiresAt: z.string().datetime(), purpose: z.literal("agent-enrollment"),
});
export const AgentEnrollmentRequestSchema = z.object({
  enrollmentToken: z.string().min(32), nodeName: z.string().trim().min(1).max(120), publicKey: z.string().min(32).max(2048),
  agentVersion: z.string().min(1).max(40), protocolVersion: ProtocolVersionSchema, platform: AgentPlatformSchema,
  capabilities: AgentCapabilitiesSchema,
}).strict();
export const AgentEnrollmentResponseSchema = z.object({
  nodeId: z.string().uuid(), credentialId: z.string().uuid(), protocolVersion: ProtocolVersionSchema,
  controllerTime: z.string().datetime(), heartbeatIntervalSeconds: z.number().int().positive(),
});
export const RotateCredentialRequestSchema = z.object({ rotationId: z.string().uuid(), publicKey: z.string().min(32).max(2048) }).strict();
export const RotateCredentialResponseSchema = z.object({ credentialId: z.string().uuid(), rotatedAt: z.string().datetime() });
export const EnrollmentRecordSchema = z.object({ enrollmentId: z.string().uuid(), nodeName: z.string(), expiresAt: z.string().datetime(), usedAt: z.string().datetime().nullable(), revokedAt: z.string().datetime().nullable() });
export const AgentNodeRecordSchema = z.object({
  nodeId: z.string().uuid(), nodeName: z.string(), status: z.enum(["pending", "online", "offline", "revoked"]),
  agentVersion: z.string(), protocolVersion: ProtocolVersionSchema, platform: AgentPlatformSchema,
  declaredCapabilities: AgentCapabilitiesSchema, allowedCapabilities: AgentCapabilitiesSchema,
  enrolledAt: z.string().datetime(), lastSeenAt: z.string().datetime().nullable(), revokedAt: z.string().datetime().nullable(),
});
export const AgentNodeListResponseSchema = z.object({ nodes: z.array(AgentNodeRecordSchema) });

export type CreateEnrollmentRequest = z.infer<typeof CreateEnrollmentRequestSchema>;
export type AgentEnrollmentRequest = z.infer<typeof AgentEnrollmentRequestSchema>;
export type AgentNodeRecord = z.infer<typeof AgentNodeRecordSchema>;
