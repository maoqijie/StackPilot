import {
  Activity, CheckCircle2, CircleHelp, CircleStop, Clock3, Code2, Eye, Globe2,
  Info, Server, Shield, ShieldAlert, TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchSites } from "../api/sitesApi";
import type { SiteRuntimePayload } from "../api/sitesApi";
import { resolvePageMeta } from "../app/navigation";
import { ModulePageShell } from "../components/layout/ModulePageShell";
import { MetricTile, ModuleSearch } from "../components/ui/Cards";
import { DataTable } from "../components/ui/DataTable";
import type { TableColumn } from "../components/ui/DataTable";
import { DetailDrawer } from "../components/ui/DetailDrawer";
import { FieldSelect } from "../components/ui/FormControls";
import { StatusDot, StatusLight } from "../components/ui/StatusVisuals";
import {
  isSiteCertDue, runtimeGroupHealth, runtimeGroupsFromSites, runtimeSiteFromApi,
  siteStatusTone, siteTrafficGb, sitesPagePreset,
} from "../features/sites/model";
import type { SiteRuntimeGroup, SiteRuntimeView } from "../features/sites/types";
import { useAutoRefresh } from "../hooks/useAutoRefresh";
import type { Notify, PageKey, ViewContext } from "../types/app";
import { uniqueSorted } from "../utils/data";
import { formatBackendDateTime } from "../utils/time";

type SiteMode = "inventory" | "running" | "cert" | "runtime";

function SitesPage({ page, notify }: { page: PageKey; notify: Notify }) {
  const preset = sitesPagePreset(page);
  const mode: SiteMode = page === "sites-runtime" ? "runtime" : page === "sites-cert" ? "cert" : page === "sites-running" ? "running" : "inventory";
  const [rows, setRows] = useState<SiteRuntimeView[]>([]);
  const [searchByPage, setSearchByPage] = useState<Record<string, string>>({});
  const [statusByPage, setStatusByPage] = useState<Record<string, string>>({});
  const [runtimeByPage, setRuntimeByPage] = useState<Record<string, string>>({});
  const [certRiskByPage, setCertRiskByPage] = useState<Record<string, string>>({});
  const [selectedRuntime, setSelectedRuntime] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collectedAt, setCollectedAt] = useState("等待后端采集");
  const [collectionStatus, setCollectionStatus] = useState<SiteRuntimePayload["collectionStatus"] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const requestRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const hasDataRef = useRef(false);

  const loadSites = useCallback((externalSignal?: AbortSignal, silent = false) => {
    if (inFlightRef.current) return inFlightRef.current;
    if (!silent) { setLoading(true); setError(null); }
    const controller = new AbortController();
    const abort = () => controller.abort();
    externalSignal?.addEventListener("abort", abort, { once: true });
    requestRef.current = controller;
    const request = fetchSites(controller.signal)
      .then((payload) => {
        if (controller.signal.aborted) return;
        hasDataRef.current = true;
        const nextRows = payload.sites.map((site) => runtimeSiteFromApi(site, payload.collectedAt));
        setRows(nextRows);
        setSelectedRuntime((current) => current && nextRows.some((row) => row.runtime === current) ? current : null);
        setCollectedAt(formatBackendDateTime(payload.collectedAt));
        setCollectionStatus(payload.collectionStatus);
        setWarnings(payload.warnings);
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) return;
        if (!silent || !hasDataRef.current) {
          const message = loadError instanceof Error ? loadError.message : "站点监控后端加载失败";
          setError(message);
          if (!silent) notify(message, "danger");
        }
      })
      .finally(() => {
        externalSignal?.removeEventListener("abort", abort);
        if (requestRef.current === controller) requestRef.current = null;
        if (inFlightRef.current === request) inFlightRef.current = null;
        if (!controller.signal.aborted && !silent) setLoading(false);
      });
    inFlightRef.current = request;
    return request;
  }, [notify]);

  useEffect(() => {
    let disposed = false;
    queueMicrotask(() => { if (!disposed) void loadSites(); });
    return () => { disposed = true; requestRef.current?.abort(); };
  }, [loadSites]);
  useAutoRefresh((signal) => loadSites(signal, true), undefined, !loading);

  const search = searchByPage[page] ?? preset.search;
  const statusFilter = statusByPage[page] ?? preset.status;
  const runtimeFilter = runtimeByPage[page] ?? preset.runtime;
  const certRiskFilter = certRiskByPage[page] ?? "全部风险";
  const runtimeOptions = ["全部", ...uniqueSorted(rows.map((row) => row.runtime))];
  const filteredRows = rows.filter((row) => {
    const query = search.trim().toLowerCase();
    const matchSearch = !query || [row.domain, row.runtime, row.host, row.upstream, row.source].join(" ").toLowerCase().includes(query);
    const matchStatus = statusFilter === "全部"
      || (statusFilter === "活跃" ? row.status === "运行中" || row.status === "告警" : row.status === statusFilter);
    const matchRisk = mode !== "cert" || certRiskFilter === "全部风险"
      || (certRiskFilter === "7 天内" ? row.certDays !== null && row.certDays <= 7 : row.certDays !== null && row.certDays > 7);
    return matchSearch && matchStatus && matchRisk && (runtimeFilter === "全部" || row.runtime === runtimeFilter);
  });
  const certDueRows = rows.filter(isSiteCertDue);
  const displayedRows = mode === "cert"
    ? filteredRows.filter(isSiteCertDue).sort((left, right) => (left.certDays ?? 14) - (right.certDays ?? 14))
    : filteredRows;
  const runtimeGroups = runtimeGroupsFromSites(filteredRows);
  const selectedGroup = selectedRuntime ? runtimeGroupsFromSites(rows).find((group) => group.runtime === selectedRuntime) ?? null : null;
  const latencySamples = filteredRows.map((row) => row.latencyMs).filter((value): value is number => value !== null);
  const averageLatency = latencySamples.length
    ? `${Math.round(latencySamples.reduce((sum, value) => sum + value, 0) / latencySamples.length)}ms`
    : "暂不可用";
  const certDataAvailable = rows.some((row) => row.certDays !== null);
  const unknownCertCount = rows.filter((row) => row.certDays === null).length;

  const siteStatus = (row: SiteRuntimeView) => {
    const Icon = row.status === "运行中" ? CheckCircle2 : row.status === "告警" ? TriangleAlert : row.status === "已停止" ? CircleStop : CircleHelp;
    return <span className={`site-status ${siteStatusTone(row.status)}`}><Icon size={14} aria-hidden="true" /><span>{row.status}</span></span>;
  };
  const siteIdentity = (row: SiteRuntimeView) => <span className="site-domain" title={row.domain}><Globe2 size={14} aria-hidden="true" /><b>{row.domain}</b></span>;
  const certificateCell = (row: SiteRuntimeView) => row.certDays === null
    ? <span className="gray-text">暂不可用</span>
    : <span className={isSiteCertDue(row) ? "orange-text" : "green-text"}>{row.certDays} 天</span>;
  const certRisk = (row: SiteRuntimeView) => {
    const critical = (row.certDays ?? 14) <= 7;
    const Icon = critical ? ShieldAlert : TriangleAlert;
    return <span className={`cert-risk ${critical ? "is-critical" : "is-warning"}`}><Icon size={16} /><b>{critical ? "紧急" : "临近到期"}</b><em>{row.certDays} 天</em></span>;
  };

  const context: ViewContext = mode === "runtime"
    ? { eyebrow: "网站 / 运行时分组", title: "运行时容量视图", chips: [`分组 ${runtimeGroups.length} 个`, `站点 ${filteredRows.length} 个`, `待采集 ${filteredRows.filter((row) => row.status === "待采集").length} 个`] }
    : mode === "cert"
      ? { eyebrow: "网站 / 证书续期", title: "证书风险监控", chips: [`风险 ${certDueRows.length} 个`, `7 天内 ${certDueRows.filter((row) => (row.certDays ?? 8) <= 7).length} 个`, `证书不可用 ${unknownCertCount} 个`] }
      : mode === "running"
        ? { eyebrow: "网站 / 运行中站点", title: "运行态监控", chips: [`运行中 ${filteredRows.filter((row) => row.status === "运行中").length} 个`, `告警 ${filteredRows.filter((row) => row.status === "告警").length} 个`, `待采集 ${rows.filter((row) => row.status === "待采集").length} 个`] }
        : { eyebrow: "网站 / 默认视图", title: "站点资产清单", chips: [`总数 ${rows.length} 个`, `运行中 ${rows.filter((row) => row.status === "运行中").length} 个`, `证书风险 ${certDueRows.length} 个`] };
  const metrics = mode === "runtime" ? <><MetricTile icon={Code2} label="运行时组" value={`${runtimeGroups.length}`} tone="blue" /><MetricTile icon={Globe2} label="覆盖站点" value={`${filteredRows.length}`} tone="green" /><MetricTile icon={Shield} label="证书风险" value={certDataAvailable ? `${filteredRows.filter(isSiteCertDue).length}` : "暂不可用"} tone="orange" /></>
    : mode === "cert" ? <><MetricTile icon={Shield} label="待续期" value={certDataAvailable ? `${certDueRows.length}` : "暂不可用"} tone="orange" /><MetricTile icon={Clock3} label="7 天内" value={certDataAvailable ? `${certDueRows.filter((row) => (row.certDays ?? 8) <= 7).length}` : "暂不可用"} tone="red" /><MetricTile icon={CircleHelp} label="证书不可用" value={`${unknownCertCount}`} tone="orange" /></>
      : mode === "running" ? <><MetricTile icon={Activity} label="活跃站点" value={`${filteredRows.length}`} tone="green" /><MetricTile icon={Clock3} label="平均延迟" value={averageLatency} tone="blue" /><MetricTile icon={Shield} label="异常站点" value={`${filteredRows.filter((row) => row.status === "告警").length}`} tone="orange" /></>
        : <><MetricTile icon={Globe2} label="站点" value={`${rows.length}`} tone="blue" /><MetricTile icon={CheckCircle2} label="运行中" value={`${rows.filter((row) => row.status === "运行中").length}`} tone="green" /><MetricTile icon={Shield} label="证书告警" value={certDataAvailable ? `${certDueRows.length}` : "暂不可用"} tone="orange" /></>;

  const siteColumns: Array<TableColumn<SiteRuntimeView>> = mode === "running" ? [
    { key: "domain", label: "域名", width: "208px", render: siteIdentity },
    { key: "status", label: "状态", width: "96px", render: siteStatus },
    { key: "upstream", label: "上游", width: "180px", render: (row) => <code className="site-truncate" title={row.upstream}>{row.upstream}</code> },
    { key: "latency", label: "延迟", width: "104px", sortValue: (row) => row.latencyMs, render: (row) => <span className={row.latencyMs === null ? "gray-text" : row.latencyMs > 120 ? "orange-text" : "green-text"}>{row.latency}</span> },
    { key: "traffic", label: "流量", width: "112px", sortValue: (row) => row.trafficBytes, render: (row) => row.traffic },
    { key: "host", label: "主机", width: "160px", render: (row) => <span className="site-truncate" title={row.host}>{row.host}</span> },
    { key: "source", label: "数据源", render: (row) => row.source },
  ] : mode === "cert" ? [
    { key: "risk", label: "风险", width: "124px", sortValue: (row) => row.certDays, render: certRisk },
    { key: "domain", label: "域名", width: "260px", render: (row) => <span className="cert-domain"><b title={row.domain}>{row.domain}</b><small>{row.host}</small></span> },
    { key: "issuer", label: "签发方", width: "180px", render: (row) => row.certificateIssuer },
    { key: "runtime", label: "运行时", width: "152px", render: (row) => row.runtime },
    { key: "status", label: "站点状态", width: "104px", render: siteStatus },
    { key: "source", label: "数据源", render: (row) => row.source },
  ] : [
    { key: "domain", label: "域名", width: "208px", render: siteIdentity },
    { key: "status", label: "状态", width: "96px", render: siteStatus },
    { key: "runtime", label: "运行时", width: "152px", render: (row) => row.runtime },
    { key: "host", label: "主机", width: "160px", render: (row) => <span className="site-truncate" title={row.host}>{row.host}</span> },
    { key: "cert", label: "证书", width: "112px", sortValue: (row) => row.certDays, render: certificateCell },
    { key: "traffic", label: "流量", width: "112px", sortValue: siteTrafficGb, render: (row) => row.traffic },
    { key: "source", label: "数据源", render: (row) => row.source },
  ];
  const runtimeColumns: Array<TableColumn<SiteRuntimeGroup>> = [
    { key: "runtime", label: "运行时", width: "176px", render: (group) => <span className="runtime-group-title"><Code2 size={16} /> <b>{group.runtime}</b></span> },
    { key: "health", label: "健康状态", width: "104px", render: (group) => { const health = runtimeGroupHealth(group); return <StatusDot tone={health.tone} text={health.label} />; } },
    { key: "sites", label: "站点容量", width: "104px", sortValue: (group) => group.sites.length, render: (group) => <strong>{group.sites.length} 个</strong> },
    { key: "running", label: "运行态", width: "208px", render: (group) => <span className="runtime-state-summary"><span><CheckCircle2 size={14} />{group.running} 运行</span><span className={group.warning + group.unknown ? "orange-text" : "gray-text"}><TriangleAlert size={14} />{group.warning + group.unknown} 关注</span><span className="gray-text"><CircleStop size={14} />{group.stopped} 停止</span></span> },
    { key: "hosts", label: "主机", width: "160px", render: (group) => <span className="runtime-hosts" title={group.hosts}>{group.hosts || "暂不可用"}</span> },
    { key: "traffic", label: "总流量", width: "112px", render: (group) => group.traffic },
    { key: "latency", label: "均延迟", width: "104px", render: (group) => group.avgLatency },
    { key: "ops", label: "详情", width: "64px", render: (group) => <span className="table-icon-actions"><button type="button" title="查看详情" aria-label={`查看 ${group.runtime} 运行时详情`} onClick={() => setSelectedRuntime(group.runtime)}><Eye size={16} /></button></span> },
  ];

  const statusLabel = collectionStatus === "complete" ? "采集完整" : collectionStatus === "partial" ? "部分采集" : collectionStatus === "unavailable" ? "采集不可用" : "等待采集";
  const emptyText = error ? "实时采集失败，未显示示例站点" : loading ? "正在采集站点状态" : mode === "cert" ? "没有已发现的近期证书风险" : "未发现匹配的 Nginx 站点，系统将继续自动采集";

  return <ModulePageShell
    title={resolvePageMeta(page).title}
    subtitle={loading ? "正在采集站点运行状态" : `${preset.subtitle} · 后端采集于 ${collectedAt}`}
    page={page}
    viewContext={context}
    filters={mode === "cert" ? <><ModuleSearch value={search} placeholder="搜索域名、主机或数据源" onChange={(value) => setSearchByPage((current) => ({ ...current, [page]: value }))} /><FieldSelect label="风险" value={certRiskFilter} options={["全部风险", "7 天内", "8-13 天"]} onChange={(value) => setCertRiskByPage((current) => ({ ...current, [page]: value }))} /><FieldSelect label="运行时" value={runtimeFilter} options={runtimeOptions} onChange={(value) => setRuntimeByPage((current) => ({ ...current, [page]: value }))} /></> : <><ModuleSearch value={search} placeholder="搜索域名、上游、主机或数据源" onChange={(value) => setSearchByPage((current) => ({ ...current, [page]: value }))} /><FieldSelect label="状态" value={statusFilter} options={mode === "running" ? ["活跃", "运行中", "告警"] : ["全部", "运行中", "告警", "已停止", "待采集"]} onChange={(value) => setStatusByPage((current) => ({ ...current, [page]: value }))} /><FieldSelect label="运行时" value={runtimeFilter} options={runtimeOptions} onChange={(value) => setRuntimeByPage((current) => ({ ...current, [page]: value }))} /></>}
    metrics={metrics}
    side={selectedGroup ? <DetailDrawer className="runtime-detail-drawer" title={selectedGroup.runtime} subtitle={`${selectedGroup.sites.length} 个站点 · ${selectedGroup.hosts || "主机暂不可用"}`} onClose={() => setSelectedRuntime(null)}><div className="runtime-detail-status">{(() => { const health = runtimeGroupHealth(selectedGroup); return <><StatusLight tone={health.tone} /><span><small>运行时状态</small><strong>{health.label}</strong></span></>; })()}</div><section className="runtime-detail-section"><header><Activity size={17} /><strong>容量与风险</strong></header><div className="detail-kv runtime-detail-facts"><p><span>运行站点</span><b>{selectedGroup.running} 个</b></p><p><span>告警站点</span><b>{selectedGroup.warning} 个</b></p><p><span>待采集</span><b>{selectedGroup.unknown} 个</b></p><p><span>证书风险</span><b>{selectedGroup.certificateDataAvailable ? `${selectedGroup.certDue} 个` : "暂不可用"}</b></p><p><span>总流量</span><b>{selectedGroup.traffic}</b></p><p><span>平均延迟</span><b>{selectedGroup.avgLatency}</b></p></div></section><section className="runtime-detail-section"><header><Server size={17} /><strong>站点实例</strong><span>{selectedGroup.sites.length} 个</span></header><div className="runtime-site-list">{selectedGroup.sites.map((site) => <article key={site.id}><StatusLight tone={siteStatusTone(site.status)} /><span><strong title={site.domain}>{site.domain}</strong><small>{site.host} · {site.upstream}</small></span><span><b>{site.status}</b><small>{site.latency} · {site.source}</small></span></article>)}</div></section></DetailDrawer> : null}
  >
    {loading && <span className="sr-only" role="status" aria-live="polite">正在从 /api/sites 实时采集站点状态</span>}
    {error && <div className="overview-error-state"><Shield size={18} /><span>{error}</span><button type="button" disabled={loading} onClick={() => void loadSites()}>重试</button></div>}
    {!error && !loading && <div className="runtime-collection-note" role="status"><Info size={16} /><span><strong>数据来源：Controller 本机 Nginx 配置与回环探测</strong><small>{statusLabel} · 后端采集于 {collectedAt}{warnings.length ? ` · ${warnings[0]}` : ""}</small></span></div>}
    {mode === "runtime"
      ? <DataTable columns={runtimeColumns} rows={runtimeGroups} emptyText={emptyText} getRowKey={(group) => group.runtime} mobileCard={(group) => <RuntimeMobileCard group={group} onOpen={setSelectedRuntime} />} />
      : <DataTable columns={siteColumns} rows={displayedRows} emptyText={emptyText} getRowKey={(row) => row.id} mobileCard={(row) => <SiteMobileCard row={row} mode={mode} status={siteStatus} />} />}
  </ModulePageShell>;
}

function RuntimeMobileCard({ group, onOpen }: { group: SiteRuntimeGroup; onOpen: (runtime: string) => void }) {
  const health = runtimeGroupHealth(group);
  return <><div className="module-card-head"><span className="module-card-title"><Code2 size={16} /><b>{group.runtime}</b></span><StatusDot tone={health.tone} text={health.label} /></div><div className="module-card-meta"><span><b>站点容量</b><em>{group.sites.length} 个</em></span><span><b>运行 / 关注 / 停止</b><em>{group.running} / {group.warning + group.unknown} / {group.stopped}</em></span><span><b>流量 / 延迟</b><em>{group.traffic} / {group.avgLatency}</em></span><span><b>证书风险</b><em>{group.certificateDataAvailable ? `${group.certDue} 个` : "暂不可用"}</em></span></div><div className="module-card-footer"><button className="ghost small" type="button" onClick={() => onOpen(group.runtime)}><Eye size={15} /> 查看详情</button></div></>;
}

function SiteMobileCard({ row, mode, status }: { row: SiteRuntimeView; mode: SiteMode; status: (row: SiteRuntimeView) => React.ReactNode }) {
  return <><div className="module-card-head"><span className="module-card-title site-mobile-domain"><Globe2 size={16} aria-hidden="true" /><b title={row.domain}>{row.domain}</b></span>{status(row)}</div><code className="module-card-code" title={mode === "running" ? row.upstream : row.host}>{mode === "running" ? row.upstream : row.host}</code><div className="module-card-meta"><span><b>运行时</b><em>{row.runtime}</em></span><span><b>{mode === "running" ? "延迟" : "证书"}</b><em>{mode === "running" ? row.latency : row.certDays === null ? "暂不可用" : `${row.certDays} 天`}</em></span><span><b>流量</b><em>{row.traffic}</em></span><span><b>数据源</b><em>{row.source}</em></span></div></>;
}

export { SitesPage };
