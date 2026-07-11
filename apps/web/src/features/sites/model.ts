import { latencyValue, uniqueSorted } from "../../utils/data";
import type { SiteRecord, SiteRuntimeGroup } from "./types";
import type { PageKey, Tone } from "../../types/app";

function sitesPagePreset(page: PageKey) {
  if (page === "sites-cert") return { status: "全部", runtime: "全部", search: "", subtitle: "证书续期视图，优先展示即将过期的站点。" };
  if (page === "sites-runtime") return { status: "全部", runtime: "全部", search: "", subtitle: "运行时分组视图，按 Node、PHP、静态站点聚合容量与风险。" };
  return { status: page === "sites-running" ? "运行中" : "全部", runtime: "全部", search: "", subtitle: "管理域名、运行时、证书有效期和站点启停状态。" };
}

function isSiteCertDue(site: SiteRecord) {
  return site.certDays < 14;
}

function siteStatusTone(status: SiteRecord["status"]): Tone {
  if (status === "运行中") return "green";
  if (status === "告警") return "orange";
  return "gray";
}

function siteTrafficGb(site: SiteRecord) {
  const match = site.traffic.trim().match(/^(-?\d+(?:\.\d+)?)\s*(GB|MB|TB)$/i);
  if (!match) return 0;
  const amount = Number(match[1]);
  const unit = match[2].toUpperCase();
  if (unit === "TB") return amount * 1024;
  if (unit === "MB") return amount / 1024;
  return amount;
}

function formatTrafficGb(value: number) {
  if (value >= 1024) return `${(value / 1024).toFixed(1)} TB`;
  return `${Math.round(value)} GB`;
}

function runtimeGroupsFromSites(sites: SiteRecord[]): SiteRuntimeGroup[] {
  const grouped = new Map<string, SiteRecord[]>();
  sites.forEach((site) => grouped.set(site.runtime, [...(grouped.get(site.runtime) ?? []), site]));
  return Array.from(grouped.entries()).map(([runtime, groupSites]) => {
    const latencySamples = groupSites.map((site) => latencyValue(site.latency)).filter((value): value is number => value !== null);
    const traffic = groupSites.reduce((sum, site) => sum + siteTrafficGb(site), 0);
    return {
      runtime,
      sites: groupSites,
      running: groupSites.filter((site) => site.status === "运行中").length,
      warning: groupSites.filter((site) => site.status === "告警").length,
      stopped: groupSites.filter((site) => site.status === "已停止").length,
      certDue: groupSites.filter(isSiteCertDue).length,
      traffic: formatTrafficGb(traffic),
      avgLatency: latencySamples.length ? `${Math.round(latencySamples.reduce((sum, value) => sum + value, 0) / latencySamples.length)}ms` : "-",
      hosts: uniqueSorted(groupSites.map((site) => site.host)).join(" / "),
    };
  }).sort((left, right) => right.sites.length - left.sites.length || left.runtime.localeCompare(right.runtime, "zh-Hans-CN"));
}

export { sitesPagePreset, isSiteCertDue, siteStatusTone, siteTrafficGb, formatTrafficGb, runtimeGroupsFromSites };
