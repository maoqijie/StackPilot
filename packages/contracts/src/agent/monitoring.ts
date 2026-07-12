import { z } from "zod";
import { AgentPlatformSchema } from "./capabilities.js";

const HostMonitoringBackupSchema = z.object({ status: z.enum(["unconfigured", "healthy", "degraded", "unavailable"]), latestAt: z.string().datetime().nullable(), detail: z.string().min(1).max(512) }).strict();
const HostMonitoringServiceSchema = z.object({ name: z.string().min(1).max(120), status: z.enum(["running", "stopped", "unavailable"]) }).strict();

const PercentSchema = z.number().finite().min(0).max(100);
const BytesSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const HostMonitoringMemorySchema = z.object({
  totalBytes: BytesSchema,
  usedBytes: BytesSchema,
  percent: PercentSchema,
}).strict().refine((value) => value.usedBytes <= value.totalBytes, { message: "usedBytes must not exceed totalBytes", path: ["usedBytes"] });

export const HostMonitoringVolumeSchema = z.object({
  label: z.string().min(1).max(120),
  mountPath: z.string().min(1).max(512),
  totalBytes: BytesSchema,
  usedBytes: BytesSchema,
  percent: PercentSchema,
}).strict().refine((value) => value.usedBytes <= value.totalBytes, { message: "usedBytes must not exceed totalBytes", path: ["usedBytes"] });

export const HostMonitoringDiskSchema = z.object({
  totalBytes: BytesSchema,
  usedBytes: BytesSchema,
  percent: PercentSchema,
  volumes: z.array(HostMonitoringVolumeSchema).max(256),
}).strict().refine((value) => value.usedBytes <= value.totalBytes, { message: "usedBytes must not exceed totalBytes", path: ["usedBytes"] });

export const HostMonitoringRecordSchema = z.object({
  id: z.string().min(1).max(160), source: z.enum(["controller", "agent"]), name: z.string().min(1).max(120),
  platform: AgentPlatformSchema, address: z.string().max(64).nullable(), environment: z.string().min(1).max(80), owner: z.string().min(1).max(120),
  connectionStatus: z.enum(["local", "pending", "online", "offline"]), healthStatus: z.enum(["healthy", "degraded", "unknown"]),
  telemetryFreshness: z.enum(["current", "stale", "awaiting"]),
  telemetryCollectedAt: z.string().datetime().nullable(), lastSeenAt: z.string().datetime().nullable(), cpuPercent: PercentSchema.nullable(),
  memory: HostMonitoringMemorySchema.nullable(), disk: HostMonitoringDiskSchema.nullable(), uptimeSeconds: z.number().int().nonnegative().nullable(),
  backup: HostMonitoringBackupSchema.nullable(), services: z.array(HostMonitoringServiceSchema).max(20), version: z.string().min(1).max(80),
  latency: z.number().finite().nonnegative().nullable(), updateStatus: z.string().min(1).max(120).nullable(),
}).strict();

export const HostMonitoringPayloadSchema = z.object({ collectedAt: z.string().datetime(), hosts: z.array(HostMonitoringRecordSchema).max(10_000) }).strict();

export type HostMonitoringMemory = z.infer<typeof HostMonitoringMemorySchema>;
export type HostMonitoringVolume = z.infer<typeof HostMonitoringVolumeSchema>;
export type HostMonitoringDisk = z.infer<typeof HostMonitoringDiskSchema>;
export type HostMonitoringRecord = z.infer<typeof HostMonitoringRecordSchema>;
export type HostMonitoringPayload = z.infer<typeof HostMonitoringPayloadSchema>;
