import type { CertificateRenewalBatch } from "../../api/sitesApi";
import type { SiteRuntimeView } from "./types";

const terminalBatchStatuses = new Set<CertificateRenewalBatch["status"]>(["succeeded", "failed", "partially_succeeded", "cancelled", "expired"]);

function certificateRiskLabel(site: SiteRuntimeView) {
  if (site.certificate.status === "expired") return "已过期";
  if (site.certificate.status === "critical") return "紧急";
  if (site.certificate.status === "expiring") return "临近到期";
  if (site.certificate.status === "valid") return "有效";
  return "不可用";
}

function certificateRiskTone(site: SiteRuntimeView) {
  if (["expired", "critical"].includes(site.certificate.status)) return "is-critical";
  if (site.certificate.status === "expiring") return "is-warning";
  if (site.certificate.status === "valid") return "is-valid";
  return "is-unavailable";
}

function certificateRemainingLabel(site: SiteRuntimeView) {
  if (site.certDays === null) return "到期时间不可用";
  if (site.certDays < 0) return `已过期 ${Math.abs(site.certDays)} 天`;
  if (site.certDays === 0) return "今天到期";
  return `${site.certDays} 天`;
}

function freshnessLabel(site: SiteRuntimeView) {
  if (site.freshness === "current") return "数据新鲜";
  if (site.freshness === "stale") return "快照已过期";
  return "等待采集";
}

function renewalModeLabel(site: SiteRuntimeView) {
  if (site.certificate.renewalMode === "automatic") return "Certbot 自动续期";
  if (site.certificate.renewalMode === "manual") return "手动管理";
  return "不支持续期";
}

function renewalStatusLabel(status: SiteRuntimeView["renewal"]["status"] | CertificateRenewalBatch["status"]) {
  const labels: Record<string, string> = {
    idle: "未执行", queued: "排队中", running: "执行中", partially_succeeded: "部分成功",
    succeeded: "成功", failed: "失败", cancelled: "已取消", expired: "已过期",
  };
  return labels[status] ?? status;
}

function batchIsTerminal(batch: CertificateRenewalBatch | null) {
  return Boolean(batch && terminalBatchStatuses.has(batch.status));
}

function formatFingerprint(value: string | null) {
  if (!value) return "暂不可用";
  return value.match(/.{1,4}/g)?.join(" ") ?? value;
}

export {
  batchIsTerminal,
  certificateRemainingLabel,
  certificateRiskLabel,
  certificateRiskTone,
  formatFingerprint,
  freshnessLabel,
  renewalModeLabel,
  renewalStatusLabel,
};
