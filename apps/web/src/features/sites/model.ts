import { uniqueSorted } from "../../utils/data";
import type { SiteRuntimeGroup, SiteRuntimeView } from "./types";
import type { SiteRuntimeRecord } from "@stackpilot/contracts";
import type { PageKey, Tone } from "../../types/app";

function sitesPagePreset(page: PageKey) {
  if (page === "sites-cert") return { status: "全部", runtime: "全部", search: "", subtitle: "证书续期视图，优先展示即将过期的站点。" };
  if (page === "sites-runtime") return { status: "全部", runtime: "全部", search: "", subtitle: "服务分组视图，按 Node、PHP、静态站点聚合容量与风险。" };
  if (page === "sites-running") return { status: "活跃", runtime: "全部", search: "", subtitle: "监控正在运行或处于告警状态的站点、上游延迟和错误率。" };
  return { status: "全部", runtime: "全部", search: "", subtitle: "自动发现 Controller 本机的 Nginx 虚拟主机与证书状态。" };
}

function isSiteCertDue(site: SiteRuntimeView) {
  return site.certDays !== null && site.certDays < 14;
}

function siteStatusTone(status: SiteRuntimeView["status"]): Tone {
  if (status === "运行中") return "green";
  if (status === "告警") return "orange";
  return "gray";
}

function runtimeSiteStatusTone(status: SiteRuntimeView["status"]): Tone {
  if (status === "运行中") return "green";
  if (status === "告警") return "orange";
  return "gray";
}

function runtimeGroupHealth(group: SiteRuntimeGroup) {
  if (group.warning > 0) return { label: "告警", tone: "orange" as const };
  if (group.unknown > 0) return { label: "待确认", tone: "gray" as const };
  if (group.running === 0) return { label: "已停止", tone: "gray" as const };
  if (group.stopped > 0 || group.certDue > 0) return { label: "需关注", tone: "orange" as const };
  return { label: "健康", tone: "green" as const };
}

function siteTrafficGb(site: SiteRuntimeView) {
  return (site.trafficBytes ?? 0) / 1024 ** 3;
}

function formatTrafficGb(value: number) {
  if (value >= 1024) return `${(value / 1024).toFixed(1)} TB`;
  return `${Math.round(value)} GB`;
}

function runtimeSiteFromApi(site: SiteRuntimeRecord, collectedAt: string): SiteRuntimeView {
  const status = site.status === "running" ? "运行中" : site.status === "warning" ? "告警" : site.status === "stopped" ? "已停止" : "待采集";
  const certDays = site.certificateExpiresAt === null
    ? null
    : Math.max(0, Math.ceil((Date.parse(site.certificateExpiresAt) - Date.parse(collectedAt)) / 86_400_000));
  return {
    id: site.id, domain: site.domain, status, runtime: site.runtime, host: site.host,
    upstream: site.upstream ?? "未配置上游", source: site.source, certDays,
    certificateIssuer: site.certificateIssuer ?? "暂不可用",
    trafficBytes: site.trafficBytes,
    traffic: site.trafficBytes === null ? "暂不可用" : formatTrafficGb(site.trafficBytes / 1024 ** 3),
    latencyMs: site.latencyMs, latency: site.latencyMs === null ? "暂不可用" : `${site.latencyMs}ms`,
  };
}

function runtimeGroupsFromSites(sites: SiteRuntimeView[]): SiteRuntimeGroup[] {
  const grouped = new Map<string, SiteRuntimeView[]>();
  sites.forEach((site) => grouped.set(site.runtime, [...(grouped.get(site.runtime) ?? []), site]));
  return Array.from(grouped.entries()).map(([runtime, groupSites]) => {
    const latencySamples = groupSites.map((site) => site.latencyMs).filter((value): value is number => value !== null);
    const trafficSamples = groupSites.map((site) => site.trafficBytes).filter((value): value is number => value !== null);
    return {
      runtime,
      sites: groupSites,
      running: groupSites.filter((site) => site.status === "运行中").length,
      warning: groupSites.filter((site) => site.status === "告警").length,
      stopped: groupSites.filter((site) => site.status === "已停止").length,
      unknown: groupSites.filter((site) => site.status === "待采集").length,
      certDue: groupSites.filter((site) => site.certDays !== null && site.certDays < 14).length,
      certificateDataAvailable: groupSites.some((site) => site.certDays !== null),
      traffic: trafficSamples.length ? formatTrafficGb(trafficSamples.reduce((sum, value) => sum + value, 0) / 1024 ** 3) : "暂不可用",
      avgLatency: latencySamples.length ? `${Math.round(latencySamples.reduce((sum, value) => sum + value, 0) / latencySamples.length)}ms` : "暂不可用",
      hosts: uniqueSorted(groupSites.map((site) => site.host)).join(" / "),
    };
  }).sort((left, right) => right.sites.length - left.sites.length || left.runtime.localeCompare(right.runtime, "zh-Hans-CN"));
}

export { sitesPagePreset, isSiteCertDue, siteStatusTone, runtimeSiteStatusTone, runtimeGroupHealth, siteTrafficGb, formatTrafficGb, runtimeSiteFromApi, runtimeGroupsFromSites };
