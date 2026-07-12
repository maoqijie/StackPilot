import { latencyValue, uniqueSorted } from "../../utils/data";
import type { HostView } from "./viewModel";
import type { HostPageMode, HostPagePreset } from "./types";
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

function hostStatusTone(status: HostView["status"]): Tone {
  if (status === "健康") return "green";
  if (status === "警告") return "orange";
  return "gray";
}

function hostResourceTone(value: number | null): Tone {
  if (value === null) return "gray";
  const percent = value;
  if (percent >= 80) return "red";
  if (percent >= 60) return "orange";
  return "green";
}

function hostHighestResource(row: HostView) {
  const resources: Array<[string, number | null]> = [
    ["CPU", row.cpu],
    ["内存", row.memory],
    ["磁盘", row.disk],
  ];
  const available = resources.filter((item): item is [string, number] => item[1] !== null);
  if (available.length === 0) return "等待采集";
  const [label, value] = available.sort((left, right) => right[1] - left[1])[0];
  return `${label} ${Math.round(value)}%`;
}

function hostPressureScore(row: HostView) {
  return Math.max(row.cpu ?? 0, row.memory ?? 0, row.disk ?? 0);
}

function hostNeedsAttention(row: HostView) {
  return ["警告", "离线"].includes(row.status) || hostHasHighResource(row) || hostHasStaleBackup(row);
}

function hostHasHighResource(row: HostView) {
  return hostPressureScore(row) >= 70;
}

function hostHasStaleBackup(row: HostView) {
  return row.backupStatus === "警告";
}

function hostRiskReasons(row: HostView) {
  const reasons: string[] = [];
  if (row.status === "待连接") reasons.push("等待首次连接");
  if (row.status === "离线") reasons.push("节点离线");
  if (row.status === "未知") reasons.push("等待遥测");
  if (row.status === "警告") reasons.push("健康告警");
  if (hostHasHighResource(row)) reasons.push(`资源高压 ${hostHighestResource(row)}`);
  if (hostHasStaleBackup(row)) reasons.push(`备份滞后 ${row.backup}`);
  return reasons.length > 0 ? reasons : ["监控正常"];
}

function hostServiceSummary(row: HostView) {
  return `${row.services.length} 个服务`;
}

function percentValue(value: string | number | null) {
  if (typeof value === "number") return value;
  return value ? Number(value.replace("%", "")) || 0 : 0;
}

function isCleanUpdate(value: string) {
  return ["已是最新", "已同步"].includes(value);
}

function averageLatency(nodes: Array<{ latency: string }>) {
  const values = nodes.map((node) => latencyValue(node.latency)).filter((value): value is number => value !== null);
  if (values.length === 0) return "-";
  return `${Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)}ms`;
}

function hostViewContext(mode: HostPageMode, rows: HostView[], filteredRows: HostView[]): ViewContext {
  const productionRows = rows.filter((row) => row.env === "生产");
  const alertRows = rows.filter(hostNeedsAttention);
  if (mode === "production") {
    return {
      eyebrow: "主机 / 生产环境",
      title: "生产运行视图",
      chips: [`生产 ${productionRows.length} 台`, `需关注 ${productionRows.filter(hostNeedsAttention).length} 台`, `当前 ${filteredRows.length} 台`],
    };
  }
  if (mode === "alerts") {
    return {
      eyebrow: "主机 / 健康告警",
      title: "告警处置队列",
      chips: [`待处理 ${alertRows.length} 台`, `离线 ${rows.filter((row) => row.status === "离线").length} 台`, `当前 ${filteredRows.length} 台`],
    };
  }
  return {
    eyebrow: "主机 / 全部主机",
    title: "资源清单",
    chips: [`总数 ${rows.length} 台`, `健康 ${rows.filter((row) => row.status === "健康").length} 台`, `环境 ${uniqueSorted(rows.map((row) => row.env)).length} 个`],
  };
}

function hostMatchesHealth(row: HostView, healthFilter: string) {
  if (healthFilter === "全部") return true;
  if (healthFilter === "需关注") return hostNeedsAttention(row);
  return row.status === healthFilter;
}

function hostHealthOptions(mode: HostPageMode) {
  if (mode === "alerts") return ["需关注", "离线", "警告", "全部", "健康", "未知", "待连接"];
  return ["全部", "健康", "警告", "未知", "待连接", "离线"];
}

export { hostPagePreset, hostStatusTone, hostResourceTone, hostHighestResource, hostPressureScore, hostNeedsAttention, hostHasHighResource, hostHasStaleBackup, hostRiskReasons, hostServiceSummary, percentValue, isCleanUpdate, averageLatency, hostViewContext, hostMatchesHealth, hostHealthOptions };
