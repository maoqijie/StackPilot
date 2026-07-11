import type { DatabaseInstance } from "./types";
import type { Tone } from "../../types/app";

const slowRemediationStorageKey = "stackpilot.slow-remediation-ids";

function readSlowRemediationIds() {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(slowRemediationStorageKey) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function writeSlowRemediationIds(ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(slowRemediationStorageKey, JSON.stringify(ids));
  } catch {
    // Local storage can be unavailable in restricted browser contexts.
  }
}

function databaseHealthTone(instance: DatabaseInstance): Tone {
  return instance.connectionHealth.startsWith("延迟") ? "orange" : "green";
}

function databaseBackupTone(status: DatabaseInstance["backupStatus"]): Tone {
  if (status === "失败") return "red";
  if (status === "等待确认" || status === "运行中") return "orange";
  return "green";
}

export { databaseBackupTone, databaseHealthTone, readSlowRemediationIds, slowRemediationStorageKey, writeSlowRemediationIds };
