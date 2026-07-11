import type { OverviewNode } from "../../api/overviewApi";
import { latencyValue, uniqueSorted } from "../../utils/data";
import type { HostPageMode, HostPagePreset, HostRecord } from "./types";
import type { PageKey, Tone, ViewContext } from "../../types/app";

function hostPagePreset(page: PageKey) {
  if (page === "hosts-prod") {
    return {
      mode: "production",
      env: "生产",
      health: "全部",
      search: "",
      subtitle: "聚焦生产节点的资源水位、备份新鲜度和发布前检查。",
    } satisfies HostPagePreset;
  }
  if (page === "hosts-alert") {
    return {
      mode: "alerts",
      env: "全部",
      health: "需关注",
      search: "",
      subtitle: "按健康状态、资源水位和备份滞后组织待处理主机。",
    } satisfies HostPagePreset;
  }
  return {
    mode: "inventory",
    env: "全部",
    health: "全部",
    search: "",
    subtitle: "跨环境盘点主机资源、基础状态和常用运维操作。",
  } satisfies HostPagePreset;
}

function hostStatusTone(health: HostRecord["health"]): Tone {
  if (health === "健康") return "green";
  if (health === "警告") return "orange";
  return "red";
}

function hostResourceTone(value: string): Tone {
  const percent = percentValue(value);
  if (percent >= 80) return "red";
  if (percent >= 60) return "orange";
  return "green";
}

function hostHighestResource(row: HostRecord) {
  const resources = [
    ["CPU", row.cpu],
    ["内存", row.memory],
    ["磁盘", row.disk],
  ] as const;
  const [label, value] = [...resources].sort((left, right) => percentValue(right[1]) - percentValue(left[1]))[0];
  return `${label} ${value}`;
}

function hostPressureScore(row: HostRecord) {
  return Math.max(percentValue(row.cpu), percentValue(row.memory), percentValue(row.disk));
}

function hostNeedsAttention(row: HostRecord) {
  return row.health !== "健康" || hostHasHighResource(row) || hostHasStaleBackup(row) || !isCleanUpdate(row.update);
}

function hostHasHighResource(row: HostRecord) {
  return hostPressureScore(row) >= 70;
}

function hostHasStaleBackup(row: HostRecord) {
  return !row.backup.startsWith("今天");
}

function hostRiskReasons(row: HostRecord) {
  const reasons: string[] = [];
  if (row.health === "离线") reasons.push("节点离线");
  if (row.health === "警告") reasons.push("健康告警");
  if (hostHasHighResource(row)) reasons.push(`资源高压 ${hostHighestResource(row)}`);
  if (hostHasStaleBackup(row)) reasons.push(`备份滞后 ${row.backup}`);
  if (!isCleanUpdate(row.update)) reasons.push(row.update);
  return reasons.length > 0 ? reasons : ["监控正常"];
}

function hostServiceSummary(row: HostRecord) {
  return `${row.services.length} 个服务`;
}

function percentValue(value: string) {
  return Number(value.replace("%", "")) || 0;
}

function isCleanUpdate(value: string) {
  return ["已是最新", "已同步"].includes(value);
}

function averageLatency(nodes: OverviewNode[]) {
  const values = nodes
    .map((node) => latencyValue(node.latency))
    .filter((value): value is number => value !== null);
  if (values.length === 0) return "-";
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return `${Math.round(average)}ms`;
}

function hostViewContext(mode: HostPageMode, rows: HostRecord[], filteredRows: HostRecord[]): ViewContext {
  const productionRows = rows.filter((row) => row.env === "生产");
  const alertRows = rows.filter(hostNeedsAttention);
  if (mode === "production") {
    return {
      eyebrow: "主机 / 生产环境",
      title: "生产运行视图",
      chips: [`生产 ${productionRows.length} 台`, `告警 ${productionRows.filter(hostNeedsAttention).length} 台`, `筛选 ${filteredRows.length} 台`],
    };
  }
  if (mode === "alerts") {
    return {
      eyebrow: "主机 / 健康告警",
      title: "告警处置队列",
      chips: [`待处理 ${alertRows.length} 台`, `离线 ${rows.filter((row) => row.health === "离线").length} 台`, `当前 ${filteredRows.length} 台`],
    };
  }
  return {
    eyebrow: "主机 / 全部主机",
    title: "资源清单",
    chips: [`总数 ${rows.length} 台`, `健康 ${rows.filter((row) => row.health === "健康").length} 台`, `环境 ${uniqueSorted(rows.map((row) => row.env)).length} 个`],
  };
}

function hostMatchesHealth(row: HostRecord, healthFilter: string) {
  if (healthFilter === "全部") return true;
  if (healthFilter === "需关注") return hostNeedsAttention(row);
  return row.health === healthFilter;
}

function hostHealthOptions(mode: HostPageMode) {
  if (mode === "alerts") return ["需关注", "警告", "离线", "全部", "健康"];
  return ["全部", "健康", "警告", "离线"];
}

export { hostPagePreset, hostStatusTone, hostResourceTone, hostHighestResource, hostPressureScore, hostNeedsAttention, hostHasHighResource, hostHasStaleBackup, hostRiskReasons, hostServiceSummary, percentValue, isCleanUpdate, averageLatency, hostViewContext, hostMatchesHealth, hostHealthOptions };
